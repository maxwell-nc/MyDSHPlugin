/**
 * 回归测试：用假的 cordis 上下文驱动 dsh-context-1m 的 host 半边，
 * 验证勾选框读写（走宿主的 configEditor）。
 *
 *   node test/api.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN = join(import.meta.dirname, '..', 'context-1m.mjs')
const ROOT = mkdtempSync(join(tmpdir(), 'dsh-context-1m-test-'))

let failures = 0
let caseNo = 0
function ok(label, condition, extra) {
  if (condition) { console.log(`  ok   ${label}`); return }
  failures++
  console.log(`  FAIL ${label}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`)
}

/** 起一个插件实例（每个用例一个全新模块实例 + 全新 profile 目录）。 */
async function boot({ defaultModel = null, config = null, noEditor = false } = {}) {
  caseNo++
  const profileDir = join(ROOT, `profile-${caseNo}`)
  mkdirSync(profileDir, { recursive: true })
  process.env.DSH_PROFILE_DIR = profileDir

  const patchPath = join(profileDir, 'cordis.patch.yml')
  const routes = []
  const editCalls = []

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
      writeFileSync(patchPath, `- id: llm-pi-ai\n  config: ${JSON.stringify(liveConfig, null, 2)}\n`)
    },
  }

  const ctx = {
    get(key) {
      if (key === 'agentDefaultModel') return { currentSelection: () => defaultModel }
      if (key === 'configEditor') return editor
      return undefined
    },
    inject(services, callback) {
      if (services.includes('connection')) {
        callback({ connection: { fetch: { register(route) { routes.push(route) } } } })
        return
      }
      callback({})
    },
  }

  const module = await import(`${pathToFileURL(PLUGIN).href}?case=${caseNo}`)
  module.apply(ctx)

  const routeOf = (suffix) => routes.find((route) => route.path.endsWith(suffix.split('?')[0]))
  const call = async (suffix, body) => {
    const response = await routeOf(suffix).fetch(new Request(`http://localhost/api/dsh-context-1m${suffix}`, {
      method: body === undefined ? 'GET' : 'POST',
      ...body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    }))
    return { status: response.status, body: await response.json() }
  }

  const modelOf = (provider, model) => liveConfig?.providers?.[provider]?.models?.find(item => item.id === model)

  return {
    routes, editCalls, profileDir, patchPath, modelOf,
    liveConfig: () => liveConfig,
    get: (query = '') => call(`.state${query}`),
    set: (body) => call('.set', body),
    patchText: () => { try { return readFileSync(patchPath, 'utf8') } catch { return '' } },
  }
}

const PILOT = {
  providers: {
    merge: {
      displayName: 'merge',
      baseURL: 'http://127.0.0.1:10802/v1',
      models: [
        { id: 'A', name: 'A', contextWindow: 128000 },
        { id: 'B', name: 'B' },
        { id: 'C', name: 'C', contextWindow: 1000000, maxTokens: 32000 },
      ],
    },
  },
}

/* -------------------------------------------------------------------------- */
console.log('用例 1：读状态（已声明 / 未声明 / 带 maxTokens）')
{
  const b = await boot({ config: PILOT })
  const a = await b.get('?provider=merge&model=A')
  ok('A 已声明 → has=true，declared=128000', a.body.ok === true && a.body.has === true && a.body.declared === 128000, a.body)
  const b2 = await b.get('?provider=merge&model=B')
  ok('B 未声明 → has=false', b2.body.has === false && b2.body.declared === undefined, b2.body)
  const c = await b.get('?provider=merge&model=C')
  ok('C 读出 declaredMaxTokens', c.body.has === true && c.body.declaredMaxTokens === 32000, c.body)
  ok('state 回当前 profile 的 patch', a.body.patch === b.patchPath && a.body.profile === basename(b.profileDir), a.body)
}

