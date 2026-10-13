/**
 * Host 半边端到端逻辑测试：桩掉 cordis 服务（sessionPersistence /
 * workspaceRegistry / sessions / sessionQuery / connection / waterfall），
 * 在临时目录里铺一套仿真的会话存储布局，然后走 HTTP 路由层验证：
 *   1. overview 清点（工作区 / 会话归属 / 大小 / 标签）
 *   2. titles 补标题
 *   3. delete 真删：注册表三处摘除 + 日志目录删除 + cache 删除 + 空目录清理
 *   4. live 会话拒删
 *   5. delete-workspace：会话全删 + 登记 kidney 删除
 * 不碰真实 ~/.dsh（root 指向测试临时目录）。
 */
import { readFileSync } from 'node:fs'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'

const code = readFileSync('D:/Project/dsplugin/session_manager/session-manager.mjs', 'utf8')

/* ---------------- 仿真存储布局 ---------------- */
const base = mkdtempSync(join(tmpdir(), 'dshm-test-'))
const sessionRoot = join(base, 'sessions')
const storageRoot = join(base, 'storages')
const cacheRoot = join(storageRoot, 'session_projcache', 'sessions')
mkdirSync(cacheRoot, { recursive: true })

/* 与 dsh-session-persistence-jsonl 相同的布局函数（测试里独立实现，防止把测试写进被测代码） */
const enc = (raw) =>
  raw.replace(/[^A-Za-z0-9._~-]/g, (ch) => {
    const c = ch.charCodeAt(0)
    return '~' + c.toString(16).toUpperCase().padStart(4, '0')
  })
const projKey = (cwd) => {
  let readable = ''
  let sep = false
  for (const ch of cwd) {
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!sep) readable += '-'
      sep = true
    } else if (/[A-Za-z0-9._-]/.test(ch)) { readable += ch; sep = false } else { readable += '~' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'); sep = false }
  }
  return '--' + readable.replace(/^-+/, '').slice(0, 251) + '--'
}
const sessionDir = (id, cwd) => join(sessionRoot, cwd == null ? '_no-cwd' : projKey(cwd), enc(id))

const SEED = [
  { id: 'session-aaaa', cwd: 'D:\\Work\\alpha', createdAt: 1000, updatedAt: 50000, size: 100 },
  { id: 'session-bbbb', cwd: 'D:\\Work\\alpha', createdAt: 2000, updatedAt: 40000, size: 200 },
  { id: 'session-ccccc', cwd: 'D:\\Work\\beta', createdAt: 3000, updatedAt: 30000, size: 300 },
  { id: 'session-orphan', cwd: 'D:\\Work\\gone', createdAt: 4000, updatedAt: 20000, size: 400 },
  { id: 'legacy-plain', cwd: null, createdAt: 5000, updatedAt: 10000, size: 500 }
]
const LIVE_ID = 'session-live1'

for (const s of [...SEED, { id: LIVE_ID, cwd: 'D:\\Work\\alpha', createdAt: 9000, updatedAt: 90000, size: 900 }]) {
  const dir = sessionDir(s.id, s.cwd)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.v4.jsonl.zstd'), JSON.stringify({ id: s.id, cwd: s.cwd, createdAt: s.createdAt }))
  writeFileSync(join(cacheRoot, s.id + '.json'), '{}')
}

/* ---------------- 桩服务 ---------------- */
const calls = { unpin: [], unarchive: [], detach: [], wsDelete: [] }
const workspaces = new Map([
  ['ws-alpha', { id: 'ws-alpha', title: 'alpha', path: 'D:\\Work\\alpha', sessionIds: ['session-bbbb', 'session-aaaa', LIVE_ID], status: async () => 'ok', detachSession: async (id) => { calls.detach.push(['ws-alpha', id]) } }],
  ['ws-beta', { id: 'ws-beta', title: 'beta', path: 'D:\\Work\\beta', sessionIds: ['session-ccccc'], status: async () => 'ok', detachSession: async (id) => { calls.detach.push(['ws-beta', id]) } }]
])
const state = { archived: ['session-bbbb'], pinned: ['session-aaaa'] }

