/**
 * dsh-context-window —— 「当前模型」的上下文窗口 / 最大输出档位（host 半边）
 * =====================================================================
 *
 * 浏览器半边是输入框右侧的一个按钮（渲染在 `conversation.input.right`，
 * 也就是原来那个「1M」勾选框的位置），按钮上直接显示**当前生效的容量**，
 * 例如 `1M · 128K`（上下文 · 最大输出）。点开是一个两段式弹层：
 *
 *   上下文  默认 / 128K / 200K / 262K / 500K / 1M
 *   输出    默认 / 4K / 8K / 16K / 32K / 64K / 128K
 *
 * 选一档 →　往 profile 的 llm-pi-ai 配置里该模型的条目写
 * `contextWindow` / `maxTokens`；选「默认」→ 删除对应字段，回到适配器
 * 自带的默认（llm-pi-ai 0.2.2 起：contextWindow 1,000,000、maxTokens 128,000）。
 * 状态按模型各自独立，切换模型自动回读。
 *
 * 档位表在 `tiers.json`（本文件同级），每次请求都重新读盘，所以改完立即生效、
 * 不用重载插件。也可以用环境变量 `DSH_CONTEXT_WINDOW_TIERS=<json 路径>` 指到别处；
 * 两者都读不到时用文件里写死的内置档位。
 *
 * 为什么改的是配置而不是请求参数：DSH 的容量靠模型目录声明取值。
 * llm-pi-ai（`catalog.ts`）的优先级是
 * `models[].contextWindow` → 安装的 catalog → `providers.<p>.defaultContextWindow`
 * （0.2.2 起默认 1M）；`maxTokens` 同理（默认 128K），且**只有配置里显式声明的
 * model maxTokens 才会变成请求级默认**，catalog 自带的值只描述模型能力。
 * 上下文压力 / 自动压缩也按这个声明值计算（basic 压缩要求 contextWindow 大于
 * 请求 maxTokens，所以本插件保证「上下文 > 输出」，必要时自动跟随调整并在
 * 返回值里用 `notice` 说明）。
 *
 * 生效方式：写入走宿主的 `ctx.configEditor.edit()`，它会在同一个调用里调和 Loader
 * （reconcileProfilePatches），所以容量提示通常立刻更新；若没有，重开 profile /
 * 重启 dsh 即生效。
 *
 * 显示用的「当前生效值」：上下文优先读宿主 `llm.resolveModelInfo()` 的解析结果
 * （它已经把模型声明、catalog、provider 默认依次套完），拿不到才退回 provider
 * 的 `defaultContextWindow`；输出没有 catalog 级的可读接口，所以是
 * 「模型显式声明值 → provider 的 defaultMaxTokens → 内置 128K」。
 */

import { readFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'

/** 稳定的 cordis 插件名（= entry id）。 */
export const name = 'dsh-context-window'

const TAG = '[dsh-context-window]'
const API_STATE = '/api/dsh-context-window.state'
const API_SET = '/api/dsh-context-window.set'

/** 档位表：默认读包内 `tiers.json`，可用环境变量指到别处。 */
const TIERS_FILE = new URL('./tiers.json', import.meta.url)
const TIERS_ENV = 'DSH_CONTEXT_WINDOW_TIERS'

/** llm-pi-ai 自己的兜底（0.2.2 起是 1M / 128K）；provider 没写默认时用它。 */
const FALLBACK_CONTEXT_WINDOW = 1000000
const FALLBACK_MAX_TOKENS = 128000

/** tiers.json 读不到 / 不合法时的内置档位（与仓库里的 tiers.json 保持一致）。 */
export const FALLBACK_TIERS = Object.freeze({
  context: Object.freeze([
    Object.freeze({ label: '默认', value: null }),
    Object.freeze({ label: '128K', value: 128000 }),
    Object.freeze({ label: '200K', value: 200000 }),
    Object.freeze({ label: '262K', value: 262144 }),
    Object.freeze({ label: '500K', value: 500000 }),
    Object.freeze({ label: '1M', value: 1000000 })
  ]),
  output: Object.freeze([
    Object.freeze({ label: '默认', value: null }),
    Object.freeze({ label: '4K', value: 4096 }),
    Object.freeze({ label: '8K', value: 8192 }),
    Object.freeze({ label: '16K', value: 16384 }),
    Object.freeze({ label: '32K', value: 32768 }),
    Object.freeze({ label: '64K', value: 65536 }),
    Object.freeze({ label: '128K', value: 128000 })
  ]),
  /** 一步到位的「上下文 + 输出」组合。 */
  presets: Object.freeze([
    Object.freeze({ label: '默认', context: null, maxTokens: null }),
    Object.freeze({ label: '128K · 16K', context: 128000, maxTokens: 16384 }),
    Object.freeze({ label: '262K · 32K', context: 262144, maxTokens: 32768 }),
    Object.freeze({ label: '500K · 64K', context: 500000, maxTokens: 65536 }),
    Object.freeze({ label: '1M · 128K', context: 1000000, maxTokens: 128000 })
  ])
})

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
}

