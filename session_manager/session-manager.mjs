/**
 * dsh-session-manager —— 会话批量管理（真正的删除，不是归档）
 * ================================================================
 *
 * 官方 dsh の会话管理只有「归档」：workspaceRegistry.archiveSession() 只是把
 * 会话 id 塞进注册表的一个全局集合，会话日志文件原封不动地留在
 * `~/.dsh/sessions/<工作区>/<会话>/` 里继续占盘。这个插件补上「删除」：
 * 显示层（侧边栏）把会话从工作区记账里摘掉，**同时**把落盘的
 * `session.v4.jsonl.zstd` 等日志文件连同目录一起删掉，不可恢复。
 *
 * 做成 host 半边（这里）+ Web 半边（lib/client.js）的组合包：
 *
 *   * 设置页新增「会话管理」一节（浏览器半边注册 settings.section）；
 *   * 本半边注册四条走 connection 鉴权通道的 HTTP 接口：
 *       GET  /api/session-mgr.overview      全部工作区 + 全部已存储会话的清点
 *       POST /api/session-mgr.titles        批量补会话标题（按需、分批调）
 *       POST /api/session-mgr.delete        批量 / 单条删除会话
 *       POST /api/session-mgr.delete-workspace  删除整个工作区（登记 + 全部会话日志）
 *       POST /api/session-mgr.open-dir      在系统文件管理器里打开会话保存目录
 *
 * -----------------------------------------------------------------------
 * 关键实现约定（每一处都对着宿主源码核对过，别想当然改）
 *
 * **会话在磁盘上的位置**：jsonl 后端按
 *   `<root>/<projectKey(header.cwd)>/<encodeSegment(id)>/session.v4.jsonl.zstd`
 *   存放（dsh-session-persistence-jsonl 的 projectDir/sessionDir/encodeSegment，
 *   0.2.0-rc.2 与 0.1.5 实现一致）。删一个会话 = 删它那一整个目录（把历史
 *   世代 session.v1/v2/v3、锁文件一并带走）。定位有两条路：
 *     1. 首选 ctx.sessionPersistence.locate({id, cwd})（诊断钩子，返回日志文件
 *        绝对路径）——宿主后端自己算的路径，永远对；
 *     2. 兜底：拷贝 projectKey/encodeSegment 在本文件里重算（防止 locate 在
 *        某个版本上不可用）。
 *
 * **注册表必须走官方 API**，不能手改 `~/.dsh/storages/workspace.json`：注册表
 * 是 workspaceRegistry（dsh-workspace）在内存里持有的 domain，自己写文件会被
 * 它的下一次写回覆盖。摘会话用：
 *   * workspaceRegistry.unpinSession(id)    —— 置顶集合里摘掉
 *   * workspaceRegistry.unarchiveSession(id)—— 归档集合里摘掉
 *   * workspace 实体 .detachSession(id)      —— 工作区记账号里摘掉
 *   * workspaceRegistry.delete(wsId)         —— 删除工作区登记（保留项目和日志；
 *     「删除整个工作区」里我们在它之前先把日志删了）
 * 这些写全走 domain 的单一写链（enqueueOperation 串行化），崩溃恢复和
 * 校验（validateStoredState/sentinel）都是宿主自己的逻辑。
 *
 * **顺序：先注册表、后文件**。反过来的话，进程中途挂掉会留下注册表里
 * 指向不存在会话的僵死 id（宿主启动时会 warn 但不清理）；而注册表先清
 * 干净，剩下的只是几个孤儿文件，再删一遍就没了，注册表永远一致。
 *
 * **活跃会话拒删**：ctx.get('sessions') 里有（本 process 正打开着），或
 * workspace/session-activity waterfall 有活动（运行中的 turn / job / 定时任务 /
 * 子代理，和官方 archiveSession 同一判据）。硬删进行中的会话会撕裂日志。
 *
 * **projection cache 顺带清理**：`<DSH_HOME>/storages/session_projcache/sessions/<id>.json`
 * 是宿主给会话缓存的投影检查点，删会话时一并删掉，不留死缓存。
 * DSH_HOME 的解析顺序：$DSH_HOME > 会话根的上一级（sessions 目录和 storages
 * 是 ~/.dsh 下的兄弟目录）> ~/.dsh。三选一挑存在的目录。
 *
 * **locate() 不存在时的兜底路径**（与后端逐字符一致，改一处两边就分叉）：
 *   D:\Project\x           →  --D-Project-x--
 *   无 cwd 的会话           →  _no-cwd
 *   D:\Project\path(1)      →  --D-Project-path~0028 1~0029--（不安全字符转 ~XXXX）
 *   id / 文件名同理按段转义。
 *
 * **任何异常都不外抛**：插件崩了不能连带 dsh 起不来（usage 插件的家规），
 * 每个入口 try/catch，接口失败按 500 返回错误文本。
 *
 * 环境变量：
 *   DSH_SESSION_MANAGER_QUIET=1   不打启动横幅
 */

