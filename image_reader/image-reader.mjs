/**
 * dsh-image-reader —— 给纯文本模型加一双「借来的眼睛」
 * ================================================================
 *
 * 问题：一个模型若没有声明 `input: [text, image]`（比如 llm-pi-ai 路由里
 * 的 ctai_my/glm-5.3，默认 `DEFAULT_INPUT = ["text"]`），用户贴图后图片会被
 * 投影成 `[image omitted because this model accepts text only; attachment
 * sha256:xxxx]` 占位文本，模型自己读不了截图，「查一下这张图里 xx 按钮的
 * 坐标」这类任务直接卡死。
 *
 * 本插件的解法（host 半边，这里）：
 *
 *   1. 全局注册 `read_image_details` 工具：模型传「图片（路径 / URL /
 *      data:URL / attachment:sha256摘要前缀）+ 想了解的问题」；
 *   2. 每步发起模型请求前的 `system-prompt/assemble` waterfall 里读取当前
 *      会话正在用的模型，按**模型声明**（llm.resolveModelInfo →
 *      inputModalities）判断：当前模型自己能看图 → 把该工具从本步的工具
 *      schema 列表里摘掉；不能看图 → 保留。可见性随模型切换实时跟随；
 *   3. 工具执行时：把图片经 attachments.saveImage() 落成持久化附件引用
 *      （ImageAttachmentRef，本地存档会做归一化/压缩），然后对设置面板指定
 *      的**多模态模型**发起一次 `llm.stream()` 视觉请求（内容块
 *      {type:'image', attachment}，pi-ai adapter 自己会 readImageRequest →
 *      base64），把视觉模型的回答原样带回调用方（例如：直接返回
 *      「xx 按钮坐标 (x, y)」）。拿到 usage 后经宿主事件 `dsh-usage/report`
 *      上报给 dsh-usage —— 视觉桥接是直接 llm.stream、不经 agent loop，会话里
 *      没有结算事件，不主动上报 usage 插件就记不到这一笔 token；
 *   4. 设置面板（浏览器半边 lib/client.js 注册 settings.section，走本半边
 *      `/api/dsh-image-reader.catalog|config` 两条 connection 路由）：选视觉
 *      模型（只列声明支持图片输入的）、超时、maxTokens、工具显示策略；写入
 *      走 settings 服务（volatile 字段，免重启生效）。
 *
 * -----------------------------------------------------------------------
 * 实现依据（每一处都对过宿主源码，别想当然改）：
 *
 * * `llm.stream(options: GenerateOptions)`：{provider, model, messages,
 *   system?, maxTokens?, signal?, ...}（dsh-llm/lib/typert.host.js 的精确定义）。
 *   图片用内容块 `{type:'image', attachment: ImageAttachmentRef}`：dsh-llm 在
 *   目标模型 inputModalities 不含 image 时会把图片降级成占位文本（index.js
 *   projectImagesForTextModel），pi-ai adapter 则用 attachments.readImageRequest
 *   把持久化引用转成 base64。直调范式与 dsh-session-title-llm 完全一致。
 * * 工具注册：`ctx.tools.register(defineTool({name, description, parameters,
 *   output:{schema, render}, execute}))`（dsh-tool-present 同款）。
 *   **模型看到的是 output.render 产出的内容块**（createSuccessResult 用
 *   render 产出 result.content 写进 tool/result 消息），所以视觉模型的答案
 *   必须完整出现在 render 文本里。
 * * 可见性过滤：AgentLoop.preStep 每步 systemPrompt.assemble()，`assembly.tools`
 *   就是本步模型可见的工具列表；在 agent.ctx 上 on('system-prompt/assemble')
 *   改返回值即可（installModelSelection 同款挂法）。摘掉/加回后宿主自己会
 *   依据 header diff 发 tool-addition/tool-removal 消息，不用插件管。
 * * 当前模型路由（与 dsh-api-session-controller selectionFor / agent-loop
 *   prepareRequest 完全相同的优先级）：
 *   sessionProjections.stateOf(session,'modelSelection').pending（用户刚选）
 *   → session.requestHeader().config（上次请求头）→ agent.options（新代理）
 *   → agentDefaultModel.currentSelection()（默认模型）。
 * * 图片持久化：attachments.saveImage({data, mediaType, name?}) 返回
 *   ImageAttachmentRef。本地存档会校验「声明的 mediaType 与字节内容一致」
 *   （IMAGE_TYPE_MISMATCH），所以必须魔数嗅探真实类型（内置 read_image
 *   工具同款 sniffImageMediaType 逻辑）。限额按 attachments.imageLimits。
 *   saveImage 可能抛的 AttachmentError 码：IMAGE_DIMENSION_TOO_LARGE /
 *   IMAGE_TOO_MANY_PIXELS / IMAGE_TOO_LARGE / INVALID_IMAGE /
 *   IMAGE_TYPE_MISMATCH / ATTACHMENT_WRITE_FAILED（16-bit PNG 转码失败）——
 *   都给出下一步建议。
 * * 会话里被省略的图（占位文本带 sha256 前 8 位）：`exec.agent.session.
 *   deriveMessages()` 遍历 image 内容块按 attachmentId 前缀匹配，找回完整
 *   ImageAttachmentRef 直接复用——用户已经贴过的图视觉桥接也能救回来。
 * * 配置存储：本插件条目（profile patch 里 `id: dsh-image-reader`）的 Config
 *   字段全部 `.volatile()`，经 settings 服务读写（写走 configEditor →
 *   profile patch，宿主对 volatile-only 变更是原地热应用的）。就算不热应用
 *   也没关系——工具执行与可见性判断都**现读 settings.describe()**，不依赖
 *   apply 时的 config 快照。
 * * 模块导入：@deepseek-ai/* 是宿主 shared package
 *   （desktop-runtime.json sharedPackages），profile-resolution-bootstrap
 *   把裸说明符路由到宿主安装树，插件里 import 是安全的。
 * * connection.fetch 的 handler 返回 `Response.json(...)`（undici 全局），
 *   与 dsh-multimodal / dsh-usage 相同用法。
 */

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'image-reader'