console.log('用例 2：勾上 → 写入 1M + 128K（只动当前模型，其余字段保留）')
{
  const b = await boot({ config: PILOT })
  const res = await b.set({ provider: 'merge', model: 'A', enabled: true })
  ok('接口成功且 changed=true', res.body.ok === true && res.body.changed === true && res.body.enabled === true, res.body)
  ok('A 写入 1M + 128K', b.modelOf('merge', 'A').contextWindow === 1000000 && b.modelOf('merge', 'A').maxTokens === 128000, b.modelOf('merge', 'A'))
  ok('A 的名字没丢', b.modelOf('merge', 'A').name === 'A', b.modelOf('merge', 'A'))
  ok('provider 其它字段保留', b.liveConfig().providers.merge.baseURL === 'http://127.0.0.1:10802/v1' && b.liveConfig().providers.merge.displayName === 'merge', b.liveConfig().providers.merge)
  ok('其它模型没被动过', b.modelOf('merge', 'B').contextWindow === undefined && b.modelOf('merge', 'C').contextWindow === 1000000, b.liveConfig().providers.merge.models)
  ok('edit 收到的是完整 config', b.editCalls.length === 1 && b.editCalls[0].providers.merge.models.length === 3, b.editCalls)
  ok('写到了 llm-pi-ai 那一行', b.patchText().includes('llm-pi-ai'))
  const after = await b.get('?provider=merge&model=A')
  ok('复读 state：declared=1000000 / maxTokens=128000', after.body.declared === 1000000 && after.body.declaredMaxTokens === 128000, after.body)
}

console.log('用例 3：取消 → 删除两个字段')
{
  const b = await boot({ config: PILOT })
  const res = await b.set({ provider: 'merge', model: 'C', enabled: false })
  ok('接口成功且 changed=true', res.body.ok === true && res.body.changed === true, res.body)
  ok('contextWindow / maxTokens 都删了', b.modelOf('merge', 'C').contextWindow === undefined && b.modelOf('merge', 'C').maxTokens === undefined, b.modelOf('merge', 'C'))
  const after = await b.get('?provider=merge&model=C')
  ok('复读 state：has=false', after.body.has === false, after.body)
}

console.log('用例 4：已是目标状态 → 不写盘')
{
  const b = await boot({ config: PILOT })
  const off = await b.set({ provider: 'merge', model: 'B', enabled: false })   // B 本来就没有
  ok('未声明时取消 → changed=false', off.body.ok === true && off.body.changed === false, off.body)
  const on = await b.set({ provider: 'merge', model: 'C', enabled: true })    // C 已经是 1M（但 maxTokens 是 32K）
  ok('半截状态不算达标 → 会修复（changed=true）', on.body.changed === true, on.body)
  ok('maxTokens 被抬到 128K', b.modelOf('merge', 'C').maxTokens === 128000, b.modelOf('merge', 'C'))
  const again = await b.set({ provider: 'merge', model: 'C', enabled: true })
  ok('再点一次 → changed=false', again.body.changed === false, again.body)
  ok('edit 只在该写的时候调（半截修复那一次）', b.editCalls.length === 1, b.editCalls.length)
}

console.log('用例 5：模型/provider 不在 llm-pi-ai 里 → 404 且不动配置')
{
  const b = await boot({ config: PILOT })
  const missingModel = await b.set({ provider: 'merge', model: 'Z', enabled: true })
  ok('未知模型 404', missingModel.status === 404 && /未在 llm-pi-ai/.test(missingModel.body.error ?? ''), missingModel.body)
  const missingProvider = await b.set({ provider: 'nope', model: 'A', enabled: true })
  ok('未知 provider 404', missingProvider.status === 404, missingProvider.body)
  ok('没有产生任何写入', b.editCalls.length === 0, b.editCalls)
  const state = await b.get('?provider=merge&model=Z')
  ok('state 对未知模型 has=false（不报错）', state.body.ok === true && state.body.has === false, state.body)
}

console.log('用例 6：没有 configEditor（例如没挂 profile 配置层）→ 报清楚，不崩')
{
  const b = await boot({ noEditor: true })
  const state = await b.get('?provider=merge&model=A')
  ok('state 报 500 + 可读原因', state.status === 500 && /configEditor/.test(state.body.error ?? ''), state.body)
  const res = await b.set({ provider: 'merge', model: 'A', enabled: true })
  ok('set 报 500 + 可读原因', res.status === 500 && /configEditor/.test(res.body.error ?? ''), res.body)
}

console.log('用例 7：请求头/默认模型回退与参数校验')
{
  const b = await boot({ config: PILOT, defaultModel: { provider: 'merge', model: 'A' } })
  const state = await b.get()
  ok('不带 query → 用默认模型（has=true）', state.body.provider === 'merge' && state.body.model === 'A' && state.body.has === true, state.body)
  const bad = await b.set({ provider: 'merge', enabled: true })
  ok('缺 model → 400', bad.status === 400, bad.body)
  const noJson = await b.set(undefined)
  ok('非 JSON 体 → 400', noJson.status === 400, noJson.body)
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
rmSync(ROOT, { recursive: true, force: true })
process.exit(failures === 0 ? 0 : 1)
