/**
 * dsh-thinking-strength —— 让「当前模型」能思考，并且**记住每个模型的思考强度**（host 半边）
 * =====================================================================
 *
 * 功能一：为当前模型声明 / 删除 reasoningEfforts
 * ---------------------------------------------------------------------
 * 浏览器半边是一个勾选框（渲染在 `conversation.input.right`）：
 *
 *   - 勾选状态 = 当前模型在 llm-pi-ai 配置里是否声明了 `reasoningEfforts`；
 *   - 勾上   → 往 profile 的 `cordis.patch.yml`（llm-pi-ai 条目里该模型的
 *             `providers.<provider>.models[].reasoningEfforts`）**补全**一份默认档位：
 *             `{ off: null, low: low, high: high, max: max }`；
 *   - 取消   → 从该模型条目里**删除** `reasoningEfforts` 字段。
 *
 * 为什么改的是 patch 文件而不是 llm 请求：DSH 的 llm 校验层
 * （resolveCallWithInfo）只接受「模型目录声明过的档位」；模型没声明时任何显式
 * reasoningEffort 都会抛 UNSUPPORTED_REASONING_EFFORT。`reasoningEfforts` 就是
 * llm-pi-ai 给手写 provider 模型声明能力的字段 —— 它物化成 reasoning:true +
 * thinkingLevelMap，内置 ModelSelect 的 effort 面板才会出现，`reasoning_effort`
 * 才会随请求发出（openai-completions 默认走 `params.reasoning_effort = wire`）。
 *
 * 生效方式：patch 文件写入后，长驻 surface（web GUI）会热重载 profile 补丁层；
 * 若模型选择器里的 effort 面板没有立刻出现，重开 profile / 重启 dsh 即生效。
 *
 * 功能二：按模型记住思考强度
 * ---------------------------------------------------------------------
 * DSH 核心没有「每模型记住档位」的概念：客户端点模型行时**不带** effort
 * （ModelSelect 的 `choose({provider, model})`），host 的 `selectModel` 走
 * `resolveCallConfig`，把缺省的 effort 解析成**该模型的默认档**
 * （`llm` 的 `requested ?? reasoning.defaultEffort`）。所以切换模型再切回来，
 * 内置 effort 面板里看到的是默认档，用户上次选的档丢了。
 *
 * 本插件在 host 半边补一张「provider/model → effort」记忆表，用事件回放补齐：
 *
 *   - 监听 `session/event`，只看 `model/selection`（这是 `selectModel` 落库的
 *     唯一痕迹，两个模型入口、任何客户端都走它）；
 *   - **路由变了** = 用户切换模型（effort 被重置成默认）→ 查记忆，
 *     用 `ctx.sessionController.selectModel` 把记忆档补回去；
 *   - **路由没变、effort 变了** = 用户在档位面板里主动改档 → 写进记忆。
 *
 * 为什么按「路由变没变」而不是「effort 变没变」判定：用户主动改档和切换模型
 * 重置档位，在事件里长得一样（都是一条新的 model/selection），只有路由能区分。
 * 记忆在回放时是幂等的（回放事件路由不变、effort 等于记忆值，只会再写一次同样的
 * 记忆），不会自激；同一路由回放不改 provider/model，因此也不会触发核心的
 * 「[model changed]」提示。
 *
 * 记忆表存在 profile 目录下的 `dsh-thinking-strength.efforts.json`
 * （`{ version, providers: { <provider>: { <model>: <effort> } } }`），
 * 删除该文件即清空记忆。不用 localStorage：Desktop 以 `--port 0` 启动，
 * 每次重启端口变了 origin 也就变了，浏览器存储留不住。
 *
 * profile 定位：优先 `DSH_PROFILE_DIR` → `DSH_HOME`+`DSH_PROFILE` → 兜底扫描
 * `$DSH_HOME/profiles/*` 找装了本插件的目录（多个时取 patch 文件最新改动的）。
 *
 * YAML 解析用 profile 共享 store 里的 `yaml`（先裸导入，失败则回退到
 * `$DSH_HOME/profiles/node_modules/yaml/dist/index.js` 以文件 URL 导入），
 * 用 parseDocument 保护注释与排版，只改动目标模型的条目。
 */

import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 稳定的 cordis 插件名（= entry id）。 */
export const name = 'dsh-thinking-strength'

const TAG = '[dsh-thinking-strength]'
const API_STATE = '/api/dsh-thinking-strength.state'
const API_SET = '/api/dsh-thinking-strength.set'

/** 勾上时补全的默认档位：off 不传参（= 上游默认），其余档位直发 wire 值。 */
const DEFAULT_EFFORTS = { off: null, low: 'low', high: 'high', max: 'max' }

