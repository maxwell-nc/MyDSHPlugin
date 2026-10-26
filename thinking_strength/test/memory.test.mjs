/**
 * 回归测试：用假的 cordis 上下文驱动 dsh-thinking-strength 的 host 半边，
 * 验证「按模型记住思考强度」的判定与回放逻辑。
 *
 *   node test/memory.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN = join(import.meta.dirname, '..', 'thinking-strength.mjs')
const ROOT = mkdtempSync(join(tmpdir(), 'dsh-thinking-strength-test-'))
// yaml 库要从 profile 共享 store 回退导入，所以 DSH_HOME 必须指向真实的 ~/.dsh。
process.env.DSH_HOME ||= join(homedir(), '.dsh')

let failures = 0
let caseNo = 0
function ok(label, condition, extra) {
  if (condition) { console.log(`  ok   ${label}`); return }
  failures++
  console.log(`  FAIL ${label}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`)
}

const tick = () => new Promise((resolve) => { setTimeout(resolve, 5) })

/** 起一个插件实例（每个用例一个全新模块实例 + 全新 profile 目录）。 */
async function boot({ defaultModel = null, memoryFile = null, patchFile = null } = {}) {
  caseNo++
  const profileDir = join(ROOT, `profile-${caseNo}`)
  mkdirSync(profileDir, { recursive: true })
  if (memoryFile !== null) {
    writeFileSync(join(profileDir, 'dsh-thinking-strength.efforts.json'), JSON.stringify(memoryFile, null, 2))
  }
  if (patchFile !== null) writeFileSync(join(profileDir, 'cordis.patch.yml'), patchFile)
  process.env.DSH_PROFILE_DIR = profileDir
  // DSH_HOME 保持真实值：yaml 库要从 profile 共享 store 里回退导入。

  const listeners = new Map()
  const routes = []
  const selectCalls = []
  const effortFile = join(profileDir, 'dsh-thinking-strength.efforts.json')

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
      if (key === 'agentDefaultModel') {
        return { currentSelection: () => defaultModel }
      }
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

  return {
    append, sessionOf, selectCalls, routes, effortFile, profileDir,
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

console.log('用例 8：勾选框取消声明 → 顺手清掉该模型记忆（走 /api）')
{
  const patch = [
    '- id: llm-pi-ai',
    '  name: "@deepseek-ai/dsh-llm-pi-ai"',
    '  config:',
    '    providers:',
    '      merge:',
    '        models:',
    '          - id: A',
    '            reasoningEfforts:',
    '              off: null',
    '              high: high',
    '',
  ].join('\n')
  const b = await boot({
    memoryFile: { version: 1, providers: { merge: { A: 'high', B: 'low' } } },
    patchFile: patch,
  })
  const setRoute = b.routes.find((route) => route.path.endsWith('.set'))
  const response = await setRoute.fetch(new Request('http://localhost/api/dsh-thinking-strength.set', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'merge', model: 'A', enabled: false }),
  }))
  const body = await response.json()
  ok('接口成功', body.ok === true, body)
  ok('记忆已清 A、保留 B', b.readMemory()?.providers?.merge?.A === undefined && b.readMemory()?.providers?.merge?.B === 'low', b.readMemory())
  ok('patch 里 reasoningEfforts 已删', !readFileSync(join(b.profileDir, 'cordis.patch.yml'), 'utf8').includes('reasoningEfforts'))
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
rmSync(ROOT, { recursive: true, force: true })
process.exit(failures === 0 ? 0 : 1)
