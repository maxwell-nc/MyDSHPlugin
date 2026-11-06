/**
 * 回归测试：用假的 cordis 上下文驱动 dsh-context-window 的 host 半边，
 * 验证「读当前容量 / 切档写配置 / 上下文>输出的自动跟随」。
 *
 *   node test/api.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLUGIN = join(import.meta.dirname, '..', 'context-window.mjs')
const ROOT = mkdtempSync(join(tmpdir(), 'dsh-context-window-test-'))

let failures = 0
let caseNo = 0
function ok(label, condition, extra) {
  if (condition) { console.log(`  ok   ${label}`); return }
  failures++
  console.log(`  FAIL ${label}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`)
}

/** 模拟「安装的 catalog」：没在配置里声明的模型由它给出窗口。 */
const CATALOG = { B: 3000000 }

/** 起一个插件实例（每个用例一个全新模块实例 + 全新 profile 目录）。 */
async function boot({ defaultModel = null, config = null, noEditor = false, withLlm = true, tiersFile = null } = {}) {
  caseNo++
  const profileDir = join(ROOT, `profile-${caseNo}`)
  mkdirSync(profileDir, { recursive: true })
  process.env.DSH_PROFILE_DIR = profileDir
  if (tiersFile === null) delete process.env.DSH_CONTEXT_WINDOW_TIERS
  else process.env.DSH_CONTEXT_WINDOW_TIERS = tiersFile

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

  /** llm 服务替身：像 llm-pi-ai 一样把 声明 → catalog → provider 默认 依次套完。 */
  const llm = {
    resolveModelInfo: async (provider, model) => {
      const route = liveConfig?.providers?.[provider]
      const entry = route?.models?.find(item => item.id === model)
      if (entry === undefined) throw new Error(`unknown model "${model}"`)
      const value = entry.contextWindow ?? CATALOG[model] ?? route.defaultContextWindow ?? 1000000
      return { provider, id: model, name: entry.name ?? model, context: { contextWindow: value } }
    },
  }

  const ctx = {
    get(key) {
      if (key === 'agentDefaultModel') return { currentSelection: () => defaultModel }
      if (key === 'configEditor') return editor
      if (key === 'llm') return withLlm ? llm : undefined
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
    const response = await routeOf(suffix).fetch(new Request(`http://localhost/api/dsh-context-window${suffix}`, {
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
console.log('用例 1：读状态（声明值 / catalog 值 / 适配器默认，带档位与标签）')
{
  const b = await boot({ config: PILOT })
  const a = await b.get('?provider=merge&model=A')
  ok('A：声明 128000 → source=declared, label=128K, tier=1',
    a.body.ok === true && a.body.context.value === 128000 && a.body.context.source === 'declared'
    && a.body.context.label === '128K' && a.body.context.tier === 1, a.body.context)
  ok('A：输出未声明 → 适配器默认 128K', a.body.output.value === 128000 && a.body.output.source === 'fallback' && a.body.output.label === '128K', a.body.output)

  const b2 = await b.get('?provider=merge&model=B')
  ok('B：没声明但 catalog 给 3000000 → source=catalog, label=3M',
    b2.body.context.value === 3000000 && b2.body.context.source === 'catalog' && b2.body.context.label === '3M', b2.body.context)
  ok('B：未声明 → tier=0（默认档）', b2.body.context.tier === 0, b2.body.context)

  const c = await b.get('?provider=merge&model=C')
  ok('C：声明 1M + maxTokens 32000', c.body.context.value === 1000000 && c.body.output.value === 32000 && c.body.output.source === 'declared', c.body)

  ok('档位表来自 tiers.json（含 262K / 64K）',
    a.body.tiers.context.some(t => t.label === '262K' && t.value === 262144)
    && a.body.tiers.output.some(t => t.label === '64K' && t.value === 65536), a.body.tiers)
  ok('快速组合来自 tiers.json（含 262K · 32K）',
    a.body.presets.some(p => p.label === '262K · 32K' && p.context === 262144 && p.maxTokens === 32768), a.body.presets)
  ok('每个组合都满足 上下文 > 输出',
    a.body.presets.every(p => p.context === null || p.maxTokens === null || p.context > p.maxTokens), a.body.presets)
  ok('state 回当前 profile 的 patch', a.body.patch === b.patchPath && a.body.profile === basename(b.profileDir), a.body)
}

console.log('用例 2：只切上下文 → 写 contextWindow，不动输出')
{
  const b = await boot({ config: PILOT })
  const res = await b.set({ provider: 'merge', model: 'B', contextWindow: 262144 })
  ok('接口成功且 changed=true', res.body.ok === true && res.body.changed === true, res.body)
  ok('只写了 contextWindow', b.editCalls.length === 1 && b.modelOf('merge', 'B').contextWindow === 262144
    && b.modelOf('merge', 'B').maxTokens === undefined, b.modelOf('merge', 'B'))
  ok('没有 notice（3M > 128K 不冲突）', res.body.notice === undefined, res.body.notice)
  ok('名字/其它字段保留', b.modelOf('merge', 'B').name === 'B' && b.liveConfig().providers.merge.baseURL === 'http://127.0.0.1:10802/v1', b.modelOf('merge', 'B'))
  ok('写到了 llm-pi-ai 那一行', b.patchText().includes('llm-pi-ai'))
  ok('返回值已带新 state', res.body.context.value === 262144 && res.body.context.label === '262K', res.body.context)
}

console.log('用例 3：上下文 ≤ 输出 → 输出自动跟随（并在 notice 里说明）')
{
  const b = await boot({ config: PILOT })
  const res = await b.set({ provider: 'merge', model: 'B', contextWindow: 128000 })
  ok('成功 + notice 提到输出跟随', res.body.ok === true && /输出已跟随调到 64K/.test(res.body.notice ?? ''), res.body)
  ok('contextWindow=128000 且 maxTokens=65536',
    b.modelOf('merge', 'B').contextWindow === 128000 && b.modelOf('merge', 'B').maxTokens === 65536, b.modelOf('merge', 'B'))
  const after = await b.get('?provider=merge&model=B')
  ok('复读：输出声明值 64K', after.body.output.declared === 65536 && after.body.output.source === 'declared', after.body.output)
}

console.log('用例 4：只切输出 → 超过上下文时上下文自动跟随')
{
  const b = await boot({ config: PILOT })
  const res = await b.set({ provider: 'merge', model: 'A', maxTokens: 200000 })
  ok('成功 + notice 提到上下文跟随', res.body.ok === true && /上下文已跟随调到 262K/.test(res.body.notice ?? ''), res.body)
  ok('contextWindow=262144 且 maxTokens=200000',
    b.modelOf('merge', 'A').contextWindow === 262144 && b.modelOf('merge', 'A').maxTokens === 200000, b.modelOf('merge', 'A'))
}

console.log('用例 5：选「默认」= 删除声明')
{
  const b = await boot({ config: PILOT })
  const res = await b.set({ provider: 'merge', model: 'C', contextWindow: null, maxTokens: null })
  ok('成功且 changed=true', res.body.ok === true && res.body.changed === true, res.body)
  ok('两个字段都删了', b.modelOf('merge', 'C').contextWindow === undefined && b.modelOf('merge', 'C').maxTokens === undefined, b.modelOf('merge', 'C'))
  const after = await b.get('?provider=merge&model=C')
  ok('复读：回到适配器/目录默认（3M 之下的 provider 默认 1M）', after.body.context.value === 1000000 && after.body.context.source === 'fallback', after.body.context)
}

console.log('用例 6：已是目标状态 → 不写盘')
{
  const b = await boot({ config: PILOT })
  const same = await b.set({ provider: 'merge', model: 'C', contextWindow: 1000000 })
  ok('重复写同值 → changed=false', same.body.ok === true && same.body.changed === false, same.body)
  const undef = await b.set({ provider: 'merge', model: 'B', contextWindow: null })
  ok('本来就未声明 + 再选默认 → changed=false', undef.body.ok === true && undef.body.changed === false, undef.body)
  ok('两次都没调 edit', b.editCalls.length === 0, b.editCalls.length)
}

console.log('用例 7：参数校验与未知路由')
{
  const b = await boot({ config: PILOT })
  const both = await b.set({ provider: 'merge', model: 'B', contextWindow: 128000, maxTokens: 128000 })
  ok('一次给两个冲突值 → 400 + 说明', both.status === 400 && /必须大于输出/.test(both.body.error ?? ''), both.body)
  const none = await b.set({ provider: 'merge', model: 'B' })
  ok('两个字段都不给 → 400', none.status === 400, none.body)
  const negative = await b.set({ provider: 'merge', model: 'B', contextWindow: -1 })
  ok('负数 → 400', negative.status === 400 && /正整数/.test(negative.body.error ?? ''), negative.body)
  const string = await b.set({ provider: 'merge', model: 'B', maxTokens: '8K' })
  ok('非数字 → 400', string.status === 400, string.body)
  const missingProvider = await b.set({ provider: 'nope', model: 'A', contextWindow: 200000 })
  ok('未知 provider → 404', missingProvider.status === 404, missingProvider.body)
  const missingModel = await b.set({ provider: 'merge', model: 'Z', contextWindow: 200000 })
  ok('未知模型 → 404 且不动配置', missingModel.status === 404 && /未在 llm-pi-ai/.test(missingModel.body.error ?? ''), missingModel.body)
  const state = await b.get('?provider=merge&model=Z')
  ok('state 对未知模型仍能报出适配器默认（不 500）', state.body.ok === true && state.body.context.value === 1000000, state.body)
  ok('state 对未知模型标 writable=false 并给原因',
    state.body.ok === true && state.body.writable === false && /未在 llm-pi-ai/.test(state.body.reason ?? ''), state.body)
  const badJson = await b.set(undefined)
  ok('非 JSON 体 → 400', badJson.status === 400, badJson.body)
  ok('全程没有写入', b.editCalls.length === 0, b.editCalls.length)
}

console.log('用例 8：没有 configEditor / 没有 llm 服务')
{
  const b = await boot({ noEditor: true })
  const state = await b.get('?provider=merge&model=A')
  ok('state 报 500 + 可读原因', state.status === 500 && /configEditor/.test(state.body.error ?? ''), state.body)
  const res = await b.set({ provider: 'merge', model: 'A', contextWindow: 200000 })
  ok('set 报 500 + 可读原因', res.status === 500 && /configEditor/.test(res.body.error ?? ''), res.body)

  const b2 = await boot({ config: PILOT, withLlm: false })
  const fallback = await b2.get('?provider=merge&model=B')
  ok('llm 服务缺失时退回 provider 默认 1M', fallback.body.ok === true && fallback.body.context.value === 1000000 && fallback.body.context.source === 'fallback', fallback.body.context)
}

console.log('用例 9：请求头/默认模型回退 + provider 默认覆盖')
{
  const config = structuredClone(PILOT)
  config.providers.merge.defaultContextWindow = 400000
  config.providers.merge.defaultMaxTokens = 40000
  config.providers.merge.models.push({ id: 'D', name: 'D' })
  const b = await boot({ config, defaultModel: { provider: 'merge', model: 'D' } })
  const state = await b.get()
  ok('不带 query → 用默认模型 D', state.body.provider === 'merge' && state.body.model === 'D', state.body)
  ok('provider.defaultContextWindow=400000 生效', state.body.context.value === 400000 && state.body.context.source === 'fallback' && state.body.context.label === '400K', state.body.context)
  ok('provider.defaultMaxTokens=40000 生效（显示 40K）', state.body.output.value === 40000 && state.body.output.label === '40K', state.body.output)
  const missing = await b.set({ model: 'D', contextWindow: 200000 })
  ok('缺 provider → 400', missing.status === 400, missing.body)
}

console.log('用例 11：一键套用「快速组合」（上下文 + 输出一次写入）')
{
  const b = await boot({ config: PILOT })
  const res = await b.set({ provider: 'merge', model: 'B', contextWindow: 262144, maxTokens: 32768 })
  ok('成功且 changed=true、无 notice', res.body.ok === true && res.body.changed === true && res.body.notice === undefined, res.body)
  ok('两个字段一次写好',
    b.modelOf('merge', 'B').contextWindow === 262144 && b.modelOf('merge', 'B').maxTokens === 32768, b.modelOf('merge', 'B'))
  ok('复读标签对得上（262K · 32K）',
    res.body.context.label === '262K' && res.body.output.label === '32K', { c: res.body.context, o: res.body.output })
  const again = await b.set({ provider: 'merge', model: 'B', contextWindow: 262144, maxTokens: 32768 })
  ok('再点同一个组合 → changed=false（不重复写盘）', again.body.ok === true && again.body.changed === false, again.body)
  const reset = await b.set({ provider: 'merge', model: 'B', contextWindow: null, maxTokens: null })
  ok('组合「默认」= 两个字段都删', reset.body.ok === true && b.modelOf('merge', 'B').contextWindow === undefined
    && b.modelOf('merge', 'B').maxTokens === undefined, b.modelOf('merge', 'B'))
}

console.log('用例 12：档位表可用 DSH_CONTEXT_WINDOW_TIERS 换（改完立即生效）')
{
  const file = join(ROOT, 'custom-tiers.json')
  writeFileSync(file, JSON.stringify({
    contextTiers: [{ label: '默认', value: null }, { label: '64K', value: 64000 }, { label: '1M', value: 1000000 }],
    outputTiers: [{ label: '默认', value: null }, { label: '8K', value: 8000 }],
    presets: [
      { label: '64K · 8K', context: 64000, maxTokens: 8000 },
      { label: '坏组合（上下文≤输出）', context: 8000, maxTokens: 8000 },
    ],
  }))
  const b = await boot({ config: PILOT, tiersFile: file })
  const state = await b.get('?provider=merge&model=B')
  ok('state 用自定义档位', state.body.tiers.context.length === 3 && state.body.tiers.context[1].label === '64K'
    && state.body.tiers.output.length === 2, state.body.tiers)
  ok('自定义组合生效，且坏组合被丢掉', state.body.presets.length === 1
    && state.body.presets[0].label === '64K · 8K', state.body.presets)
  const res = await b.set({ provider: 'merge', model: 'B', contextWindow: 64000 })
  ok('切 64K → 输出按自定义档位跟到 8K', res.body.ok === true && /输出已跟随调到 8K/.test(res.body.notice ?? '')
    && b.modelOf('merge', 'B').maxTokens === 8000, { notice: res.body.notice, model: b.modelOf('merge', 'B') })
  delete process.env.DSH_CONTEXT_WINDOW_TIERS
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
rmSync(ROOT, { recursive: true, force: true })
process.exit(failures === 0 ? 0 : 1)