function reasonOf(error) {
  const message = String(error?.message ?? error)
  const code = typeof error?.code === 'string' ? error.code.trim() : ''
  if (code.length === 0 || message.includes(code)) return message
  return `${code}: ${message}`
}

/** 正整数（token 数）判定；其余（含 undefined / 字符串 / 0 / 负数）都算没写。 */
function positiveInt(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}

/** token 数的紧凑显示：1000000 → 1M，262144 → 262144，128000 → 128K。 */
function formatTokens(value) {
  if (typeof value !== 'number') return '—'
  if (value % 1000000 === 0) return `${value / 1000000}M`
  if (value % 1000 === 0) return `${value / 1000}K`
  return String(value)
}

/* -------------------------------------------------------------------------- */
/* 档位表                                                                       */
/* -------------------------------------------------------------------------- */

/** 一份档位表：`[{ label, value }]`，value 为 null 表示「默认（删除声明）」。 */
function normalizeTiers(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    const label = typeof item.label === 'string' && item.label.trim().length > 0 ? item.label.trim() : undefined
    if (label === undefined) continue
    const value = item.value === null || item.value === undefined ? null : positiveInt(item.value)
    if (value === undefined) continue
    out.push({ label, value })
  }
  return out
}

/** 一组「上下文 + 输出」组合：`{ label, context, maxTokens }`（null = 该字段删声明）。 */
function normalizePresets(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    const label = typeof item.label === 'string' && item.label.trim().length > 0 ? item.label.trim() : undefined
    if (label === undefined) continue
    const context = item.context === null || item.context === undefined ? null : positiveInt(item.context)
    const maxTokens = item.maxTokens === null || item.maxTokens === undefined ? null : positiveInt(item.maxTokens)
    if (context === undefined || maxTokens === undefined) continue
    // 上下文必须大于输出；不满足的组合直接丢掉（免得点了必然报错）。
    if (context !== null && maxTokens !== null && context <= maxTokens) continue
    out.push({ label, context, maxTokens })
  }
  return out
}

/** 读档位表（每次读盘，改完立即生效）；失败时打一次日志并退回内置档位。 */
let tiersWarned = false
export function loadTiers() {
  const fromEnv = (process.env[TIERS_ENV] ?? '').trim()
  const file = fromEnv.length > 0 ? fromEnv : TIERS_FILE
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const context = normalizeTiers(parsed?.contextTiers ?? parsed?.context)
    const output = normalizeTiers(parsed?.outputTiers ?? parsed?.output)
    if (context.length > 0 && output.length > 0) {
      const presets = normalizePresets(parsed?.presets)
      return { context, output, presets: presets.length > 0 ? presets : FALLBACK_TIERS.presets }
    }
    throw new Error('contextTiers / outputTiers 至少要各有一个合法档位')
  } catch (error) {
    if (!tiersWarned) {
      tiersWarned = true
      console.error(`${TAG} 档位表读取失败（${String(file)}），改用内置档位：${reasonOf(error)}`)
    }
    return FALLBACK_TIERS
  }
}

/** 值 → 档位标签（命中档位用档位名，否则用紧凑 token 数）。 */
function labelOf(tiers, value) {
  if (value === null || value === undefined) return '默认'
  const hit = tiers.find(tier => tier.value === value)
  return hit === undefined ? formatTokens(value) : hit.label
}

/** 档位表里与「已声明值」完全相等的那一档（null = 默认档）；没有则 -1。 */
function tierIndexOf(tiers, declared) {
  const key = declared === undefined ? null : declared
  return tiers.findIndex(tier => tier.value === key)
}