/** 记忆表文件名（落在 profile 目录下，与 cordis.patch.yml 同级）。 */
const EFFORTS_FILE = 'dsh-thinking-strength.efforts.json'
/** 记忆表格式版本，将来改结构时用来判定兼容。 */
const EFFORTS_VERSION = 1
/** 路由键分隔符：provider 与 model 都不会包含 NUL。 */
const ROUTE_SEP = '\u0000'

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
}

function reasonOf(error) {
  const message = String(error?.message ?? error)
  const code = typeof error?.code === 'string' ? error.code.trim() : ''
  if (code.length === 0 || message.includes(code)) return message
  return `${code}: ${message}`
}

/* -------------------------------------------------------------------------- */
/* profile / patch 文件定位                                                      */
/* -------------------------------------------------------------------------- */

function dshHome() {
  const given = (process.env.DSH_HOME ?? '').trim()
  if (given.length > 0) return given
  return join(homedir(), '.dsh')
}

/** 定位当前 profile 目录（优先环境变量，兜底扫描）。找不到返回 null。 */
function resolveProfileDir() {
  const dirEnv = (process.env.DSH_PROFILE_DIR ?? '').trim()
  if (dirEnv.length > 0) return dirEnv
  const nameEnv = (process.env.DSH_PROFILE ?? '').trim()
  if (nameEnv.length > 0) return join(dshHome(), 'profiles', nameEnv)
  const profilesRoot = join(dshHome(), 'profiles')
  let best = null
  try {
    for (const entry of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(profilesRoot, entry.name)
      const marker = join(dir, 'node_modules', 'dsh-thinking-strength')
      const patch = join(dir, 'cordis.patch.yml')
      if (!existsSync(marker) || !existsSync(patch)) continue
      const rec = { dir, patchMtime: statSync(patch).mtimeMs }
      if (best === null || rec.patchMtime > best.patchMtime) best = rec
    }
  } catch { /* 扫描失败就交给上层报错 */ }
  return best ? best.dir : null
}

/** profile 下的用户补丁层（llm-pi-ai 配置就写在这里）。 */
function patchFileOf(profileDir) {
  return join(profileDir, 'cordis.patch.yml')
}

/** profile 下的思考强度记忆表。 */
function effortsFileOf(profileDir) {
  return join(profileDir, EFFORTS_FILE)
}

function writeFileAtomic(file, content) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

/* -------------------------------------------------------------------------- */
/* yaml 解析（双路导入，注释与排版由 parseDocument 保留）                          */
/* -------------------------------------------------------------------------- */

let yamlPromise = null

async function loadYamlModule() {
  try {
    return await import('yaml')
  } catch { /* 运行时的解析器可能够不到共享 store，走下面的绝对路径 */ }
  const candidates = [
    join(dshHome(), 'profiles', 'node_modules', 'yaml', 'dist', 'index.js'),
    (() => {
      const dir = resolveProfileDir()
      return dir ? join(dirname(dir), 'node_modules', 'yaml', 'dist', 'index.js') : ''
    })()
  ]
  for (const candidate of candidates) {
    if (candidate.length > 0 && existsSync(candidate)) {
      return await import(pathToFileURL(candidate).href)
    }
  }
  throw new Error('找不到可用的 yaml 库（$DSH_HOME/profiles/node_modules/yaml/dist/index.js）')
}

function yamlModule() {
  yamlPromise ??= loadYamlModule()
  return yamlPromise
}

/* -------------------------------------------------------------------------- */
/* cordis.patch.yml 里的定位与编辑                                               */
/* -------------------------------------------------------------------------- */

/** 顶层数组里 llm-pi-ai 条目的下标；找不到返回 -1。 */
function llmEntryIndex(doc) {
  const seq = doc.contents
  if (!seq || !Array.isArray(seq.items)) return -1
  for (let i = 0; i < seq.items.length; i++) {
    const id = seq.items[i]?.get?.('id')
    const nm = seq.items[i]?.get?.('name')
    if (id === 'llm-pi-ai' || nm === '@deepseek-ai/dsh-llm-pi-ai') return i
  }
  return -1
}

/**
 * 定位 llm-pi-ai 配置里 (provider, model) 对应的 models 序列下标。
 * 返回 { ok, base?, why? }；base 是直达该模型条目的路径数组。
 */