const TAG = '[dsh-image-reader]'
/** 本插件在 settings 服务里的命名空间 = profile patch 里的条目 id。 */
const ENTRY_NS = 'dsh-image-reader'
/** 模型可见的工具名（read_image 与内置工具重名，不能用）。 */
const TOOL_NAME = 'read_image_details'
/** 设置面板用的两条 connection 路由。 */
const API_CATALOG = '/api/dsh-image-reader.catalog'
const API_CONFIG = '/api/dsh-image-reader.config'
/** 能力缓存的 TTL：声明式能力基本不变，但 llm-pi-ai 的 input 可以被用户改。 */
const CAPABILITY_TTL_MS = 60_000
/** 拉模型目录时每个 provider 的超时。 */
const DISCOVERY_TIMEOUT_MS = 8_000
/** 抓 URL 图片的超时。 */
const URL_FETCH_TIMEOUT_MS = 30_000
/** attachment:sha256 前缀允许的最短长度（占位文本里给的就是 8 位十六进制）。 */
const MIN_DIGEST_CHARS = 8

/** Loader 需要的 Config（settings 表单只投影 volatile 字段，所以全部标 volatile）。 */
export const Config = z.object({
  /** 视觉模型 provider；空串 = 自动选（第一个声明支持图片输入的模型）。 */
  provider: z.string().default('').volatile(),
  /** 视觉模型 id；空串 = 自动选。 */
  model: z.string().default('').volatile(),
  /** 工具显示策略：auto=按当前模型声明自动（推荐）/ always=总是显示 / never=藏起来。 */
  visibility: z.union([z.const('auto'), z.const('always'), z.const('never')]).default('auto').volatile(),
  /** 视觉请求的 maxTokens（默认 32k：读图答案偶尔不短，截断太伤体验）。 */
  maxTokens: z.number().step(1).min(256).max(65536).default(32768).volatile(),
  /** 视觉请求的超时（毫秒）。 */
  timeoutMs: z.number().step(1).min(10000).max(600000).default(180000).volatile()
})

/** 本插件的必需服务：工具注册 + LLM 调用 + 附件落库 + 文件读取。 */
export const inject = ['tools', 'llm', 'attachments', 'fs']

/** Promise 加超时（不碰输入 promise 本身，不含取消传播）。 */
function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超过 ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** connection.fetch 用的 JSON 响应（dsh-multimodal 同款）。 */
const jsonResponse = (data, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } })

/**
 * 魔数嗅探真实媒体类型：saveImage 校验声明类型与字节一致
 * （IMAGE_TYPE_MISMATCH），扩展名不可信（逻辑对齐内置 read_image）。
 */
function detectImageMediaType(bytes) {
  if (bytes.length >= 24) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
      && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif'
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  }
  return undefined
}

/** 文件名的显示版（作为附件名带给视觉模型，长度按宿主 displayName 的口径）。 */
function baseNameOf(pathLike) {
  const clean = String(pathLike).split(/[\\/]/).filter(Boolean).pop() ?? ''
  return clean.length > 0 && clean.length <= 255 ? clean : undefined
}

/** 附件服务报错 → 带下一步建议的中文错误（错误码对齐 dsh-attachment）。 */
function rethrowAttachmentError(error, label) {
  const what = error?.code ?? ''
  switch (what) {
    case 'IMAGE_DIMENSION_TOO_LARGE':
      throw new Error(`${label}：至少一条边超过部署的图片边长上限，请先缩小图片再试`, { cause: error })
    case 'IMAGE_TOO_MANY_PIXELS':
      throw new Error(`${label}：解码像素超过部署上限，请先缩小图片再试`, { cause: error })
    case 'IMAGE_TOO_LARGE':
      throw new Error(`${label}：图片体积超过部署的附件字节上限，请压缩后再试`, { cause: error })
    case 'INVALID_IMAGE':
      throw new Error(`${label}：字节无法解码为 png/jpeg/webp/gif（文件可能被截断或损坏）`, { cause: error })
    case 'IMAGE_TYPE_MISMATCH':
      throw new Error(`${label}：魔数与实际格式不一致（比如 png 改名成 .jpg），请改正扩展名或转码`, { cause: error })
    case 'ATTACHMENT_WRITE_FAILED':
      throw new Error(`${label}：附件归一化失败（如 16-bit PNG），请转成 8-bit png/jpeg/webp 再试`, { cause: error })
    default:
      throw error
  }
}