const persistenceStub = {
  root: sessionRoot,
  locate: ({ id, cwd }) => ({ kind: 'jsonl', path: join(sessionDir(id, cwd == null ? undefined : cwd), 'session.v4.jsonl.zstd') }),
  list: async () =>
    [...SEED, { id: LIVE_ID, cwd: 'D:\\Work\\alpha', createdAt: 9000 }].map((s) => ({
      header: { id: s.id, version: 4, createdAt: s.createdAt * 1000, cwd: s.cwd ?? undefined, isSeeded: false },
      revision: {},
      sizeBytes: 42
    }))
}
const registryStub = {
  get: (id) => workspaces.get(id),
  list: () => [...workspaces.values()],
  get archivedSessionIds() { return [...state.archived] },
  get pinnedSessionIds() { return [...state.pinned] },
  unpinSession: async (id) => { state.pinned = state.pinned.filter((x) => x !== id); calls.unpin.push(id) },
  unarchiveSession: async (id) => { state.archived = state.archived.filter((x) => x !== id); calls.unarchive.push(id) },
  delete: async (id) => { calls.wsDelete.push(id); workspaces.delete(id) }
}
const routes = new Map()
const ctxStub = {
  sessionPersistence: persistenceStub,
  workspaceRegistry: registryStub,
  get: (key) => {
    if (key === 'sessions') {
      return { list: () => [{ id: LIVE_ID }], get: (id) => (id === LIVE_ID ? { id } : undefined) }
    }
    if (key === 'sessionQuery') {
      // 官方 readTitleSnapshots 的 value.title 是 titleSnapshotFromState 冻结对象
      // {title, messageSeqs, source, eventSeq, updatedAt}；测试一半给对象、一半给
      // 纯字符串（旧形态），并留一个 undefined（无标题事件）
      return {
        readTitleSnapshots: async (ids) =>
          ids.map((id, index) => {
            if (id.endsWith('0000')) return { sessionId: id, status: 'fulfilled', value: { session: { id } } }
            const title = index % 2 === 0 ? { title: 'T:' + id, messageSeqs: [1], source: { kind: 'llm' }, eventSeq: 2, updatedAt: 3 } : 'T:' + id
            return { sessionId: id, status: 'fulfilled', value: { session: { id }, title } }
          })
      }
    }
    return undefined
  },
  waterfall: async () => Promise.resolve([]),
  inject: (names, cb) => { assert.deepEqual(names, ['connection']); cb({ connection: { fetch: { register: (route) => routes.set(route.path, route) } } }) },
  effect: () => () => {}
}

/* 环境变量让 storageRoot 解析命中测试目录 */
process.env.DSH_HOME = join(base, 'fake-home')
mkdirSync(join(base, 'fake-home', 'storages', 'session_projcache', 'sessions'), { recursive: true })
// 把会话缓存目录同步指过去（DSH_HOME/storages）——但桩里的 sessionRoot 在 base/sessions，
// resolveStorageRoot 第三候选才是 dirname(root)/storages；第一候选 DSH_HOME/storages 存在但为空集，
// 为了让 cache 路径覆盖到假缓存文件，直接复用真实 cacheRoot：建一个 DSH_HOME 指向 base 根
rmSync(join(base, 'fake-home'), { recursive: true })
process.env.DSH_HOME = base

/* 加载被测模块（fresh import 走原生 ESM） */
const mod = await import('file:///D:/Project/dsplugin/session_manager/session-manager.mjs')
process.env.DSH_SESSION_MANAGER_QUIET = '1'
mod.apply(ctxStub)
assert.equal(routes.size, 5, '应有 5 条路由，实际 ' + routes.size)

const callRoute = async (path, { method = 'GET', body } = {}) => {
  const route = routes.get(path)
  assert.ok(route, '路由未注册: ' + path)
  const request = {
    method,
    url: 'http://x' + path,
    json: async () => body
  }
  const response = await route.fetch(request)
  const payload = await response.json()
  assert.ok(response.ok, path + ' 返回 ' + response.status + ' ' + JSON.stringify(payload).slice(0, 200))
  return payload
}

/* 1. overview */
const overview = await callRoute('/api/session-mgr.overview')
assert.equal(overview.sessions.length, 6)
assert.equal(overview.workspaces.length, 2)
const byId = new Map(overview.sessions.map((r) => [r.id, r]))
assert.equal(byId.get('session-aaaa').workspaceId, 'ws-alpha')
assert.equal(byId.get('session-orphan').workspaceId, null, '孤儿应未分组')
assert.equal(byId.get('legacy-plain').dir.length > 0, true)
assert.equal(byId.get('session-aaaa').pinned, true)
assert.equal(byId.get('session-bbbb').archived, true)
assert.equal(byId.get(LIVE_ID).live, true)
const wsAlpha = overview.workspaces.find((w) => w.id === 'ws-alpha')
assert.equal(wsAlpha.sessionCount, 3, 'ws-alpha 应回到 3 个会话（含 live）')
assert.equal(wsAlpha.dirStatus, 'ok')
console.log('PASS overview：归属/标签/计数/目录状态 全部正确')

