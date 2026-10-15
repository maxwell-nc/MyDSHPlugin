/**
 * dsh-context-1m —— 为「当前模型」声明 / 删除 1M 上下文（host 半边）
 * =====================================================================
 *
 * 浏览器半边是一个勾选框（渲染在 `conversation.input.right`）：
 *
 *   - 勾选状态 = 当前模型在 llm-pi-ai 配置里是否声明了 `contextWindow`；
 *   - 勾上   → 往 profile 的 `cordis.patch.yml`（llm-pi-ai 条目里该模型的
 *             `providers.<provider>.models[]`）写入 `contextWindow: 1000000`
 *             （= 1M token 上下文窗口），并同时写入 `maxTokens: 128000`
 *             （= 128K 最大输出，覆盖 llm-pi-ai 默认的 32K）；
 *   - 取消   → 从该模型条目里**删除** `contextWindow` 与 `maxTokens` 字段，
 *             让模型回到原来的上下文与默认的 32K 最大输出
 *             （适配器自带的值，或 provider 的 `defaultContextWindow` / `defaultMaxTokens`）。
 *
 * 为什么改的是 patch 文件而不是请求参数：DSH 的上下文容量靠模型目录声明。
 * llm-pi-ai 校验层只接受模型声明过的 `contextWindow`（正整数，单位 token）；
 * 模型没声明时用 provider 的 `defaultContextWindow`（默认 1e6 = 1M）兜底。
 * 若某个模型当前实际是较小的窗口（比如 128K），勾上本插件就把它显式抬到 1M，
 * 取消则删掉字段、回到它原来的窗口。上下文压力 / 自动压缩也会按这个值计算。
 *
 * 生效方式：patch 文件写入后，长驻 surface（web GUI）会热重载 profile 补丁层；
 * 若上下文容量提示没有立刻变化，重开 profile / 重启 dsh 即生效。
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
export const name = 'dsh-context-1m'

const TAG = '[dsh-context-1m]'
const API_STATE = '/api/dsh-context-1m.state'
const API_SET = '/api/dsh-context-1m.set'

/** 勾上时写入的上下文窗口（token）：1M。 */
const CONTEXT_1M = 1000000

/** 勾上时一并写入的最大输出（token）：128000（十进制 128K，覆盖 llm-pi-ai 默认的 32K）。 */
const MAX_TOKENS_128K = 128000

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
      const marker = join(dir, 'node_modules', 'dsh-context-1m')
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

function writePatchAtomic(file, content) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, file)
}

/** 从 Request 里取查询参数（兼容绝对/相对 URL）。 */
function queryParamsOf(request) {
  const urlText = String(request.url ?? '')
  const qIndex = urlText.indexOf('?')
  return new URLSearchParams(qIndex >= 0 ? urlText.slice(qIndex + 1) : '')
}

/* -------------------------------------------------------------------------- */
/* 面板 / API                                                                   */
/* -------------------------------------------------------------------------- */

export function apply(ctx) {
  ctx.inject(['connection'], (scoped) => {
    const conn = scoped.connection

    /** 读状态：当前模型有没有声明 1M 上下文（每次回读文件）。 */
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
        const has = !!(located.ok && doc.getIn([...located.base, 'contextWindow']) !== undefined)
        const declared = has ? doc.getIn([...located.base, 'contextWindow']) : undefined
        const declaredMaxTokens = located.ok ? doc.getIn([...located.base, 'maxTokens']) : undefined
        return json({ ok: true, provider, model, has, declared, declaredMaxTokens, profile: basename(profileDir), patch: file })
      } catch (error) {
        return json({ ok: false, error: reasonOf(error) }, 500)
      }
    }

    /** 写状态：勾上写入 contextWindow=1M + maxTokens=128K，取消删除这两个字段（只动当前模型条目）。 */
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
          doc.setIn([...located.base, 'contextWindow'], CONTEXT_1M)
          doc.setIn([...located.base, 'maxTokens'], MAX_TOKENS_128K)
        } else {
          doc.deleteIn([...located.base, 'contextWindow'])
          doc.deleteIn([...located.base, 'maxTokens'])
        }
        writePatchAtomic(file, doc.toString({ lineWidth: 0 }))
        console.error(`${TAG} ${enabled ? '已写入' : '已删除'} contextWindow + maxTokens：${provider} / ${model} -> ${file}`)
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

export const inject = []

export default { name, apply }