/* -------------------------------------------------------------------------- */
/* profile 配置：交给宿主的 configEditor 服务                                    */
/* -------------------------------------------------------------------------- */

function configEditorOf(ctx) {
  try {
    return ctx.get('configEditor')
  } catch {
    return undefined
  }
}

/** profile 插件树里的 llm-pi-ai 条目：provider / model 配置就写在它的 config 里。 */
function llmEntryOf(editor) {
  try {
    return editor.entries().find(entry =>
      entry?.options?.id === 'llm-pi-ai' || entry?.options?.name === '@deepseek-ai/dsh-llm-pi-ai')
  } catch {
    return undefined
  }
}

/** 在 llm-pi-ai 的 config 里定位 (provider, model) 的模型条目。 */
function locateModel(config, provider, model) {
  const route = config?.providers?.[provider]
  if (route === null || typeof route !== 'object') return { ok: false, why: `provider "${provider}" 未在 llm-pi-ai 里配置` }
  const models = route.models
  if (!Array.isArray(models)) return { ok: false, why: `provider "${provider}" 没有 models 列表` }
  const target = models.find(item => item?.id === model)
  if (target === undefined) return { ok: false, why: `模型 "${model}" 未在 llm-pi-ai 的 ${provider}.models 中找到` }
  return { ok: true, target }
}

/** 当前模型（浏览器半边投影为空时的回退）。 */
function defaultModel(ctx) {
  try {
    const agentDefault = ctx.get('agentDefaultModel')
    const s = agentDefault && typeof agentDefault.currentSelection === 'function' ? agentDefault.currentSelection() : null
    if (s && typeof s.provider === 'string' && typeof s.model === 'string') return { provider: s.provider, model: s.model }
  } catch { /* ignore */ }
  return null
}

function queryParamsOf(request) {
  const urlText = String(request.url ?? '')
  const qIndex = urlText.indexOf('?')
  return new URLSearchParams(qIndex >= 0 ? urlText.slice(qIndex + 1) : '')
}

/* -------------------------------------------------------------------------- */
/* 容量读取                                                                      */
/* -------------------------------------------------------------------------- */

/** 宿主 llm 服务解析出的「有效上下文窗口」（含 catalog / provider 默认），拿不到就 undefined。 */
async function resolvedContextWindow(ctx, provider, model) {
  try {
    const llm = ctx.get('llm')
    if (llm === null || typeof llm?.resolveModelInfo !== 'function') return undefined
    const info = await llm.resolveModelInfo(provider, model)
    return positiveInt(info?.context?.contextWindow)
  } catch {
    return undefined
  }
}

/**
 * 读当前 (provider, model) 的容量：声明值 + 有效值 + 档位命中。
 * @returns `{ context, output, tiers, presets }`，每个容量是
 *   `{ value, declared, source, label, tier }`（declared = 配置里写死的值，可能 undefined）；
 *   `tiers` 是 `{ context, output }` 两个档位数组，`presets` 是「上下文 + 输出」组合。
 */
export async function capacitiesOf(ctx, entry, provider, model) {
  const tiers = loadTiers()
  const located = provider && model ? locateModel(entry?.options?.config ?? {}, provider, model) : { ok: false }
  const declared = located.ok ? located.target : undefined
  const route = entry?.options?.config?.providers?.[provider]
  const providerContext = positiveInt(route?.defaultContextWindow) ?? FALLBACK_CONTEXT_WINDOW
  const providerOutput = positiveInt(route?.defaultMaxTokens) ?? FALLBACK_MAX_TOKENS

  const declaredContext = positiveInt(declared?.contextWindow)
  const declaredOutput = positiveInt(declared?.maxTokens)

  const resolved = declaredContext === undefined ? await resolvedContextWindow(ctx, provider, model) : undefined
  const contextValue = declaredContext ?? resolved ?? providerContext
  const contextSource = declaredContext !== undefined ? 'declared'
    : resolved !== undefined && resolved !== providerContext ? 'catalog'
      : 'fallback'

  const outputValue = declaredOutput ?? providerOutput

  return {
    context: {
      value: contextValue,
      declared: declaredContext,
      source: contextSource,
      label: labelOf(tiers.context, contextValue),
      tier: tierIndexOf(tiers.context, declaredContext)
    },
    output: {
      value: outputValue,
      declared: declaredOutput,
      source: declaredOutput === undefined ? 'fallback' : 'declared',
      label: labelOf(tiers.output, outputValue),
      tier: tierIndexOf(tiers.output, declaredOutput)
    },
    tiers: { context: tiers.context, output: tiers.output },
    presets: tiers.presets
  }
}