function modelEntryPath(doc, entryIndex, provider, model) {
  const config = doc.getIn([entryIndex, 'config'])
  if (!config || typeof config.get !== 'function') return { ok: false, why: 'llm-pi-ai 条目没有 config' }
  const providers = config.get('providers')
  if (!providers || typeof providers.get !== 'function') return { ok: false, why: 'llm-pi-ai config 里没有 providers' }
  const route = providers.get(provider)
  if (!route || typeof route.get !== 'function') return { ok: false, why: `provider "${provider}" 未配置` }
  const models = route.get('models')
  if (!models || !Array.isArray(models.items)) return { ok: false, why: `provider "${provider}" 没有 models 列表` }
  for (let j = 0; j < models.items.length; j++) {
    if (models.items[j]?.get?.('id') === model) {
      return { ok: true, base: [entryIndex, 'config', 'providers', provider, 'models', j] }
    }
  }
  return { ok: false, why: `模型 "${model}" 未在 llm-pi-ai 的 ${provider}.models 中找到` }
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

/** 从 Request 里取查询参数（兼容绝对/相对 URL）。 */
function queryParamsOf(request) {
  const urlText = String(request.url ?? '')
  const qIndex = urlText.indexOf('?')
  return new URLSearchParams(qIndex >= 0 ? urlText.slice(qIndex + 1) : '')
}

/* -------------------------------------------------------------------------- */
/* 思考强度记忆：表、持久化                                                      */
/* -------------------------------------------------------------------------- */

/** routeKey → effort（字符串档位 id）。进程内唯一一份。 */
const efforts = new Map()
/** Session → 上一次观察到的路由键（WeakMap：会话销毁即回收）。 */
const lastRoute = new WeakMap()
/** 记忆表是否已从磁盘载入（只载入一次）。 */
let effortsLoaded = false

/**
 * 惰性载入记忆表：profile 目录当时定位不到就不标记已载入，留给下一次机会。
 * 任何会读/改记忆的入口都先过这里，避免「没载入就保存」把磁盘上的表写空。
 */
function ensureEffortsLoaded() {
  if (!effortsLoaded) loadEfforts(resolveProfileDir())
  return effortsLoaded
}

function routeKey(provider, model) {
  return `${provider}${ROUTE_SEP}${model}`
}

function routeLabel(key) {
  const at = key.indexOf(ROUTE_SEP)
  return at < 0 ? key : `${key.slice(0, at)} / ${key.slice(at + 1)}`
}

/** 载入记忆表；文件不存在或损坏都按空表处理，绝不让插件起不来。 */
function loadEfforts(profileDir) {
  if (effortsLoaded) return
  if (profileDir === null) {
    console.error(`${TAG} 记忆表暂未载入：profile 目录还没定位到`)
    return
  }
  effortsLoaded = true
  const file = effortsFileOf(profileDir)
  if (!existsSync(file)) return
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const providers = parsed?.providers
    if (providers === null || typeof providers !== 'object') return
    for (const [provider, models] of Object.entries(providers)) {
      if (models === null || typeof models !== 'object') continue
      for (const [model, effort] of Object.entries(models)) {
        if (typeof effort === 'string' && effort.length > 0) efforts.set(routeKey(provider, model), effort)
      }
    }
    console.error(`${TAG} 已载入 ${efforts.size} 条思考强度记忆：${file}`)
  } catch (error) {
    console.error(`${TAG} 记忆表读取失败（按空表处理）：${reasonOf(error)}`)
  }
}

/** 落盘记忆表（临时文件 + rename）。profile 没定位到就只在内存里记。 */
function saveEfforts() {
  const profileDir = resolveProfileDir()
  if (profileDir === null) {
    console.error(`${TAG} 记忆表未落盘：profile 目录没定位到`)
    return
  }
  const providers = {}
  for (const [key, effort] of efforts) {
    const at = key.indexOf(ROUTE_SEP)
    const provider = key.slice(0, at)
    const model = key.slice(at + 1)
    providers[provider] ??= {}
    providers[provider][model] = effort
  }
  const payload = `${JSON.stringify({ version: EFFORTS_VERSION, providers }, null, 2)}\n`
  writeFileAtomic(effortsFileOf(profileDir), payload)
}

/** 记下一个模型的档位（同值不重复写盘）。 */
function rememberEffort(key, effort) {
  if (typeof effort !== 'string' || effort.length === 0) return
  ensureEffortsLoaded()
  if (efforts.get(key) === effort) return
  efforts.set(key, effort)
  try {
    saveEfforts()
    console.error(`${TAG} 已记住思考强度：${routeLabel(key)} = ${effort}`)
  } catch (error) {
    console.error(`${TAG} 记忆表落盘失败：${reasonOf(error)}`)
  }
}

