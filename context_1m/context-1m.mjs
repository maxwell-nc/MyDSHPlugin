/**
 * dsh-context-1m —— 为「当前模型」声明 / 删除 1M 上下文（host 半边）
 * =====================================================================
 *
 * 浏览器半边是一个勾选框（渲染在 `conversation.input.right`）：
 *
 *   - 勾选状态 = 当前模型在 llm-pi-ai 配置里是否声明了 `contextWindow`；
 *   - 勾上   → 往 profile 配置里（llm-pi-ai 条目里该模型的
 *             `providers.<provider>.models[]`）写入 `contextWindow: 1000000`
 *             （= 1M token 上下文窗口），并同时写入 `maxTokens: 128000`
 *             （= 128K 最大输出，覆盖 llm-pi-ai 默认的 32K）；
 *   - 取消   → 从该模型条目里**删除** `contextWindow` 与 `maxTokens` 字段，
 *             让模型回到原来的上下文与默认的 32K 最大输出
 *             （适配器自带的值，或 provider 的 `defaultContextWindow` / `defaultMaxTokens`）。
 *
 * 为什么改的是配置而不是请求参数：DSH 的上下文容量靠模型目录声明。
 * llm-pi-ai 校验层只接受模型声明过的 `contextWindow`（正整数，单位 token）；
 * 模型没声明时用 provider 的 `defaultContextWindow`（默认 1e6 = 1M）兜底。
 * 若某个模型当前实际是较小的窗口（比如 128K），勾上本插件就把它显式抬到 1M，
 * 取消则删掉字段、回到它原来的窗口。上下文压力 / 自动压缩也会按这个值计算。
 *
 * 生效方式：写入走宿主的 `ctx.configEditor.edit()`，它会在同一个调用里调和 Loader
 * （reconcileProfilePatches），所以容量提示通常立刻更新；若没有，重开 profile /
 * 重启 dsh 即生效。
 *
 * profile 定位：优先 `DSH_PROFILE_DIR` → `DSH_HOME`+`DSH_PROFILE` → 兜底扫描
 * `$DSH_HOME/profiles/*` 找装了本插件的目录（多个时取 patch 文件最新改动的）。
 *
 * 配置读写不再自己解析 YAML —— Desktop 只装桌面版时，插件根本 import 不到 `yaml`
 * （profile 的 node_modules 只放 profile 安装的 bundle，里面的 yaml 软链还可能指向
 * 已经删掉的 CLI 安装）。改走宿主自己的 `ctx.configEditor` 服务：由它加锁、写 profile
 * 补丁层、调和 Loader 热重载。代价是 llm-pi-ai 那一行会由宿主重新序列化（文件里其余
 * 行与注释不受影响）。
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

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
      const patch = patchFileOf(dir)
      if (!existsSync(marker) || !existsSync(patch)) continue
      const rec = { dir, patchMtime: statSync(patch).mtimeMs }
      if (best === null || rec.patchMtime > best.patchMtime) best = rec
    }
  } catch { /* 扫描失败就交给上层报错 */ }
  return best ? best.dir : null
}

/** profile 下的用户补丁层。 */
function patchFileOf(profileDir) {
  return join(profileDir, 'cordis.patch.yml')
}

/* -------------------------------------------------------------------------- */
/* profile 配置：交给宿主的 configEditor 服务                                    */
/* -------------------------------------------------------------------------- */

/**
 * 宿主的 profile 配置编辑器（`config-editor` 插件提供）。没有它（没挂 profile
 * 配置层）时返回 undefined，由调用方报错。
 */
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

/**
 * 在 llm-pi-ai 的 config（跨层合成后的原始形态）里定位 (provider, model) 的模型条目。
 * @returns `{ ok: true, target }` 或 `{ ok: false, why }`。
 */
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

    /** 读状态：当前模型有没有声明 contextWindow（每次回读宿主里的实时配置）。 */
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
        const located = provider && model ? locateModel(entry.options?.config ?? {}, provider, model) : { ok: false }
        const declared = located.ok ? located.target.contextWindow : undefined
        const declaredMaxTokens = located.ok ? located.target.maxTokens : undefined
        const has = declared !== undefined
        return json({ ok: true, provider, model, has, declared, declaredMaxTokens, profile: basename(dirname(patch)), patch })
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

        const editor = configEditorOf(ctx)
        if (editor === undefined) throw new Error('宿主的 configEditor 服务不可用（当前 profile 没挂 profile 配置层）')
        const entry = llmEntryOf(editor)
        if (entry === undefined) return json({ ok: false, error: 'llm-pi-ai 不在当前 profile 的插件树里' }, 404)
        const patch = editor.documentPath

        const before = locateModel(entry.options?.config ?? {}, provider, model)
        if (!before.ok) return json({ ok: false, error: before.why }, 404)
        // 已经是目标状态就别写盘了：edit 会把 llm-pi-ai 那一行重新序列化，没必要白改一次排版。
        const already = enabled
          ? before.target.contextWindow === CONTEXT_1M && before.target.maxTokens === MAX_TOKENS_128K
          : before.target.contextWindow === undefined && before.target.maxTokens === undefined
        if (already) {
          return json({ ok: true, provider, model, enabled, changed: false, profile: basename(dirname(patch)), patch })
        }

        // edit 会加锁、重新读盘、校验（丢给 llm-pi-ai 自己的 Config）、写文件并调和 Loader 热重载。
        // change 里抛错 = 整次编辑失败，磁盘上不会留下半成品。
        await editor.edit(entry, (current) => {
          const config = current ?? {}
          const located = locateModel(config, provider, model)
          if (!located.ok) throw new Error(located.why)
          if (enabled) {
            located.target.contextWindow = CONTEXT_1M
            located.target.maxTokens = MAX_TOKENS_128K
          } else {
            delete located.target.contextWindow
            delete located.target.maxTokens
          }
          return config
        })
        console.error(`${TAG} ${enabled ? '已写入' : '已删除'} contextWindow + maxTokens：${provider} / ${model} -> ${patch}`)
        return json({ ok: true, provider, model, enabled, changed: true, profile: basename(dirname(patch)), patch })
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

    const editor = configEditorOf(ctx)
    const llm = editor === undefined ? undefined : llmEntryOf(editor)
    console.error(`${TAG} patch = ${editor?.documentPath ?? '（configEditor 不可用）'}${llm === undefined ? '，llm-pi-ai 条目未找到' : ''}`)
  })
}

export const inject = []

export default { name, apply }
