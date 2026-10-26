/**
 * dsh-open 的两条 connection 路由的离线验证：用假 ctx 把真实注册抓下来直接调
 * handler，绕开 /api 的鉴权栅栏（浏览器 cookie 只存在于页面里）。
 *
 *   node test/routes.mjs info
 *   node test/routes.mjs act "<绝对路径>" [open|reveal]
 *   node test/routes.mjs bad "<相对路径>"
 *
 * `act` 会真的执行打开动作（Opus 会真的弹出来），这是端到端验证，不是 dry-run。
 */
import { apply } from '../dsh-open.mjs'

/** 假 ctx：只实现本插件用到的那点 surface。 */
function routesOf() {
  const routes = new Map()
  apply({
    inject: (deps, callback) => {
      callback({ connection: { fetch: { register: (route) => routes.set(route.path, route) } } })
    }
  })
  return routes
}

const [, , command, ...rest] = process.argv
const routes = routesOf()

if (command === 'info') {
  const route = routes.get('/api/dsh-open.info')
  if (route === undefined) throw new Error('info 路由没注册')
  console.log(JSON.stringify(await (await route.fetch(new Request('http://local/api/dsh-open.info'))).json(), null, 2))
} else if (command === 'act' || command === 'bad') {
  const route = routes.get('/api/dsh-open.act')
  if (route === undefined) throw new Error('act 路由没注册')
  const [path, mode = 'open'] = rest
  const response = await route.fetch(new Request('http://local/api/dsh-open.act', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, mode })
  }))
  console.log(response.status, JSON.stringify(await response.json(), null, 2))
} else {
  console.error('用法：node test/routes.mjs info | act <path> [open|reveal] | bad <path>')
  process.exit(2)
}