/** 丢弃一个模型的档位（记忆里的档位不再被该模型接受时）。 */
function forgetEffort(key) {
  ensureEffortsLoaded()
  if (!efforts.delete(key)) return
  try {
    saveEfforts()
    console.error(`${TAG} 已丢弃失效的思考强度记忆：${routeLabel(key)}`)
  } catch (error) {
    console.error(`${TAG} 记忆表落盘失败：${reasonOf(error)}`)
  }
}

/** 该错误是否表示「模型不接受这个档位」（配置变了 / 勾选框被取消）。 */
function isUnsupportedEffort(error) {
  const message = String(error?.message ?? error)
  return error?.code === 'UNSUPPORTED_REASONING_EFFORT'
    || message.includes('UNSUPPORTED_REASONING_EFFORT')
    || /does not support reasoning effort/i.test(message)
}

/* -------------------------------------------------------------------------- */
/* 思考强度记忆：事件回放                                                        */
/* -------------------------------------------------------------------------- */

/** 安全读会话事件快照（读不到就当没有历史）。 */
function sessionEvents(session) {
  try {
    return typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : []
  } catch {
    return []
  }
}

/**
 * 推断「本条 model/selection 之前」会话处在哪个路由上。
 *
 * 首次观察一个会话时需要它，才能把「切换模型」和「同模型改档」区分开：
 *   1. 日志里上一条 model/selection（最常见的恢复场景）；
 *   2. 会话最近一次请求头（从未显式选过模型、但发过消息）；
 *   3. 宿主的默认模型（全新会话）。
 * 三者都取不到就返回 undefined —— 此时本条事件按「首见」处理，只记录不回放。
 */
function previousRouteOf(ctx, session, event) {
  const events = sessionEvents(session)
  const rawSeq = typeof event?.seq === 'number' ? event.seq : events.length
  const start = Math.min(rawSeq, events.length) - 1
  for (let i = start; i >= 0; i--) {
    const candidate = events[i]
    if (candidate?.type !== 'model/selection') continue
    return routeKey(candidate.data.provider, candidate.data.model)
  }
  try {
    const header = typeof session.requestHeader === 'function' ? session.requestHeader() : undefined
    const config = header?.config
    if (config && typeof config.provider === 'string' && typeof config.model === 'string') {
      return routeKey(config.provider, config.model)
    }
  } catch { /* ignore */ }
  const fallback = defaultModel(ctx)
  return fallback === null ? undefined : routeKey(fallback.provider, fallback.model)
}

/**
 * 把记忆里的档位补回当前模型。
 *
 * 回放必须跨出 `session/event` 的发布窗口：`Session.append` 不允许重入
 * （见 core/session 的 publicationEntry）。回放前再核一次当前路由，避免
 * 用户已经切走、这条迟到的回放把新模型盖回去。
 */
function replayEffort(controller, projections, session, selection, effort) {
  void (async () => {
    await Promise.resolve()
    try {
      let current = null
      try {
        const projection = projections.stateOf(session, 'modelSelection')
        current = projection?.pending ?? projection?.lastUsed ?? null
      } catch { /* 读不到就按「路由未变」处理 */ }
      if (current !== null
        && (current.provider !== selection.provider || current.model !== selection.model)) return

      await controller.selectModel({
        sessionId: session.id,
        provider: selection.provider,
        model: selection.model,
        reasoningEffort: effort,
      })
      console.error(`${TAG} 已为 ${selection.provider} / ${selection.model} 恢复思考强度：${effort}`)
    } catch (error) {
      if (isUnsupportedEffort(error)) {
        forgetEffort(routeKey(selection.provider, selection.model))
        return
      }
      console.error(`${TAG} 恢复思考强度失败：${reasonOf(error)}`)
    }
  })()
}

/**
 * 装上记忆表：一个 `session/event` 观察者，把「切换模型」与「改档」分开处理。
 * @param ctx - 插件上下文（root）。
 */
function applyEffortMemory(ctx) {
  ctx.inject(['sessionController', 'sessionProjections'], (scoped) => {
    const controller = scoped.sessionController
    const projections = scoped.sessionProjections
    ensureEffortsLoaded()

    scoped.on('session/event', (session, event) => {
      if (event?.type !== 'model/selection') return
      // 子会话的模型由委派策略决定，不参与记忆回放。
      if (session?.header?.origin === 'subagent') return
      const selection = event.data
      if (typeof selection?.provider !== 'string' || typeof selection?.model !== 'string') return
      ensureEffortsLoaded()

      const key = routeKey(selection.provider, selection.model)
      const previous = lastRoute.get(session) ?? previousRouteOf(ctx, session, event)
      lastRoute.set(session, key)

      if (previous === undefined || previous === key) {
        // 同路由 = 用户在档位面板里的主动选择（含「恢复默认档」），记下来。
        rememberEffort(key, selection.reasoningEffort)
        return
      }
      const wanted = efforts.get(key)
      if (wanted === undefined || wanted === selection.reasoningEffort) return
      replayEffort(controller, projections, session, selection, wanted)
    })

    const dir = resolveProfileDir()
    console.error(`${TAG} 思考强度记忆：${dir === null ? '（profile 目录未定位到，仅内存）' : effortsFileOf(dir)}`)
  })
}