/** 给视觉模型的固定系统提示（对齐宿主 requestImageHandleText 的坐标系约定）。 */
const VISION_SYSTEM_PROMPT = [
  'You are the image-analysis half of a two-model relay: the sending model cannot view images, so it forwarded one image and one question to you.',
  'Answer using ONLY what the image actually shows.',
  'Rules:',
  // 这条是为 space-bunny 这类「智能体出身的模型」硬加的：它们原生认识
  // bash/read 等自家工具名，采样方差一大就退化成发工具调用（实测会带着
  // OpenCode zen 的工具栈出血），而本请求是纯问答转发、没有任何工具。
  '- You have NO tools and no executor is attached: never emit tool/function calls; answer directly in your final text.',
  '- Reply in the language of the question; be direct and concise; do not repeat the question; do not describe unrelated parts.',
  '- The image arrives with a text handle naming its exact request dimensions (WxH). Report coordinates in THAT request-image pixel space: origin at the top-left corner, x to the right, y downward, "(x, y)" format. State which point the coordinates refer to (e.g. element center) and how you located it.',
  '- For reading tasks, transcribe faithfully; for counting tasks, give the number and the basis; for judgement tasks, give the conclusion and visible evidence.',
  '- If the image does not contain the answer or you are unsure, say so explicitly. Never invent content.'
].join('\n')