/* 2. titles：快照对象 / 纯字符串 / 无标题事件 三种形态都要正确取到 */
const titles = await callRoute('/api/session-mgr.titles', { method: 'POST', body: { ids: ['session-aaaa', 'session-orphan', 'session-ccccc', 'session-x0000'] } })
assert.equal(titles.titles.length, 4)
assert.equal(titles.titles[0].title, 'T:session-aaaa', '快照对象形态应取 .title 字符串')
assert.equal(titles.titles[1].title, 'T:session-orphan', '纯字符串形态应直接采用')
assert.equal(titles.titles[2].title, 'T:session-ccccc', '快照对象形态应取 .title 字符串')
assert.equal(titles.titles[3].title, null, '无标题事件应返回 null')
console.log('PASS titles：快照对象/字符串/无标题 三种形态全部正确')

/* 3. 删除两个死的：aaaa（置顶）+ bbbb（归档）+ legacy-plain（未分组） */
const deletion = await callRoute('/api/session-mgr.delete', {
  method: 'POST',
  body: { ids: ['session-aaaa', 'session-bbbb', 'legacy-plain', LIVE_ID] }
})
assert.deepEqual(deletion.deleted.sort(), ['legacy-plain', 'session-aaaa', 'session-bbbb'])
assert.equal(deletion.failed.length, 1)
assert.equal(deletion.failed[0].id, LIVE_ID)
assert.ok(deletion.failed[0].reason.includes('正被使用'), 'live 拒删原因: ' + deletion.failed[0].reason)
assert.ok(calls.unpin.includes('session-aaaa'), '置顶应被摘除')
assert.ok(calls.unarchive.includes('session-bbbb'), '归档应被摘除')
// detach：记录所有尝试（含对每个工作区的幂等 no-op 探测），至少要覆盖到 aaaa / bbbb 的归账
assert.ok(calls.detach.some(([ws, id]) => ws === 'ws-alpha' && id === 'session-aaaa'), 'aaaa 应被从 ws-alpha 摘除: ' + JSON.stringify(calls.detach))
assert.ok(calls.detach.some(([ws, id]) => ws === 'ws-alpha' && id === 'session-bbbb'), 'bbbb 应被从 ws-alpha 摘除')
assert.equal(calls.detach.filter(([ws, id]) => id === LIVE_ID).length, 0, 'live 不应被尝试 detach')
assert.equal(existsSync(sessionDir('session-aaaa', 'D:\\Work\\alpha')), false, '日志目录应被删')
assert.equal(existsSync(join(cacheRoot, 'session-aaaa.json')), false, 'cache 应被删')
assert.equal(existsSync(join(cacheRoot, LIVE_ID + '.json')), true, 'live 的 cache 不应被动')
assert.equal(existsSync(join(sessionRoot, projKey('D:\\Work\\alpha'))), true, 'alpha 工作区目录还有 live 会话，不应删空目录')
console.log('PASS delete：三处注册表摘除 + 文件删除 + live 拒删 全部正确')

/* 4. 删掉孤儿 → 空项目目录应被清理 */
const deletion2 = await callRoute('/api/session-mgr.delete', { method: 'POST', body: { ids: ['session-orphan'] } })
assert.deepEqual(deletion2.deleted, ['session-orphan'])
assert.equal(existsSync(join(sessionRoot, projKey('D:\\Work\\gone'))), false, '空工作区目录应被清掉')
console.log('PASS delete：空项目目录已回收')

/* 5. 删除整个工作区 beta */
const wsDel = await callRoute('/api/session-mgr.delete-workspace', { method: 'POST', body: { workspaceId: 'ws-beta' } })
assert.equal(wsDel.ok, true)
assert.equal(wsDel.deletedSessions, 1)
assert.ok(calls.wsDelete.includes('ws-beta'), '注册表 delete 应被调用')
assert.equal(existsSync(sessionDir('session-ccccc', 'D:\\Work\\beta')), false)
assert.equal(workspaces.has('ws-beta'), false)
console.log('PASS delete-workspace：会话 + 登记 全部删除')

/* 6. live 工作区整体拒绝 */
const refuse = await callRoute('/api/session-mgr.delete-workspace', { method: 'POST', body: { workspaceId: 'ws-alpha' } })
assert.equal(refuse.ok, false)
assert.ok(refuse.reason.includes('正被使用'), '整体拒删原因: ' + refuse.reason)
console.log('PASS delete-workspace：live 会话使整体取消')

rmSync(base, { recursive: true, force: true })
console.log('PASS host 端到端逻辑测试全部通过')