/* -------------------------------------------------------------------------- */
/* 面板 / API                                                                   */
/* -------------------------------------------------------------------------- */

/** 注册 /api 路由：读/写当前模型的 reasoningEfforts 声明状态。 */
function applyRoutes(ctx) {
  ctx.inject(['connection'], (scoped) => {
    const conn = scoped.connection

    /** 读状态：当前模型有没有声明 reasoningEfforts（每次回读文件）。 */
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
        const profileDir = resolveProfileDir()
        if (!profileDir) throw new Error('定位不到 profile 目录（DSH_PROFILE_DIR / DSH_PROFILE 未设置，也没扫到装着本插件的 profile）')
        const file = patchFileOf(profileDir)
        const { parseDocument } = await yamlModule()
        const doc = parseDocument(readFileSync(file, 'utf8'))
        const entry = llmEntryIndex(doc)
        const located = entry >= 0 && provider && model ? modelEntryPath(doc, entry, provider, model) : { ok: false }
        const has = !!(located.ok && doc.getIn([...located.base, 'reasoningEfforts']) !== undefined)
        return json({ ok: true, provider, model, has, profile: basename(profileDir), patch: file })
      } catch (error) {
        return json({ ok: false, error: reasonOf(error) }, 500)
      }
    }

    /** 写状态：勾上补全 reasoningEfforts，取消删除该字段（只动当前模型条目）。 */
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
        const enabled = body?.enabled === true
        if (!provider || !model) return json({ ok: false, error: '缺少 provider / model' }, 400)

        const profileDir = resolveProfileDir()
        if (!profileDir) throw new Error('定位不到 profile 目录（DSH_PROFILE_DIR / DSH_PROFILE 未设置，也没扫到装着本插件的 profile）')
        const file = patchFileOf(profileDir)
        if (!existsSync(file)) throw new Error(`profile 补丁文件不存在：${file}`)

        const { parseDocument } = await yamlModule()
        const doc = parseDocument(readFileSync(file, 'utf8'))
        const entry = llmEntryIndex(doc)
        if (entry < 0) return json({ ok: false, error: 'llm-pi-ai 未在 profile 的 cordis.patch.yml 中找到' }, 404)
        const located = modelEntryPath(doc, entry, provider, model)
        if (!located.ok) return json({ ok: false, error: located.why }, 404)

        if (enabled) {
          doc.setIn([...located.base, 'reasoningEfforts'], DEFAULT_EFFORTS)
        } else {
          doc.deleteIn([...located.base, 'reasoningEfforts'])
        }
        writeFileAtomic(file, doc.toString({ lineWidth: 0 }))
        console.error(`${TAG} ${enabled ? '已补全' : '已删除'} reasoningEfforts：${provider} / ${model} -> ${file}`)
        // 取消声明后，该模型的档位已不可用，记忆也没意义了。
        if (!enabled) forgetEffort(routeKey(provider, model))
        return json({ ok: true, provider, model, enabled, profile: basename(profileDir), patch: file })
      } catch (error) {
        return json({ ok: false, error: reasonOf(error) }, 500)
      }
    }

    const routes = [
      { path: API_STATE, methods: ['GET'], fetch: (request) => handleState(request) },
      { path: API_SET, methods: ['POST'], fetch: (request) => handleSet(request) }
    ]
    // 一条一条注册、各自 try：热重载时一条失败不连累另一条
    for (const route of routes) {
      try {
        conn.fetch.register({ ...route, requestBody: 'buffered' })
        console.error(`${TAG} 接口已注册：${route.methods.join('/')} ${route.path}`)
      } catch (error) {
        console.error(`${TAG} 注册 ${route.path} 失败：${reasonOf(error)}`)
      }
    }

    const dir = resolveProfileDir()
    console.error(`${TAG} patch = ${dir ? patchFileOf(dir) : '（profile 目录未定位到）'}`)
  })
}

export function apply(ctx) {
  applyEffortMemory(ctx)
  applyRoutes(ctx)
}

export const inject = []

export default { name, apply }