import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { mkdir, readdir, rm, stat, rmdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/** 稳定的 cordis 插件名（profile 插件树里是 dsh-session-manager 条目）。 */
export const name = 'session-manager'

const TAG = '[dsh-session-manager]'

/** 关掉启动横幅。 */
const QUIET = (process.env.DSH_SESSION_MANAGER_QUIET ?? '') === '1'

/* ------------------------------- 路由 ---------------------------------- */

const ROUTE_OVERVIEW = '/api/session-mgr.overview'
const ROUTE_TITLES = '/api/session-mgr.titles'
const ROUTE_DELETE = '/api/session-mgr.delete'
const ROUTE_DELETE_WS = '/api/session-mgr.delete-workspace'
const ROUTE_OPEN_DIR = '/api/session-mgr.open-dir'

/** titles 接口单次最多接受的 id 数：一次翻全部日志对大库不友好，分批来。 */
const TITLES_BATCH_LIMIT = 200

/**---------------------------------------------------------------
 * 与 dsh-session-persistence-jsonl 逐字符对齐的路径编码
 *（只在 locate() 不可用、或需要算「工作区的会话目录」时使用）
 *--------------------------------------------------------------*/
function encodeSegment(raw) {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

/** 工作区路径 → 人类可读的存储目录段（D:\Project\x → --D-Project-x--）。 */
function projectKeyOf(cwd) {
  if (cwd.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i += 1) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

/*---------------------------------------------------------------
 * 存储布局探测
 *--------------------------------------------------------------*/

/**
 * 会话存储根（宿主 jsonl 后端的 root，如 ~/.dsh/sessions）。
 * @returns {string|null}
 */
function persistenceRoot(persistence) {
  try {
    if (typeof persistence?.root === 'string' && persistence.root.length > 0) {
      return resolve(persistence.root)
    }
  } catch {
    // fallthrough
  }
  return null
}

/**
 * 某个会话的落盘目录（不带斜杠结尾）。优先用后端自己的 locate()。
 * 不存在时返回 null（比如「刚建还没落盘」的空会话）——由调用方决定要不要 bootstrap。
 * @param header - SessionHeader（带 id/cwd）
 */
function sessionDirOf(persistence, header) {
  try {
    if (typeof persistence?.locate === 'function') {
      const located = persistence.locate({ id: header.id, cwd: header.cwd })
      if (located?.path) return dirname(located.path)
    }
  } catch {
    // locate 拒绝的年代/形态，走重算兜底
  }
  const root = persistenceRoot(persistence)
  if (root === null) return null
  const project =
    header.cwd === undefined ? '_no-cwd' : projectKeyOf(header.cwd)
  return join(root, project, encodeSegment(header.id))
}

/**
 * 某个会话的 projection cache 文件（存到就删，读不到就跳过）。
 * @param {string|null} storageRoot
 */
function projectionCacheFile(storageRoot, sessionId) {
  if (storageRoot === null) return null
  return join(storageRoot, 'session_projcache', 'sessions', `${sessionId}.json`)
}

/**
 * DSH 的 storages 根（projection cache / workspace.json 的家）。
 * 三个候选都验证存在性；哪个有 session_projcache 用哪个，都不在返回 null。
 */
async function resolveStorageRoot(persistence) {
  const candidates = []
  const fromEnv = (process.env.DSH_HOME ?? '').trim()
  if (fromEnv.length > 0) candidates.push(join(fromEnv, 'storages'))
  const root = persistenceRoot(persistence)
  if (root !== null) candidates.push(join(dirname(root), 'storages'))
  candidates.push(join(homedir(), '.dsh', 'storages'))
  for (const candidate of candidates) {
    try {
      await stat(join(candidate, 'session_projcache'))
      return resolve(candidate)
    } catch {
      // 试下一个
    }
  }
  return null
}

/**
 * 构造全部服务：持有 ctx,各 lazily 读取的服务引用,系统态数字。
 * 每个成员独立 try/catch，服务的缺席只影响对应功能，不影响插件起活。
 */
function createCore(ctx) {
  const persistence = () => ctx.sessionPersistence
  const registry = () => ctx.workspaceRegistry
  const query = () => ctx.get('sessionQuery')

  /** 本进程内存里的活跃会话集合（sessions service，docker=dsh-session）。 */
  function liveSessionIds() {
    const out = new Set()
    try {
      for (const session of ctx.get('sessions')?.list() ?? []) {
        if (session?.id !== undefined) out.add(session.id)
      }
    } catch {
      // sessions 服务不在就当没有活跃会话
    }
    return out
  }

  /**
   * 会话有没有「活动」（运行中的 turn/job/计划任务/子代理）——和官方
   * archiveSession 同一判据：workspace/session-activity waterfall。有活动的
   * 会话不能删；判不了按没有算（sessions store 的存活判断是主判据）。
   */
  async function sessionHasActivity(sessionId) {
    try {
      const activity = await ctx.waterfall(
        'workspace/session-activity',
        { sessionId },
        () => Promise.resolve([])
      )
      return Array.isArray(activity) && activity.length > 0
    } catch {
      return false
    }
  }

  /** 会话此刻能不能动：live 或有活动都拒绝。 */
  async function sessionBusy(sessionId, liveSet) {
    if (liveSet.has(sessionId)) return true
    return await sessionHasActivity(sessionId)
  }

  /**
   * 全库清点：工作区 + 会话 + 存储路径信息。
   */
  async function readOverview() {
    const snapshots = await persistence().list()
    const archivedSet = new Set(registry().archivedSessionIds ?? [])
    const pinnedSet = new Set(registry().pinnedSessionIds ?? [])
    const liveSet = liveSessionIds()

    // 1) 先按 header 逐会话清点出落盘目录
    const sessions = []
    for (const snapshot of snapshots) {
      const header = snapshot.header
      if (header === null || typeof header !== 'object') continue
      const dir = sessionDirOf(persistence(), header)
      let updatedAt = Number(header.createdAt)
      let sizeBytes = Number.isFinite(snapshot.sizeBytes) ? snapshot.sizeBytes : 0
      if (dir !== null) {
        try {
          // 目录本身的新鲜度比「日志文件的 mtime」更全面（世代文件、流水账）
          const st = await stat(dir)
          updatedAt = st.mtimeMs
        } catch {
          // 目录还没有（未落盘的空会话）→ 用 createdAt
        }
      }
      try {
        // 顺带量正主日志的大小（不含历史世代，够了）
        const located = typeof persistence().locate === 'function'
          ? persistence().locate({ id: header.id, cwd: header.cwd })
          : null
        if (located?.path) {
          const st = await stat(located.path)
          sizeBytes = st.size
        }
      } catch {
        // 找不到就保留 snapshot.sizeBytes / 0
      }
      sessions.push({
        id: String(header.id),
        cwd: typeof header.cwd === 'string' ? header.cwd : null,
        createdAt: Number(header.createdAt) || 0,
        updatedAt: updatedAt || 0,
        sizeBytes: Number(sizeBytes) || 0,
        dir,
        eventCount: Number.isFinite(snapshot.eventCount) ? snapshot.eventCount : null,
        archived: archivedSet.has(header.id),
        pinned: pinnedSet.has(header.id),
        live: liveSet.has(header.id),
        subagent: header.origin === 'subagent',
        parent: typeof header.parentSession === 'string' ? header.parentSession : null
      })
    }

    // 2) 工作区（官方 registry display 顺序 = 侧边栏顺序）
    const root = persistenceRoot(persistence())
    const workspaces = []
    const workspaceOfSession = new Map()
    for (const ws of registry().list()) {
      let dirStatus = 'missing-dir'
      let dir = null
      if (root !== null) {
        try {
          dir = resolve(join(root, projectKeyOf(ws.path)))
          await stat(dir)
          dirStatus = 'ok'
        } catch {
          dir = null
        }
      }
      let count = 0
      let bytes = 0
      // 记账号里的（含被归档的）+ 落盘在这个工作区目录下的（含被过滤孤儿）
      const memberIds = new Set(ws.sessionIds.map(String))
      for (const row of sessions) {
        const inDir = row.dir !== null && dirname(row.dir) === dir
        if (memberIds.has(row.id) || inDir) {
          if (!workspaceOfSession.has(row.id)) workspaceOfSession.set(row.id, ws.id)
          if (!memberIds.has(row.id)) memberIds.add(row.id)
          count += 1
          bytes += row.sizeBytes
        }
      }
      workspaces.push({
        id: String(ws.id),
        title: String(ws.title ?? ''),
        path: String(ws.path ?? ''),
        dir,
        dirStatus,
        sessionIds: [...memberIds],
        sessionCount: count,
        sizeBytes: bytes,
        status: await ws.status().catch(() => 'missing-dir')
      })
    }

    // 3) 会话行补上所属工作区
    for (const row of sessions) {
      row.workspaceId = workspaceOfSession.get(row.id) ?? null
      if (row.workspaceId === null) {
        const found = workspaces.find((ws) => ws.sessionIds.includes(row.id))
        row.workspaceId = found?.id ?? null
      }
    }

    const totalBytes = sessions.reduce((sum, row) => sum + row.sizeBytes, 0)
    sessions.sort((left, right) => right.updatedAt - left.updatedAt || (left.id < right.id ? -1 : 1))
    // 工作区保持 registry 顺序（和侧边栏一致），只做会话个数的副排序信息给前端

    return {
      storageRoot: await resolveStorageRoot(persistence()),
      sessionRoot: root,
      updatedAt: Date.now(),
      workspaces,
      sessions,
      archivedCount: sessions.filter((row) => row.archived).length,
      pinnedCount: sessions.filter((row) => row.pinned).length,
      liveCount: sessions.filter((row) => row.live).length,
      sessionCount: sessions.length,
      totalBytes
    }
  }

  /**
   * 批量取标题：走 sessionQuery.readTitleSnapshots（live 优先 + 投影缓存加速）。
   * 单会话失败不连坐（result.status rejected → title: null）。
   */
  async function readTitles(ids) {
    const queryService = query()
    if (queryService === undefined || typeof queryService.readTitleSnapshots !== 'function') {
      return ids.map((id) => ({ id, title: null }))
    }
    const results = await queryService.readTitleSnapshots(ids)
    return results.map((result, index) => {
      if (result?.status === 'fulfilled') {
        return {
          id: String((result.sessionId ?? result.value?.session?.id) ?? ids[index] ?? ''),
          title: typeof result.value?.title === 'string' ? result.value.title : null
        }
      }
      return { id: String(result?.sessionId ?? ids[index] ?? ''), title: null }
    })
  }

  /**
   * 把一个会话从注册表里摘干净（置顶 → 归档 → 各工作区记账号）。
   * detach 对每个工作区都试一遍：未记账号的工作区是 no-op（写链 sentinel
   * 直接中止，不产生任何落盘写），这样能顺带清掉「被 cwd 过滤挡在视野外
   * 的 dormant 记账号」。
   */
  async function detachFromRegistry(sessionId) {
    const reg = registry()
    try {
      if (reg.pinnedSessionIds?.includes(sessionId)) await reg.unpinSession(sessionId)
    } catch (error) {
      console.warn(`${TAG} unpinSession(${sessionId}) 失败：${String(error?.message ?? error)}`)
    }
    try {
      if (reg.archivedSessionIds?.includes(sessionId)) await reg.unarchiveSession(sessionId)
    } catch (error) {
      console.warn(`${TAG} unarchiveSession(${sessionId}) 失败：${String(error?.message ?? error)}`)
    }
    let detachedFrom = null
    for (const ws of reg.list()) {
      try {
        if (!ws.sessionIds.includes(sessionId)) continue
        await ws.detachSession(sessionId)
        detachedFrom = ws.id
      } catch (error) {
        console.warn(`${TAG} detachSession(${sessionId}, ${ws.id}) 失败：${String(error?.message ?? error)}`)
      }
    }
    if (detachedFrom === null) {
      // 记账号里看不见（cwd 过滤）但原始记录里还挂着的：全部工作区都兜底试一遍
      for (const ws of reg.list()) {
        try {
          await ws.detachSession(sessionId)
        } catch {
          // 保持 no-op 语义
        }
      }
    }
  }

  /**
   * 删一个会话的落盘产物：会话目录 + projection cache + 空了的工作区目录。
   * 注册表已由 detachFromRegistry 摘干净，这里纯文件操作。
   */
  async function deleteFiles(header, storageRoot) {
    const dir = sessionDirOf(persistence(), header)
    if (dir !== null) {
      await rm(dir, { recursive: true, force: true })
      const projectDir = dirname(dir)
      try {
        // 空目录就收走。用 rmdir 语义（Node 的 rm 不带 recursive 对目录一律
        // EISDIR，等于永远删不了）：非空或被占用会抛 ENOTEMPTY/EBUSY，
        // 恰好是我们要的 —— 绝不递归删掉后来者放进来的东西
        const rest = await readdir(projectDir)
        if (rest.length === 0) await rmdir(projectDir)
      } catch {
        // 非０条目 / 忙 / 权限异常：留一个空目录无害
      }
    }
    const cache = projectionCacheFile(storageRoot, header.id)
    if (cache !== null) {
      try {
        await rm(cache, { force: true })
      } catch {
        // 缓存删不掉不影响主流程
      }
    }
  }

  /**
   * 批量删除会话（真正的删除）。
   * @returns {{deleted:string[], failed:{id:string,reason:string}[]}}
   */
  async function deleteSessions(ids) {
    const liveSet = liveSessionIds()
    const storageRoot = await resolveStorageRoot(persistence())
    const snapshots = await persistence().list()
    const headers = new Map(
      snapshots
        .map((snapshot) => snapshot.header)
        .filter((header) => header?.id !== undefined)
        .map((header) => [String(header.id), header])
    )
    const deleted = []
    const failed = []
    for (const rawId of ids) {
      const id = String(rawId)
      try {
        const header = headers.get(id)
        if (header === undefined) {
          // 没头但有活动 → live 空会话；否则是已被别人删干净的，直接报缺
          if (await sessionBusy(id, liveSet)) {
            failed.push({ id, reason: '会话正被使用（可能是还没落盘的新会话），关闭后重试' })
          } else {
            failed.push({ id, reason: '会话不存在或已被删除' })
          }
          continue
        }
        if (await sessionBusy(id, liveSet)) {
          failed.push({ id, reason: '正被使用：请先关闭相关会话/任务' })
          continue
        }
        await detachFromRegistry(id)
        await deleteFiles(header, storageRoot)
        deleted.push(id)
      } catch (error) {
        failed.push({ id, reason: String(error?.message ?? error) })
      }
    }
    return { deleted, failed }
  }

  /**
   * 删除整个工作区：先删它名下（记账号 + 同目录落盘）的全部会话，
   * 再删工作区登记本身。任何一个会话处于活动状态就整体拒绝——半删的工作区
   * 最麻烦。项目目录本身永远不动（registry.delete 语义如此）。
   */
  async function deleteWorkspace(workspaceId) {
    const reg = registry()
    const ws = reg.get(workspaceId)
    if (ws === undefined) return { ok: false, reason: '工作区不存在' }
    const liveSet = liveSessionIds()
    const storageRoot = await resolveStorageRoot(persistence())
    const snapshots = await persistence().list()
    const headers = new Map(
      snapshots.map((s) => s.header).filter((h) => h?.id !== undefined).map((h) => [String(h.id), h])
    )
    const root = persistenceRoot(persistence())

    // 圈定：记账号 ∪ 同项目目录落盘
    const dir = root === null ? null : resolve(join(root, projectKeyOf(ws.path)))
    const memberIds = new Set(ws.sessionIds.map(String))
    const targets = []
    for (const [id, header] of headers) {
      const rowDir = sessionDirOf(persistence(), header)
      const inDir = dir !== null && rowDir !== null && dirname(rowDir) === dir
      if (memberIds.has(id) || inDir) targets.push({ id, header })
    }
    // 记账号里有、但日志已经不在的（前朝残留），也把注册表摘掉
    for (const id of memberIds) {
      if (!headers.has(id) && !targets.some((t) => t.id === id)) {
        targets.push({ id, header: undefined })
      }
    }

    // 活动检查整体通过才开始动手
    for (const { id } of targets) {
      if (await sessionBusy(id, liveSet)) {
        return { ok: false, reason: `会话 ${id} 正被使用：请先关闭该工作区相关会话/任务` }
      }
    }

    let failed = 0
    for (const { id, header } of targets) {
      try {
        await detachFromRegistry(id)
        if (header !== undefined) await deleteFiles(header, storageRoot)
      } catch (error) {
        failed += 1
        console.warn(`${TAG} 删除工作区 ${workspaceId} 下的 ${id} 失败：${String(error?.message ?? error)}`)
      }
    }
    try {
      await reg.delete(workspaceId)
    } catch (error) {
      return { ok: false, reason: `会话已删 ${targets.length - failed}/${targets.length}，但删除工作区登记失败：${String(error?.message ?? error)}` }
    }
    // 工作区的会话目录（往往已空）
    if (dir !== null) {
      try {
        await rm(dir, { recursive: true, force: true })
      } catch {
        // 有锁文件之类删不掉就算了
      }
    }
    return { ok: true, deletedSessions: targets.length - failed, failed }
  }

  /**
   * 在系统文件管理器里打开目录（只允许打开会话存储树里的目录）。
   * kind: 'root' = 会话存储根；'workspace' = 某工作区的会话目录（没有就建）。
   */
  async function openDirectory(kind, workspaceId) {
    const root = persistenceRoot(persistence())
    if (root === null) throw new Error('无法定位会话存储根目录')
    let target = resolve(root)
    if (kind === 'workspace') {
      const ws = registry().get(workspaceId)
      if (ws === undefined) throw new Error('工作区不存在')
      target = resolve(join(root, projectKeyOf(ws.path)))
      await mkdir(target, { recursive: true })
    } else if (kind !== 'root') {
      throw new Error('未知的目录类型')
    }
    // 围栏：只允许打开「会话存储根」本身或它内部的目录
    const normalizedRoot = resolve(root)
    const prefix = normalizedRoot.endsWith('\\') || normalizedRoot.endsWith('/')
      ? normalizedRoot
      : normalizedRoot + (process.platform === 'win32' ? '\\' : '/')
    const insideRoot = target === normalizedRoot || target.startsWith(prefix)
    if (!insideRoot) throw new Error('只允许打开会话存储目录')
    const info = await stat(target)
    if (!info.isDirectory()) throw new Error('目标不是目录')
    openInFileManager(target)
    return { opened: target }
  }

  function openInFileManager(target) {
    if (process.platform === 'win32') {
      spawn('explorer.exe', [target], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    } else if (process.platform === 'darwin') {
      spawn('open', [target], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref()
    }
  }

  return { readOverview, readTitles, deleteSessions, deleteWorkspace, openDirectory }
}

/* --------------------------------------------------------------- */
/* 插件入口                                                         */
/* --------------------------------------------------------------- */

/**
 * 非有它不可的服务：sessionPersistence / workspaceRegistry 都是 dsh-base
 * 自带的（dsh-session-persistence-jsonl / dsh-workspace），每个有会话的
 * profile 都有，声明静态 inject 不会把插件挂死。
 * connection（web 传输层）刻意不在静态表里：headless / tui profile 没有
 * connection，插件在那里「纯待机」——见 apply() 里的 ctx.inject。
 */
export const inject = ['sessionPersistence', 'workspaceRegistry']

/** 读 JSON body（fetch 的 request.json() 失败抛错时的干净报错）。 */
async function readJsonBody(request) {
  try {
    return await request.json()
  } catch {
    const error = new Error('请求体不是合法 JSON')
    error.status = 400
    throw error
  }
}

/** 可选数组字段：容忍复制粘贴进来的怪东西，只收字符串。 */
function stringIdsOf(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.length > 0).slice(0, 5000)
}

/**
 * 挂上管理接口。读取走 connection 的鉴权通道（同 web 页面同源 fetch 即可），
 * Host/Origin 围栏 + cookie 鉴权都由 connection 层处理。
 */
export function apply(ctx) {
  const core = createCore(ctx)

  ctx.inject(['connection'], (scoped) => {
    const register = (path, methods, handler) => {
      scoped.connection.fetch.register({
        path,
        methods,
        requestBody: 'buffered',
        fetch: async (request) => {
          try {
            const result = await handler(request)
            return Response.json(result ?? {}, { headers: { 'cache-control': 'no-store' } })
          } catch (error) {
            const status = Number(error?.status) || 500
            const message = String(error?.message ?? error)
            return Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } })
          }
        }
      })
    }

    // 全库清点：一次 payload 带所有工作区 + 所有会话（标题除外，见 titles）
    register(ROUTE_OVERVIEW, ['GET'], async () => {
      return await core.readOverview()
    })

    // 批量补标题（界面按可见行分批调）
    register(ROUTE_TITLES, ['POST'], async (request) => {
      const body = await readJsonBody(request)
      const ids = stringIdsOf(body?.ids).slice(0, TITLES_BATCH_LIMIT)
      return { titles: await core.readTitles(ids) }
    })

    // 批量 / 单条删除
    register(ROUTE_DELETE, ['POST'], async (request) => {
      const body = await readJsonBody(request)
      const ids = stringIdsOf(body?.ids)
      if (ids.length === 0) throw new Error('没有指定要删除的会话')
      return await core.deleteSessions(ids)
    })

    // 删除整个工作区
    register(ROUTE_DELETE_WS, ['POST'], async (request) => {
      const body = await readJsonBody(request)
      const workspaceId = String(body?.workspaceId ?? '')
      if (workspaceId.length === 0) throw new Error('没有指定要删除的工作区')
      return await core.deleteWorkspace(workspaceId)
    })

    // 打开会话保存目录
    register(ROUTE_OPEN_DIR, ['POST'], async (request) => {
      const body = await readJsonBody(request)
      return await core.openDirectory(String(body?.kind ?? ''), body?.workspaceId)
    })

    if (!QUIET) {
      console.error(`${TAG} 接口：${ROUTE_OVERVIEW} / ${ROUTE_TITLES} / ${ROUTE_DELETE} / ${ROUTE_DELETE_WS} / ${ROUTE_OPEN_DIR}`)
      console.error(`${TAG} 界面入口：设置 → 会话管理`)
    }
  })

  if (!QUIET) {
    console.error(`${TAG} 会话批量管理已就绪（真正删除：文件 + 注册表，不是归档）`)
  }
}

export default { name, apply }
