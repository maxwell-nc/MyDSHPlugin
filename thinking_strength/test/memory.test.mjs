/**
 * 回归测试：用假的 cordis 上下文驱动 dsh-thinking-strength 的 host 半边，
 * 验证「按模型记住思考强度」的判定/回放，以及勾选框走 configEditor 的读写。
 *
 *   node test/memory.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN = join(import.meta.dirname, '..', 'thinking-strength.mjs')
const ROOT = mkdtempSync(join(tmpdir(), 'dsh-thinking-strength-test-'))

let failures = 0
let caseNo = 0
function ok(label, condition, extra) {
  if (condition) { console.log(`  ok   ${label}`); return }
  failures++
  console.log(`  FAIL ${label}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`)
}

const tick = () => new Promise((resolve) => { setTimeout(resolve, 5) })

/**
 * 起一个插件实例（每个用例一个全新模块实例 + 全新 profile 目录）。
 *
 * @param config   llm-pi-ai 的 config（跨层合成后的原始形态）；null = 没有 config 字段
 * @param noEditor 不提供 configEditor 服务，用来验「桌面版没挂 profile 配置层」的报错
 */
async function boot({ defaultModel = null, memoryFile = null, config = null, noEditor = false } = {}) {
  caseNo++
  const profileDir = join(ROOT, `profile-${caseNo}`)
  mkdirSync(profileDir, { recursive: true })
  process.env.DSH_PROFILE_DIR = profileDir
  if (memoryFile !== null) {
    writeFileSync(join(profileDir, 'dsh-thinking-strength.efforts.json'), JSON.stringify(memoryFile, null, 2))
  }

  const patchPath = join(profileDir, 'cordis.patch.yml')
  const listeners = new Map()
  const routes = []
  const selectCalls = []
  const editCalls = []
  const effortFile = join(profileDir, 'dsh-thinking-strength.efforts.json')

  /** configEditor 的替身：config 是「当前生效配置」，edit 回调返回什么就落什么。 */
  let liveConfig = config === null ? undefined : structuredClone(config)
  const editor = noEditor ? undefined : {
    documentPath: patchPath,
    entries: () => [{ options: { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: liveConfig } }],
    edit: async (entry, change) => {
      const next = change(structuredClone(liveConfig), {})
      if (next === undefined || typeof next !== 'object') throw new Error('change 必须返回完整 config')
      editCalls.push(structuredClone(next))
      liveConfig = structuredClone(next)
      // 宿主把这一行重新序列化后落盘（真实实现保留文件其余部分，这里只模拟这一行）。
      writeFileSync(patchPath, `- id: llm-pi-ai\n  config: ${JSON.stringify(liveConfig, null, 2)}\n`)
    },
  }

  /** selectModel 的替身：记录调用，并按真实行为追加一条 model/selection 事件。 */
  const selectModelImpl = async (request) => {
    selectCalls.push(request)
    if (typeof failWith === 'function') {
      const error = failWith(request)
      if (error !== undefined) throw error
    }
    append(request.sessionId, { provider: request.provider, model: request.model, ...request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort } })
  }
  let failWith = undefined

  const sessions = new Map()
  const projections = new Map()

  function sessionOf(id, origin) {
    let session = sessions.get(id)
    if (session === undefined) {
      session = {
        id,
        header: origin === undefined ? {} : { origin },
        _events: [],
        _header: undefined,
        snapshotEvents() { return this._events },
        requestHeader() { return this._header },
      }
      sessions.set(id, session)
    }
    return session
  }

  /** 模拟 Session.commit：先入日志，再通知 session/event 观察者。 */
  function append(sessionId, data) {
    const session = sessionOf(sessionId)
    const event = { type: 'model/selection', seq: session._events.length, time: Date.now(), data }
    session._events.push(event)
    projections.set(session, { lastUsed: null, pending: data })
    listeners.get('session/event')?.(session, event)
    return event
  }

  const ctx = {
    get(key) {
      if (key === 'agentDefaultModel') return { currentSelection: () => defaultModel }
      if (key === 'configEditor') return editor
      return undefined
    },
    inject(services, callback) {
      if (services.includes('connection')) {
        callback({
          connection: { fetch: { register(route) { routes.push(route) } } },
        })
        return
      }
      callback({
        sessionController: { selectModel: (request) => selectModelImpl(request) },
        sessionProjections: { stateOf: (session) => projections.get(session) },
        on(name, handler) { listeners.set(name, handler); return () => { listeners.delete(name) } },
      })
    },
  }

  const module = await import(`${pathToFileURL(PLUGIN).href}?case=${caseNo}`)
  module.apply(ctx)
  await tick()

  const routeOf = (suffix) => routes.find((route) => route.path.endsWith(suffix.split('?')[0]))
  const post = async (suffix, body) => {
    const response = await routeOf(suffix).fetch(new Request(`http://localhost/api/dsh-thinking-strength${suffix}`, {
      method: body === undefined ? 'GET' : 'POST',
      ...body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    }))
    return { status: response.status, body: await response.json() }
  }

  return {
    append, sessionOf, selectCalls, editCalls, routes, effortFile, profileDir, patchPath,
    liveConfig: () => liveConfig,
    get: (suffix, query = '') => post(`${suffix}${query}`, undefined),
    set: (body) => post('.set', body),
    patchText: () => { try { return readFileSync(patchPath, 'utf8') } catch { return '' } },
    setFailure: (fn) => { failWith = fn },
    readMemory: () => (() => {
      try { return JSON.parse(readFileSync(effortFile, 'utf8')) } catch { return null }
    })(),
    projectionOf: (session, value) => {
      if (value === undefined) projections.delete(session)
      else projections.set(session, value)
    },
  }
}

