/**
 * multimodal.mjs —— dsh-multimodal 宿主入口（host 半边）。
 *
 * 干一件事：给 `llm-pi-ai` 命名空间下、手写路由（自定义 provider）里的模型，
 * 逐个开关「是否支持图片输入」（input 模态）。
 *
 * 为什么需要：`dsh-llm-pi-ai` 无法反向探测网关的多模态能力，模型若不声明 `input`，
 * 默认只报 text（`DEFAULT_INPUT = ["text"]`），前端就拒绝图片。这个插件让用户自己
 * 判断每个模型是否多模态，勾选后写 `input: [text, image]`，取消则写 `input: ["text"]`。
 *
 * 读写都走 settings 服务（`ctx.settings`），不是直接改 settings.yaml：
 *   - 读：`settings.describe()` 拿 `llm-pi-ai` 的 raw user 段（含 revision）；
 *   - 写：`settings.mutate(ns, [{ op: 'set', path: ['providers', <route>, 'models'], value }], revision)`。
 * 注意：settings 的路径补丁把数组当不透明值，不能按下标改元素，只能整段 models 替换，
 * 所以这里读→改目标模型→整段写回（其它字段原样保留）。
 */

export const name = 'multimodal'

const TAG = '[dsh-multimodal]'
const NS = 'llm-pi-ai'
const API_PATH = '/api/model.multimodal'

/** 从一个 provider 的 raw user 段里抽出「浏览器只需要」的模型列表。 */
function describeRoutes(desc) {
  const revision = typeof desc?.revision === 'number' ? desc.revision : 0
  const user = desc?.user
  const providers = user && typeof user === 'object' && user.providers && typeof user.providers === 'object' ? user.providers : {}
  const routes = []
  for (const route of Object.keys(providers)) {
    const p = providers[route]
    if (!p || typeof p !== 'object') continue
    const models = Array.isArray(p.models) ? p.models : []
    routes.push({
      route,
      displayName: typeof p.displayName === 'string' && p.displayName.length > 0 ? p.displayName : route,
      models: models.map((m) => {
        const obj = m && typeof m === 'object' ? m : {}
        const id = String(obj.id ?? '')
        const name = typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : id
        const image = Array.isArray(obj.input) && obj.input.includes('image')
        return { id, name, image }
      })
    })
  }
  return { revision, routes }
}

export function apply(ctx) {
  // settings + connection 都是 web profile 的核心服务，这里按需绑定，缺了就不挂 API
  ctx.inject(['settings', 'connection'], (scoped) => {
    const settings = scoped.settings
    const conn = scoped.connection
    // 可选的「默认模型」服务（agent-default-model）：用于新会话投影为空时回退到默认模型
    const agentDefault = ctx.get('agentDefaultModel')
    const defaultModel = () => {
      try {
        const s = agentDefault && typeof agentDefault.currentSelection === 'function' ? agentDefault.currentSelection() : null
        if (s && typeof s.provider === 'string' && typeof s.model === 'string') return { provider: s.provider, model: s.model }
      } catch { /* ignore */ }
      return null
    }
    try {
      const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })

      // 读：列出每个 provider 下的模型及其当前多模态状态 + 默认模型
      const read = () => {
        try {
          const desc = settings.describe().find((d) => d.ns === NS)
          return json({ ok: true, ...describeRoutes(desc), default: defaultModel() })
        } catch (error) {
          return json({ ok: false, error: String(error?.message ?? error) }, 500)
        }
      }

      // 写：toggle 某个模型的 input 模态
      const write = async (request) => {
        try {
          const body = await request.json()
          const route = typeof body?.route === 'string' ? body.route : ''
          const modelId = typeof body?.modelId === 'string' ? body.modelId : ''
          const image = body?.image === true
          if (!route || !modelId) return json({ ok: false, error: '缺少 route / modelId' }, 400)

          // 每次写都重新读，拿最新的 revision + raw user 段，避免并发冲突
          const desc = settings.describe().find((d) => d.ns === NS)
          if (!desc) return json({ ok: false, error: `找不到命名空间 ${NS}` }, 404)
          const providers = desc.user && typeof desc.user === 'object' && desc.user.providers && typeof desc.user.providers === 'object' ? desc.user.providers : {}
          const provider = providers[route]
          if (!provider || typeof provider !== 'object' || !Array.isArray(provider.models)) {
            return json({ ok: false, error: `找不到 provider "${route}" 的 models` }, 404)
          }
          const hit = provider.models.some((m) => m && typeof m === 'object' && String(m.id) === modelId)
          if (!hit) return json({ ok: false, error: `找不到模型 "${modelId}"` }, 404)

          // 整段 models 写回：只改目标模型的 input，其余字段原样
          const models = provider.models.map((m) => {
            if (m && typeof m === 'object' && String(m.id) === modelId) {
              return { ...m, input: image ? ['text', 'image'] : ['text'] }
            }
            return m
          })
          await settings.mutate(NS, [{ op: 'set', path: ['providers', route, 'models'], value: models }], desc.revision)

          const fresh = settings.describe().find((d) => d.ns === NS)
          return json({ ok: true, ...describeRoutes(fresh), default: defaultModel() })
        } catch (error) {
          return json({ ok: false, error: String(error?.message ?? error) }, 500)
        }
      }

      // connection 的 fetch 路由按 path 精确去重，同一 path 只能注册一次；
      // GET/POST 走同一个 handler，按 request.method 分支。
      conn.fetch.register({
        path: API_PATH,
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => {
          if (request.method === 'GET') return read()
          if (request.method === 'POST') return write(request)
          return Promise.resolve(json({ ok: false, error: '不支持的方法' }, 405))
        }
      })

      console.error(`${TAG} API = ${API_PATH}；入口在左下角设置上方`)
    } catch (error) {
      console.error(`${TAG} 注册 API 失败：${String(error?.message ?? error)}`)
    }
  })
}

export const inject = []

export default { name, apply }