export function apply(ctx, config) {
  // ================================================================ 实时配置
  /** 每次 tool 调用 / 每步可见性判断都现读 settings；读不到再退回 apply 时的值。 */
  const liveConfig = () => {
    const fallback = {
      provider: typeof config?.provider === 'string' ? config.provider : '',
      model: typeof config?.model === 'string' ? config.model : '',
      visibility: config?.visibility === 'always' || config?.visibility === 'never' ? config.visibility : 'auto',
      maxTokens: Number.isFinite(config?.maxTokens) ? config.maxTokens : 32768,
      timeoutMs: Number.isFinite(config?.timeoutMs) ? config.timeoutMs : 180000
    }
    try {
      const settings = ctx.get('settings')
      if (typeof settings?.describe !== 'function') return fallback
      const value = settings.describe().find((entry) => entry.ns === ENTRY_NS)?.value
      if (typeof value !== 'object' || value === null) return fallback
      const merged = { ...fallback }
      if (typeof value.provider === 'string') merged.provider = value.provider
      if (typeof value.model === 'string') merged.model = value.model
      if (value.visibility === 'auto' || value.visibility === 'always' || value.visibility === 'never') merged.visibility = value.visibility
      if (Number.isFinite(value.maxTokens) && value.maxTokens >= 256 && value.maxTokens <= 65536) merged.maxTokens = Math.floor(value.maxTokens)
      if (Number.isFinite(value.timeoutMs) && value.timeoutMs >= 10000 && value.timeoutMs <= 600000) merged.timeoutMs = Math.floor(value.timeoutMs)
      return merged
    } catch {
      return fallback
    }
  }

  // ================================================================ 能力缓存
  /** `${provider}\0${model}` → { input, at }；llm/adapters-updated 或 TTL 过期失效。 */
  const capabilityCache = new Map()
  ctx.on('llm/adapters-updated', () => {
    capabilityCache.clear()
    discoveryCache = { at: 0, rows: undefined }
  })

  /** 模型声明的 inputModalities（dsh-llm resolveModelInfo；pi-ai 是纯内存读）。 */
  const declaredInput = async (provider, model, signal) => {
    const key = `${provider}\u0000${model}`
    const hit = capabilityCache.get(key)
    const now = Date.now()
    if (hit !== undefined && now - hit.at < CAPABILITY_TTL_MS) return hit.input
    const info = await ctx.llm.resolveModelInfo(provider, model, signal)
    const input = info?.inputModalities !== undefined && info.inputModalities !== null
      ? Array.isArray(info.inputModalities) ? [...info.inputModalities] : undefined
      : undefined
    capabilityCache.set(key, { input, at: now })
    return input
  }

  /** 按声明是否支持图片输入（未声明按不支持处理）。 */
  const supportsImage = async (provider, model, signal) => {
    const input = await declaredInput(provider, model, signal)
    return input !== undefined && input.includes('image')
  }

  // ================================================================ 模型目录
  let discoveryCache = { at: 0, rows: undefined }
  /** 全量模型目录（带是否声明图片输入），设置面板与「自动选择」共用。 */
  const discoverModels = async (signal) => {
    if (discoveryCache.rows !== undefined && Date.now() - discoveryCache.at < CAPABILITY_TTL_MS) {
      return discoveryCache.rows
    }
    const rows = []
    const providers = await withTimeout(ctx.llm.listProviders(), DISCOVERY_TIMEOUT_MS, 'listProviders')
    for (const provider of providers ?? []) {
      if (signal?.aborted) break
      try {
        const models = await withTimeout(ctx.llm.listModels(provider.id), DISCOVERY_TIMEOUT_MS, `listModels(${provider.id})`)
        for (const model of Array.isArray(models) ? models : []) {
          rows.push({
            provider: provider.id,
            providerName: typeof provider.name === 'string' && provider.name.length > 0 ? provider.name : provider.id,
            model: model.id,
            name: typeof model.name === 'string' && model.name.length > 0 ? model.name : model.id,
            image: Array.isArray(model.inputModalities) && model.inputModalities.includes('image')
          })
        }
      } catch (error) {
        console.error(`${TAG} 列 provider "${provider.id}" 的模型失败: ${String(error?.message ?? error)}`)
      }
    }
    discoveryCache = { at: Date.now(), rows }
    return rows
  }

  /** 自动选择：第一个声明支持图片输入的模型（provider 顺序稳定、确定性）。 */
  const autoVisionModel = async (signal) => {
    const rows = await discoverModels(signal)
    const hit = rows.find((row) => row.image === true)
    if (hit === undefined) {
      throw new Error('dsh-image-reader: 没有找到任何声明支持图片输入的模型；请在设置 → 图像解读里手动指定视觉模型，或用 dsh-multimodal 给某个模型勾选「图片」')
    }
    return { provider: hit.provider, model: hit.model, auto: true }
  }

  /** 生效中的视觉模型：显式配置优先，否则自动选。 */
  const resolveVisionModel = async (signal) => {
    const current = liveConfig()
    if (current.provider.length > 0 && current.model.length > 0) {
      return { provider: current.provider, model: current.model, auto: false }
    }
    return autoVisionModel(signal)
  }

  // ================================================================ 会话当前模型
  /**
   * 当前会话将要用的模型（选择优先级与宿主 selectionFor / prepareRequest 一致）：
   * pending 选择（用户刚在模型选择器里切了、还没发消息）→ 上次请求头 →
   * agent.options（子代理/fresh）→ 默认模型。
   */
  const sessionRoute = (agent) => {
    try {
      const projections = ctx.get('sessionProjections')
      const pending = projections?.stateOf?.(agent.session, 'modelSelection')?.pending
      if (typeof pending?.provider === 'string' && pending.provider.length > 0
        && typeof pending?.model === 'string' && pending.model.length > 0) {
        return { provider: pending.provider, model: pending.model }
      }
    } catch { /* 投影服务不在（headless 组合）就往下兜 */ }
    const logged = agent.session.requestHeader()?.config
    if (typeof logged?.provider === 'string' && logged.provider.length > 0
      && typeof logged?.model === 'string' && logged.model.length > 0) {
      return { provider: logged.provider, model: logged.model }
    }
    if (typeof agent.options?.provider === 'string' && agent.options.provider.length > 0
      && typeof agent.options?.model === 'string' && agent.options.model.length > 0) {
      return { provider: agent.options.provider, model: agent.options.model }
    }
    try {
      const defaults = ctx.get('agentDefaultModel')
      const selection = defaults?.currentSelection?.()
      if (typeof selection?.provider === 'string' && selection.provider.length > 0
        && typeof selection?.model === 'string' && selection.model.length > 0) {
        return { provider: selection.provider, model: selection.model }
      }
    } catch { /* ignore */ }
    return undefined
  }

  // ================================================================ 工具可见性
  /** 每台 agent 安装一次：agent.ctx 上的 system-prompt/assemble waterfall。 */
  const installed = new WeakSet()
  const installForAgent = (agent) => {
    if (installed.has(agent)) return
    installed.add(agent)
    agent.ctx.on('system-prompt/assemble', async (assembly, context, next) => {
      const assembled = await next()
      try {
        const settings = liveConfig()
        const keep = assembled.tools.filter((tool) => tool.name !== TOOL_NAME)
        if (settings.visibility === 'never') {
          return keep.length === assembled.tools.length ? assembled : { ...assembled, tools: keep }
        }
        if (settings.visibility === 'always') return assembled
        const subject = context?.agent ?? agent
        if (subject === undefined) return assembled
        const route = sessionRoute(subject)
        if (route === undefined) return assembled
        const canSee = await supportsImage(route.provider, route.model, context?.signal)
        // 声明支持图片输入 → 当前模型自己能看图 → 摘掉替身工具
        if (canSee) return keep.length === assembled.tools.length ? assembled : { ...assembled, tools: keep }
      } catch (error) {
        // 保底显示：判断失败顶多多用一次工具，把 agent 一步搞挂不可接受
        console.error(`${TAG} 可见性判断失败（保底显示）: ${String(error?.message ?? error)}`)
      }
      return assembled
    })
  }

  ctx.on('agent/created', async ({ agent }) => {
    installForAgent(agent)
  })
  // 热装场景：宿主里已经在跑的 agent 也要补装
  try {
    const agents = ctx.get('agents')
    if (typeof agents?.list === 'function') for (const agent of agents.list()) installForAgent(agent)
  } catch { /* ignore */ }

  // ================================================================ 图片获取
  /** attachment:sha256: 前缀 → 会话历史里被省略的图的完整附件引用。 */
  const attachmentFromHistory = (digest, agent) => {
    if (typeof agent?.session?.deriveMessages !== 'function') {
      throw new Error('attachment: 引用需要 agent 会话，但当前执行上下文没有')
    }
    const wanted = String(digest).toLowerCase().replace(/^sha256:/, '')
    if (!/^[0-9a-f]+$/.test(wanted) || wanted.length < MIN_DIGEST_CHARS) {
      throw new Error(`attachment: 后面要跟 sha256 十六进制摘要（至少 ${MIN_DIGEST_CHARS} 位），收到 "${digest}"`)
    }
    for (const message of agent.session.deriveMessages()) {
      for (const block of Array.isArray(message.content) ? message.content : []) {
        if (block?.type === 'image' && typeof block.attachment?.attachmentId === 'string'
          && block.attachment.attachmentId.toLowerCase().includes(wanted)) {
          return block.attachment
        }
      }
    }
    throw new Error(`会话历史里没有摘要包含 "${wanted}" 的图片附件（占位文本里的 sha256 前 ${MIN_DIGEST_CHARS} 位抄过来即可）`)
  }

  /** data:URL → {data, mediaType}。 */
  const dataUrlImage = (image) => {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(image.trim())
    if (match === null) {
      throw new Error(`data: URL 不合法（只支持 base64 的 png/jpeg/webp/gif），收到 ${image.slice(0, 64)}…`)
    }
    const data = new Uint8Array(Buffer.from(match[2], 'base64'))
    if (data.byteLength === 0) throw new Error('data: URL 解码后为空')
    return { data, mediaType: match[1] }
  }

  /** http(s) URL → 下载 + 魔数嗅探（大小不超过附件限额）。 */
  const urlImage = async (url, signal) => {
    const limits = ctx.attachments.imageLimits
    const maxBytes = Number.isFinite(limits?.maxImageBytes) ? limits.maxImageBytes : 20 * 1024 * 1024
    const allowed = Array.isArray(limits?.mediaTypes) ? limits.mediaTypes : ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error(`下载图片超过 ${URL_FETCH_TIMEOUT_MS}ms`)), URL_FETCH_TIMEOUT_MS)
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const response = await fetch(url, { redirect: 'follow', signal: controller.signal })
      if (!response.ok) throw new Error(`下载图片失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`)
      const data = new Uint8Array(await response.arrayBuffer())
      if (data.byteLength === 0) throw new Error('下载的图片为空')
      if (data.byteLength > maxBytes) throw new Error(`下载的图片 ${data.byteLength} 字节，超过附件限额 ${maxBytes}`)
      let mediaType = detectImageMediaType(data)
      if (mediaType === undefined) {
        const declared = String(response.headers?.get?.('content-type') ?? '').toLowerCase().split(';')[0]
        mediaType = allowed.includes(declared) ? declared : undefined
      }
      if (mediaType === undefined) {
        throw new Error(`下载的内容嗅探不出图片格式（png/jpeg/webp/gif），Content-Type=${response.headers?.get?.('content-type') ?? '(none)'}`)
      }
      const name = (() => {
        try {
          return baseNameOf(new URL(url).pathname)
        } catch {
          return undefined
        }
      })()
      return { data, mediaType, ...(name !== undefined ? { name } : {}) }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  /** 本地/工作区路径 → {data, mediaType, name}：按会话 cwd 解析，魔数嗅探。 */
  const pathImage = async (path, agent, signal) => {
    const limits = ctx.attachments.imageLimits
    const maxBytes = Number.isFinite(limits?.maxImageBytes) ? limits.maxImageBytes : 20 * 1024 * 1024
    const options = { ...(signal !== undefined ? { signal } : {}) }
    const cwd = agent?.session?.header?.cwd
    if (typeof cwd === 'string' && cwd.length > 0) options.cwd = cwd
    const target = await ctx.fs.resolve(path, options)
    const data = await ctx.fs.readBytes(target, signal, maxBytes + 1)
    if (data.byteLength === 0) throw new Error(`图片文件为空：${path}`)
    if (data.byteLength > maxBytes) throw new Error(`图片 ${data.byteLength} 字节，超过附件限额 ${maxBytes}：${path}`)
    const mediaType = detectImageMediaType(data)
    if (mediaType === undefined) throw new Error(`无法识别的图片格式（只支持 png/jpeg/webp/gif）：${path}`)
    const name = baseNameOf(path)
    return { data, mediaType, ...(name !== undefined ? { name } : {}) }
  }

  /** 四类来源统一成持久化 ImageAttachmentRef（历史附件直接复用，不重复落库）。 */
  const resolveImageRef = async (value, agent, signal) => {
    if (typeof value !== 'string' || value.trim().length === 0) throw new Error('image 参数不能为空')
    const image = value.trim()
    const acquirers = [
      {
        test: image.startsWith('attachment:'),
        acquire: () => attachmentFromHistory(image.slice('attachment:'.length), agent)
      },
      {
        test: /^sha256:[0-9a-f]+$/i.test(image),
        acquire: () => attachmentFromHistory(image, agent)
      },
      {
        test: image.startsWith('data:'),
        acquire: async () => {
          const acquired = dataUrlImage(image)
          return { acquired, save: true }
        }
      },
      {
        test: /^https?:\/\//.test(image),
        acquire: async () => {
          const acquired = await urlImage(image, signal)
          return { acquired, save: true }
        }
      }
    ]
    for (const { test, acquire } of acquirers) {
      if (!test) continue
      const outcome = await acquire()
      if (outcome?.save === true) {
        try {
          return await ctx.attachments.saveImage({
            data: outcome.acquired.data,
            mediaType: outcome.acquired.mediaType,
            ...(outcome.acquired.name !== undefined ? { name: outcome.acquired.name } : {})
          })
        } catch (error) {
          if (typeof error?.code === 'string' && error.code.startsWith('IMAGE') === true) {
            rethrowAttachmentError(error, '保存图片失败')
          }
          throw error
        }
      }
      // attachment: 引用直接就是 ImageAttachmentRef
      return outcome
    }
    const acquired = await pathImage(image, agent, signal)
    try {
      return await ctx.attachments.saveImage({
        data: acquired.data,
        mediaType: acquired.mediaType,
        ...(acquired.name !== undefined ? { name: acquired.name } : {})
      })
    } catch (error) {
      if (typeof error?.code === 'string' && error.code.startsWith('IMAGE') === true) {
        rethrowAttachmentError(error, '保存图片失败')
      }
      throw error
    }
  }

  // ================================================================ 视觉请求
  /**
   * 对视觉模型的直接流式提问（dsh-session-title-llm 同款范式）。
   * GenerateOptions.purpose 只有 compaction/session-title 两种，辅助视觉请求不标。
   */
  const askVisionModel = async ({ vision, question, attachment, agent, timeoutMs, maxTokens, signal: callerSignal }) => {
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = callerSignal === undefined ? timeout : AbortSignal.any([timeout, callerSignal])
    const request = {
      provider: vision.provider,
      model: vision.model,
      messages: [createUserMessage({
        content: [
          { type: 'text', text: question },
          { type: 'image', attachment }
        ],
        source: { kind: 'dsh-image-reader' }
      })],
      system: VISION_SYSTEM_PROMPT,
      maxTokens,
      signal,
      ...(agent?.session?.id !== undefined ? { sessionId: agent.session.id } : {})
    }
    const assembler = new BlockAssembler()
    let finish
    let usage
    for await (const chunk of ctx.llm.stream(request)) {
      signal.throwIfAborted()
      assembler.push(chunk)
      if (chunk.type === 'usage') usage = chunk.usage
      if (chunk.type === 'finish') finish = chunk
    }
    if (signal.aborted) throw new Error(`视觉模型请求被取消或超时（${timeoutMs}ms）`)
    if (finish?.reason?.kind === 'aborted' || finish?.reason?.kind === 'error') {
      throw new Error(`视觉模型请求失败: ${String(finish.reason.failure?.message ?? finish.reason.kind)}`)
    }
    const blocks = assembler.blocks()
    const answer = blocks.filter((block) => block.type === 'text').map((block) => block.text).join('').trim()
    const toolCalls = blocks.filter((block) => block.type === 'tool-call')
    // 宽容收割：OpenCode zen 一类「代理网关背后的模型」偶尔带着服务端自家的
    // 工具栈，间歇性返回 tool-call 形态的响应。本插件没给它传任何工具，但只要
    // 正文里还有有效文本就照常返回（附一行备注说明忽略了 tool-call），不再
    // 一票否决；只有「既无文本又有 tool-call」才视为网关异常抛错——那时模型
    // 大概率想让我们去执行它自家工具，对纯读图请求毫无意义，宁可让调用方重试。
    if (answer.length === 0) {
      if (toolCalls.length > 0) {
        const names = toolCalls.map((block) => String(block?.name ?? '?')).join(', ')
        throw new Error(`视觉模型只返回了 tool-call（${names}）而没有文本答案，疑似网关塞了自家工具；请换一个候选模型或稍后重试`)
      }
      throw new Error('视觉模型没有返回文本答案（可能被安全策略拦了或返回为空）')
    }
    const finalAnswer = toolCalls.length > 0
      ? `${answer}\n\n（备注：视觉模型额外返回了 ${toolCalls.length} 个 tool-call 块，疑似其网关注入了自家工具；已忽略，仅取其文本回答。）`
      : answer
    return { answer: finalAnswer, truncated: finish?.reason?.kind === 'max-tokens', usage }
  }

  // ================================================================ 工具本体
  ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: [
      'Delegate image viewing to a multimodal (vision) model and return its answer verbatim.',
      'Use this whenever you need to SEE an image — screenshots, UI captures, photos, diagrams — but cannot view images directly in this conversation (the current model is text-only).',
      'Example: ask for "the pixel coordinates of the xx button" over a screenshot and you get back something like: the button center is at (512, 344) in the 1280x720 request image.',
      '该工具用于替你查看图片细节：传入图片（本地路径 / http(s) URL / data:URL / attachment:sha256摘要）和要了解的问题，由视觉模型解析后把答案原样带回来（答案语言跟随问题语言）。'
    ].join(' '),
    parameters: {
      image: {
        type: 'string',
        required: true,
        description: '要查看的图片。支持的写法：本地或工作区路径（如 D:/shots/a.png 或 screenshots/b.png，相对路径按会话工作目录解析）；http(s) URL；data:image/...;base64,... 完整数据 URL；attachment:sha256:xxxxxxxx（对话中被省略的图片的占位文本标注了该摘要，抄过来即可找回那张图）。'
      },
      question: {
        type: 'string',
        required: true,
        description: '需要从图片中了解的具体问题，一次问完。写给视觉模型直接可读，例如：图中「提交」按钮中心的像素坐标是多少？右下角弹窗的标题文字是什么？' ,
        examples: ['图中"提交"按钮中心的像素坐标是多少？', '这张截图里红色的提示条写的什么内容？']
      }
    },
    output: {
      // 值 schema DSL：required 是属性节点上的布尔（不是 JSON Schema 的数组
      // 形式），嵌套对象节点自身也要带 required: true（对齐内置 read_image
      // 的 IMAGE_VALUE_SCHEMA 写法）。
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          provider: {
            type: 'string',
            required: true
          },
          model: {
            type: 'string',
            required: true
          },
          auto: { type: 'boolean' },
          image: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              width: {
                type: 'integer',
                required: true
              },
              height: {
                type: 'integer',
                required: true
              },
              mediaType: {
                type: 'string',
                required: true
              },
              attachmentId: {
                type: 'string',
                required: true
              },
              name: { type: 'string' }
            }
          },
          answer: {
            type: 'string',
            required: true
          },
          truncated: { type: 'boolean' },
          inputTokens: { type: 'integer' },
          outputTokens: { type: 'integer' },
          elapsedMs: {
            type: 'integer',
            required: true
          }
        }
      },
      // 模型读到的是 render 的文本（result.content），视觉模型的答案必须完整在此。
      render: (_args, value) => {
        const lines = [
          `[${TOOL_NAME}] 视觉模型 ${value.provider}/${value.model} 读完图片后的回答：`,
          '',
          value.answer
        ]
        if (value.truncated === true) lines.push('', '（注意：回答因 maxTokens 被截断；需要更多信息请拆成更小的问题再问）')
        const meta = [
          `图片信息：${value.image.name !== undefined ? `${value.image.name} ` : ''}${value.image.width}x${value.image.height}px ${value.image.mediaType}（这是保存像素尺寸；视觉模型实际收到的可能是等比缩放后的请求图，坐标以其回答中声明的 request 尺寸为准）`
        ]
        if (Number.isFinite(value.inputTokens) || Number.isFinite(value.outputTokens)) {
          meta.push(`视觉请求 tokens：入 ${value.inputTokens ?? 0} / 出 ${value.outputTokens ?? 0}，耗时 ${value.elapsedMs}ms`)
        }
        lines.push('', meta.join('；'))
        return [{ type: 'text', text: lines.join('\n') }]
      }
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const started = Date.now()
      const signal = exec.signal
      if (typeof args?.image !== 'string' || args.image.trim().length === 0) throw new Error('image 参数不能为空')
      if (typeof args?.question !== 'string' || args.question.trim().length === 0) throw new Error('question 参数不能为空')
      signal.throwIfAborted()

      const current = liveConfig()
      const vision = await resolveVisionModel(signal)
      signal.throwIfAborted()

      // 指定的视觉模型必须声明支持图片输入，防止把请求发给又一个纯文本模型
      let capable
      try {
        capable = await supportsImage(vision.provider, vision.model, signal)
      } catch (error) {
        throw new Error(`检查视觉模型 ${vision.provider}/${vision.model} 的能力失败（可能未注册或网关不可达，请在设置 → 图像解读 里另选）：${String(error?.message ?? error)}`)
      }
      if (capable !== true) {
        throw new Error(`视觉模型 ${vision.provider}/${vision.model} 未声明支持图片输入，请在设置 → 图像解读 里另选多模态模型（或用 dsh-multimodal 给它勾选「图片」）`)
      }

      const attachment = await resolveImageRef(args.image, exec.agent, signal)
      signal.throwIfAborted()

      const result = await askVisionModel({
        vision,
        question: args.question,
        attachment,
        agent: exec.agent,
        timeoutMs: current.timeoutMs,
        maxTokens: current.maxTokens,
        signal
      })
      signal.throwIfAborted()
      console.error(`${TAG} 视觉桥接完成 ${vision.provider}/${vision.model} 图=${attachment.width}x${attachment.height} 耗时${Date.now() - started}ms${result.truncated === true ? '（截断）' : ''}`)

      // 把这次视觉调用的 token 用量上报给 dsh-usage（宿主事件 `dsh-usage/report`）。
      // 为什么必要：视觉桥接是**直接 `ctx.llm.stream()`**、不经 agent loop，会话里
      // 不会出现 assistant/message 结算事件，usage 插件常规读会话日志读不到这一笔；
      // 这里在拿到 usage 后主动上报，由 usage 插件的 recordExternal() 归到视觉模型名下。
      // 上报是尽力而为：没有 usage（失败/被取消）、或者宿主没装 dsh-usage，都无害。
      if (result.usage !== null && typeof result.usage === 'object'
        && (Number.isFinite(result.usage.inputTokens) || Number.isFinite(result.usage.outputTokens))) {
        try {
          ctx.emit('dsh-usage/report', {
            provider: vision.provider,
            model: vision.model,
            usage: {
              inputTokens: Number.isFinite(result.usage.inputTokens) ? result.usage.inputTokens : 0,
              outputTokens: Number.isFinite(result.usage.outputTokens) ? result.usage.outputTokens : 0,
              cacheReadTokens: Number.isFinite(result.usage.cacheReadTokens) ? result.usage.cacheReadTokens : 0,
              cacheWriteTokens: Number.isFinite(result.usage.cacheWriteTokens) ? result.usage.cacheWriteTokens : 0
            }
          })
        } catch (error) {
          // 上报失败不影响读图结果
          console.error(`${TAG} 上报视觉用量失败：${String(error?.message ?? error)}`)
        }
      }

      return {
        provider: vision.provider,
        model: vision.model,
        auto: vision.auto,
        image: {
          width: attachment.width,
          height: attachment.height,
          mediaType: attachment.mediaType,
          attachmentId: attachment.attachmentId,
          ...(attachment.name !== undefined ? { name: attachment.name } : {})
        },
        answer: result.answer,
        ...(result.truncated === true ? { truncated: true } : {}),
        ...(Number.isFinite(result.usage?.inputTokens) ? { inputTokens: result.usage.inputTokens } : {}),
        ...(Number.isFinite(result.usage?.outputTokens) ? { outputTokens: result.usage.outputTokens } : {}),
        elapsedMs: Date.now() - started
      }
    }
  }))

  // ================================================================ 设置面板 API
  // settings + connection 是 web 桌面组合的服务，缺了就不挂 API（CLI 组合里
  // 插件其余功能照常工作）。
  ctx.inject(['settings', 'connection'], (scoped) => {
    const settings = scoped.settings
    const conn = scoped.connection

    const catalogRow = async () => {
      const current = liveConfig()
      let resolved
      try {
        resolved = await resolveVisionModel(undefined)
      } catch (error) {
        resolved = { error: String(error?.message ?? error) }
      }
      const rows = await discoverModels(undefined)
      const descriptor = settings.describe().find((entry) => entry.ns === ENTRY_NS)
      return jsonResponse({
        ok: true,
        configured: current.provider.length > 0 && current.model.length > 0
          ? { provider: current.provider, model: current.model }
          : null,
        resolved,
        visibility: current.visibility,
        maxTokens: current.maxTokens,
        timeoutMs: current.timeoutMs,
        revision: descriptor?.revision ?? 0,
        candidates: rows.filter((row) => row.image === true)
      })
    }

    conn.fetch.register({
      path: API_CATALOG,
      methods: ['GET'],
      // requestBody 必须显式 'buffered'：bridge 按「命中路由则取 route.requestBody，
      // 缺省走流式分支」分派，流式分支会给 GET 挂上 stream body，undici 的
      // Request 构造器对 GET+body 抛 TypeError → handler 崩溃、一个字节都
      // 没写出去，前端拿到空响应体（Unexpected end of JSON input）。
      // dsh-multimodal 把 GET/POST 合同一条路由并声明 requestBody:'buffered'
      // 才是安全写法。
      requestBody: 'buffered',
      fetch: (request) => withTimeout(catalogRow(), 45_000, API_CATALOG)
        .catch((error) => jsonResponse({ ok: false, error: String(error?.message ?? error) }, 500))
    })

    conn.fetch.register({
      path: API_CONFIG,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = await request.json().catch(() => null)
          if (body === null || typeof body !== 'object') {
            return jsonResponse({ ok: false, error: '请求体必须是 JSON 对象' }, 400)
          }
          const patch = {}
          if (typeof body.provider === 'string') patch.provider = body.provider
          if (typeof body.model === 'string') patch.model = body.model
          if (body.visibility === 'auto' || body.visibility === 'always' || body.visibility === 'never') patch.visibility = body.visibility
          if (Number.isFinite(body.maxTokens)) patch.maxTokens = Math.max(256, Math.min(65536, Math.floor(body.maxTokens)))
          if (Number.isFinite(body.timeoutMs)) patch.timeoutMs = Math.max(10000, Math.min(600000, Math.floor(body.timeoutMs)))
          if (Object.keys(patch).length === 0) return jsonResponse({ ok: false, error: '没有可写入的字段' }, 400)

          // 与 dsh-multimodal 相同的防冲突写法：写前现读 revision；冲突让客户端刷新重试
          const descriptor = settings.describe().find((entry) => entry.ns === ENTRY_NS)
          if (descriptor === undefined) {
            return jsonResponse({ ok: false, error: `settings 里找不到命名空间 ${ENTRY_NS}（插件未启用？）` }, 404)
          }
          try {
            await settings.update(ENTRY_NS, patch, descriptor.revision)
          } catch (error) {
            if (error?.name === 'SettingsConflictError') {
              return jsonResponse({ ok: false, error: '配置在别处被修改过（revision 冲突），请刷新页面后重试' }, 409)
            }
            throw error
          }
          discoveryCache = { at: 0, rows: undefined }
          capabilityCache.clear()
          const fresh = await catalogRow()
          return fresh
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error?.message ?? error) }, 500)
        }
      }
    })

    console.error(`${TAG} 设置接口：GET ${API_CATALOG} / POST ${API_CONFIG}；界面入口：设置 → 图像解读`)
  })

  console.error(`${TAG} 就绪：工具 ${TOOL_NAME} 在「当前模型按声明不支持图片输入」的会话里自动可见`)
}

export default { name, inject, apply, Config }