/* -------------------------------------------------------------------------- */
console.log('用例 1：同模型改档 → 记住；切走 → 无记忆不动；切回 → 回放记忆')
{
  const b = await boot({ defaultModel: { provider: 'merge', model: 'A' } })
  const s = b.sessionOf('s1')
  b.append('s1', { provider: 'merge', model: 'A' })          // 首见：路由 = 默认模型 A
  b.append('s1', { provider: 'merge', model: 'A', reasoningEffort: 'high' })  // 用户改档
  ok('改档写入记忆文件', b.readMemory()?.providers?.merge?.A === 'high', b.readMemory())
  b.append('s1', { provider: 'merge', model: 'B', reasoningEffort: 'medium' }) // 切换模型，B 无记忆
  await tick()
  ok('B 无记忆 → 不回放', b.selectCalls.length === 0, b.selectCalls)
  b.append('s1', { provider: 'merge', model: 'A', reasoningEffort: 'low' })    // 切回 A，档位被重置成默认
  await tick()
  ok('切回 A → 回放 high', b.selectCalls.length === 1 && b.selectCalls[0].reasoningEffort === 'high', b.selectCalls)
  ok('回放事件幂等，不产生第二次回放', b.selectCalls.length === 1, b.selectCalls)
  ok('回放没有改写记忆', b.readMemory()?.providers?.merge?.A === 'high')
}

console.log('用例 2：首见无任何历史 → 只记录不回放')
{
  const b = await boot()
  b.append('s1', { provider: 'merge', model: 'C', reasoningEffort: 'low' })
  await tick()
  ok('未知前序路由 → 不回放', b.selectCalls.length === 0, b.selectCalls)
  ok('仍然记录档位', b.readMemory()?.providers?.merge?.C === 'low', b.readMemory())
}