/** 档位表里「严格小于 value」的最大档位值。 */
function largestTierBelow(tiers, value) {
  const hit = tiers
    .filter(tier => typeof tier.value === 'number' && tier.value < value)
    .sort((a, b) => b.value - a.value)[0]
  return hit
}

/** 档位表里「严格大于 value」的最小档位值。 */
function smallestTierAbove(tiers, value) {
  const hit = tiers
    .filter(tier => typeof tier.value === 'number' && tier.value > value)
    .sort((a, b) => a.value - b.value)[0]
  return hit
}

/* -------------------------------------------------------------------------- */
/* 面板 / API                                                                   */
/* -------------------------------------------------------------------------- */

export function apply(ctx) {
  ctx.inject(['connection'], (scoped) => {
    const conn = scoped.connection

    /** 读状态：当前模型的声明值 + 有效容量 + 档位表。 */
    const handleState = async (request) => {
      try {
        const params = queryParamsOf(request)
        let provider = (params.get('provider') ?? '').trim()
        let model = (params.get('model') ?? '').trim()
        if (!provider || !model) {
          const def = defaultModel(ctx)
          provider = def?.provider ?? ''
          model = def?.model ?? ''
        }
        const editor = configEditorOf(ctx)
        if (editor === undefined) throw new Error('宿主的 configEditor 服务不可用（当前 profile 没挂 profile 配置层）')
        const entry = llmEntryOf(editor)
        if (entry === undefined) return json({ ok: false, error: 'llm-pi-ai 不在当前 profile 的插件树里' }, 404)
        const patch = editor.documentPath
        const caps = await capacitiesOf(ctx, entry, provider, model)
        const located = locateModel(entry.options?.config ?? {}, provider, model)
        return json({
          ok: true,
          provider,
          model,
          writable: located.ok,
          ...located.ok ? {} : { reason: located.why },
          profile: basename(dirname(patch)),
          patch,
          ...caps
        })
      } catch (error) {
        return json({ ok: false, error: reasonOf(error) }, 500)
      }
    }

    /**
     * 写状态：body 里出现的字段才改（`contextWindow` / `maxTokens`，null = 删除声明）。
     * 保证「上下文 > 输出」：只调一边且要越界时，另一边按档位表自动跟随，并在 `notice` 里说明。
     */
    const handleSet = async (request) => {
      try {
        let body
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: '请求体不是合法 JSON' }, 400)
        }
        const provider = typeof body?.provider === 'string' ? body.provider.trim() : ''
        const model = typeof body?.model === 'string' ? body.model.trim() : ''
        if (!provider || !model) return json({ ok: false, error: '缺少 provider / model' }, 400)

        const hasContext = Object.prototype.hasOwnProperty.call(body, 'contextWindow')
        const hasOutput = Object.prototype.hasOwnProperty.call(body, 'maxTokens')
        if (!hasContext && !hasOutput) return json({ ok: false, error: '至少要给 contextWindow 或 maxTokens' }, 400)
        const readValue = (key, given) => {
          if (given === null) return { ok: true, value: null }
          const value = positiveInt(given)
          if (value === undefined) return { ok: false, why: `${key} 必须是正整数或 null（当前收到 ${JSON.stringify(given)}）` }
          return { ok: true, value }
        }
        let wantedContext
        let wantedOutput
        if (hasContext) {
          const read = readValue('contextWindow', body.contextWindow)
          if (!read.ok) return json({ ok: false, error: read.why }, 400)
          wantedContext = read.value
        }
        if (hasOutput) {
          const read = readValue('maxTokens', body.maxTokens)
          if (!read.ok) return json({ ok: false, error: read.why }, 400)
          wantedOutput = read.value
        }

        const editor = configEditorOf(ctx)
        if (editor === undefined) throw new Error('宿主的 configEditor 服务不可用（当前 profile 没挂 profile 配置层）')
        const entry = llmEntryOf(editor)
        if (entry === undefined) return json({ ok: false, error: 'llm-pi-ai 不在当前 profile 的插件树里' }, 404)
        const patch = editor.documentPath

        const before = await capacitiesOf(ctx, entry, provider, model)
        const located = locateModel(entry.options?.config ?? {}, provider, model)
        if (!located.ok) return json({ ok: false, error: located.why }, 404)

        let writeContext = hasContext ? wantedContext : undefined
        let writeOutput = hasOutput ? wantedOutput : undefined
        let notice

        const effectiveContext = writeContext !== undefined ? writeContext : (before.context.declared ?? before.context.value)
        const effectiveOutput = writeOutput !== undefined ? writeOutput : (before.output.declared ?? before.output.value)

        if (effectiveContext !== null && effectiveOutput !== null && effectiveContext <= effectiveOutput) {
          if (hasContext && hasOutput) {
            return json({
              ok: false,
              error: `上下文 ${formatTokens(effectiveContext)} 必须大于输出 ${formatTokens(effectiveOutput)}，两个值请在两次操作里分别调整`
            }, 400)
          }
          if (hasContext) {
            const smaller = largestTierBelow(before.tiers.output, effectiveContext)
            if (smaller === undefined) {
              return json({ ok: false, error: `输出档位里没有比上下文 ${formatTokens(effectiveContext)} 更小的值可自动跟随` }, 400)
            }
            writeOutput = smaller.value
            notice = `输出已跟随调到 ${smaller.label}（上下文必须大于输出）`
          } else {
            const bigger = smallestTierAbove(before.tiers.context, effectiveOutput)
            if (bigger === undefined) {
              return json({ ok: false, error: `上下文档位里没有比输出 ${formatTokens(effectiveOutput)} 更大的值可自动跟随` }, 400)
            }
            writeContext = bigger.value
            notice = `上下文已跟随调到 ${bigger.label}（必须大于输出）`
          }
        }

        const writes = []
        if (writeContext !== undefined && (before.context.declared ?? null) !== writeContext) writes.push(['contextWindow', writeContext])
        if (writeOutput !== undefined && (before.output.declared ?? null) !== writeOutput) writes.push(['maxTokens', writeOutput])

        if (writes.length === 0) {
          return json({ ok: true, changed: false, provider, model, profile: basename(dirname(patch)), patch, notice, ...before })
        }

        // edit 会加锁、重新读盘、校验（丢给 llm-pi-ai 自己的 Config）、写文件并调和 Loader 热重载。
        // change 里抛错 = 整次编辑失败，磁盘上不会留下半成品。
        await editor.edit(entry, (current) => {
          const config = current ?? {}
          const target = locateModel(config, provider, model)
          if (!target.ok) throw new Error(target.why)
          for (const [key, value] of writes) {
            if (value === null) delete target.target[key]
            else target.target[key] = value
          }
          return config
        })
        console.error(`${TAG} 已写入 ${writes.map(([key, value]) => `${key}=${value === null ? '默认' : value}`).join(' + ')}：${provider} / ${model} -> ${patch}`)

        const fresh = llmEntryOf(editor) ?? entry
        const after = await capacitiesOf(ctx, fresh, provider, model)
        return json({
          ok: true,
          changed: true,
          provider,
          model,
          profile: basename(dirname(patch)),
          patch,
          written: writes.map(([key, value]) => ({ key, value })),
          notice,
          ...after
        })
      } catch (error) {
        return json({ ok: false, error: reasonOf(error) }, 500)
      }
    }

    const routes = [
      { path: API_STATE, methods: ['GET'], fetch: (request) => handleState(request) },
      { path: API_SET, methods: ['POST'], fetch: (request) => handleSet(request) }
    ]
    for (const route of routes) {
      try {
        conn.fetch.register({ ...route, requestBody: 'buffered' })
        console.error(`${TAG} 接口已注册：${route.methods.join('/')} ${route.path}`)
      } catch (error) {
        console.error(`${TAG} 注册 ${route.path} 失败：${reasonOf(error)}`)
      }
    }

    const editor = configEditorOf(ctx)
    const llm = editor === undefined ? undefined : llmEntryOf(editor)
    console.error(`${TAG} patch = ${editor?.documentPath ?? '（configEditor 不可用）'}${llm === undefined ? '，llm-pi-ai 条目未找到' : ''}`)
  })
}

export const inject = []

export default { name, apply }