console.log('用例 3：前序路由来自日志（恢复场景）+ 预置记忆 → 回放')
{
  const b = await boot({ memoryFile: { version: 1, providers: { merge: { C: 'max' } } } })
  const s = b.sessionOf('s1')
  s._events.push({ type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } })
  s._events.push({ type: 'model/selection', seq: 1, time: 0, data: { provider: 'merge', model: 'B', reasoningEffort: 'low' } })
  b.append('s1', { provider: 'merge', model: 'C', reasoningEffort: 'high' })   // 默认档 high
  await tick()
  ok('日志种子判定为切换 → 回放 max', b.selectCalls.length === 1 && b.selectCalls[0].reasoningEffort === 'max', b.selectCalls)
}

console.log('用例 4：预置记忆 + 前序路由来自 requestHeader')
{
  const b = await boot({ memoryFile: { version: 1, providers: { merge: { C: 'max' } } } })
  const s = b.sessionOf('s1')
  s._header = { config: { provider: 'merge', model: 'B' } }
  b.append('s1', { provider: 'merge', model: 'C', reasoningEffort: 'high' })
  await tick()
  ok('请求头种子判定为切换 → 回放 max', b.selectCalls.length === 1 && b.selectCalls[0].reasoningEffort === 'max', b.selectCalls)
}

console.log('用例 5：档位已失效 → 丢弃该条记忆')
{
  const b = await boot({ memoryFile: { version: 1, providers: { merge: { C: 'max' } } } })
  b.setFailure(() => new Error('provider "merge" model "C" does not support reasoning effort "max"'))
  const s = b.sessionOf('s1')
  s._events.push({ type: 'model/selection', seq: 0, time: 0, data: { provider: 'merge', model: 'B' } })
  b.append('s1', { provider: 'merge', model: 'C', reasoningEffort: 'high' })
  await tick()
  ok('尝试过回放', b.selectCalls.length === 1, b.selectCalls)
  ok('失效记忆已删除', b.readMemory()?.providers?.merge?.C === undefined, b.readMemory())
}

console.log('用例 6：子会话完全跳过')
{
  const b = await boot({ memoryFile: { version: 1, providers: { merge: { C: 'max' } } } })
  const s = b.sessionOf('s1', 'subagent')
  s._events.push({ type: 'model/selection', seq: 0, time: 0, data: { provider: 'merge', model: 'B' } })
  b.append('s1', { provider: 'merge', model: 'C', reasoningEffort: 'high' })
  await tick()
  ok('不回放', b.selectCalls.length === 0, b.selectCalls)
  ok('不写记忆', b.readMemory()?.providers?.merge?.C === 'max', b.readMemory())
}

console.log('用例 7：回放前路由已被切走 → 放弃')
{
  const b = await boot({ memoryFile: { version: 1, providers: { merge: { C: 'max' } } } })
  const s = b.sessionOf('s1')
  s._events.push({ type: 'model/selection', seq: 0, time: 0, data: { provider: 'merge', model: 'B' } })
  b.append('s1', { provider: 'merge', model: 'C', reasoningEffort: 'high' })
  b.projectionOf(s, { lastUsed: null, pending: { provider: 'merge', model: 'D' } })  // 用户又切到 D
  await tick()
  ok('放弃回放', b.selectCalls.length === 0, b.selectCalls)
}

/* -------------------------------------------------------------------------- */
const PILOT = {
  providers: {
    merge: {
      displayName: 'merge',
      baseURL: 'http://127.0.0.1:10802/v1',
      models: [
        { id: 'A', name: 'A', reasoningEfforts: { off: null, high: 'high' } },
        { id: 'B', name: 'B' },
      ],
    },
  },
}

console.log('用例 8：取消勾选 → 走 configEditor 删掉 reasoningEfforts，并清掉该模型记忆')
{
  const b = await boot({
    memoryFile: { version: 1, providers: { merge: { A: 'high', B: 'low' } } },
    config: PILOT,
  })
  const state = await b.get('.state', '?provider=merge&model=A')
  ok('state 读到 has=true', state.body.ok === true && state.body.has === true, state.body)
  ok('state 回的是当前 profile 的 patch', state.body.patch === b.patchPath && state.body.profile === basename(b.profileDir), state.body)

  const res = await b.set({ provider: 'merge', model: 'A', enabled: false })
  ok('接口成功且 changed=true', res.body.ok === true && res.body.changed === true, res.body)
  ok('写到 llm-pi-ai 那一行', b.patchText().includes('llm-pi-ai'), b.patchText())
  ok('reasoningEfforts 已删', b.liveConfig().providers.merge.models[0].reasoningEfforts === undefined, b.liveConfig())
  ok('同 provider 的其它模型没被动过', b.liveConfig().providers.merge.models[1].id === 'B', b.liveConfig())
  ok('baseURL 等字段保留', b.liveConfig().providers.merge.baseURL === 'http://127.0.0.1:10802/v1', b.liveConfig())
  ok('edit 收到的是完整 config', b.editCalls.length === 1 && b.editCalls[0].providers.merge.displayName === 'merge', b.editCalls)
  ok('记忆已清 A、保留 B', b.readMemory()?.providers?.merge?.A === undefined && b.readMemory()?.providers?.merge?.B === 'low', b.readMemory())
}

console.log('用例 9：勾选 → 补全默认档位并写盘')
{
  const b = await boot({ config: PILOT })
  const res = await b.set({ provider: 'merge', model: 'B', enabled: true })
  ok('接口成功', res.body.ok === true && res.body.changed === true, res.body)
  ok('补全 off/low/high/max', JSON.stringify(b.liveConfig().providers.merge.models[1].reasoningEfforts)
    === JSON.stringify({ off: null, low: 'low', high: 'high', max: 'max' }), b.liveConfig().providers.merge.models[1])
  const state = await b.get('.state', '?provider=merge&model=B')
  ok('再读 state = has=true', state.body.has === true, state.body)
}

console.log('用例 10：已经是目标状态 → 不写盘（不白改排版）')
{
  const b = await boot({ config: PILOT })
  const before = structuredClone(b.liveConfig())
  const off = await b.set({ provider: 'merge', model: 'B', enabled: false })   // B 本来就没声明
  ok('changed=false', off.body.ok === true && off.body.changed === false, off.body)
  const on = await b.set({ provider: 'merge', model: 'A', enabled: true })    // A 本来就声明了
  ok('changed=false（已声明）', on.body.ok === true && on.body.changed === false, on.body)
  ok('一次都没调 edit', b.editCalls.length === 0, b.editCalls)
  ok('配置没变', JSON.stringify(b.liveConfig()) === JSON.stringify(before), b.liveConfig())
}

console.log('用例 11：模型/provider 不在 llm-pi-ai 里 → 404 且不动配置')
{
  const b = await boot({ config: PILOT })
  const missingModel = await b.set({ provider: 'merge', model: 'Z', enabled: true })
  ok('未知模型 404', missingModel.status === 404 && /未在 llm-pi-ai/.test(missingModel.body.error ?? ''), missingModel.body)
  const missingProvider = await b.set({ provider: 'nope', model: 'A', enabled: true })
  ok('未知 provider 404', missingProvider.status === 404, missingProvider.body)
  ok('没有产生任何写入', b.editCalls.length === 0, b.editCalls)
  const state = await b.get('.state', '?provider=merge&model=Z')
  ok('state 对未知模型返回 has=false（不报错）', state.body.ok === true && state.body.has === false, state.body)
}

console.log('用例 12：没有 configEditor（例如没挂 profile 配置层）→ 报清楚，不崩')
{
  const b = await boot({ noEditor: true })
  const state = await b.get('.state', '?provider=merge&model=A')
  ok('state 报 500 + 可读原因', state.status === 500 && /configEditor/.test(state.body.error ?? ''), state.body)
  const res = await b.set({ provider: 'merge', model: 'A', enabled: true })
  ok('set 报 500 + 可读原因', res.status === 500 && /configEditor/.test(res.body.error ?? ''), res.body)
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
rmSync(ROOT, { recursive: true, force: true })
process.exit(failures === 0 ? 0 : 1)
