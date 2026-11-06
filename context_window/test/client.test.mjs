/**
 * 冒烟测试：不依赖浏览器/React 真身，用最小替身把网页半边跑一遍，
 * 确认模块能加载、插槽注册正确、组件能渲染、状态请求地址正确。
 *
 *   node test/client.test.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(import.meta.dirname, '..', 'lib', 'client.js'), 'utf8')

let failures = 0
function ok(label, condition, extra) {
  if (condition) { console.log(`  ok   ${label}`); return }
  failures++
  console.log(`  FAIL ${label}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`)
}

/* -------------------------------------------------------------------------- */
console.log('用例 1：模块加载与插槽注册')
let captured
globalThis.window = { __ModuleLoader__: { load(entry) { captured = entry } } }
globalThis.document = {
  body: {},
  head: { appendChild() {} },
  createElement: () => ({ dataset: {}, textContent: '' }),
  querySelector: () => null,
}
const fetched = []
globalThis.fetch = (url) => {
  fetched.push(String(url))
  return Promise.resolve({ json: () => Promise.resolve({ ok: false, error: '离线' }) })
}

// eslint-disable-next-line no-eval -- 客户端半边是按浏览器模块格式写的一整个文件
new Function(SOURCE)()
ok('调用 __ModuleLoader__.load', captured !== undefined && captured.id === 'dsh-context-window', captured?.id)

const hooks = []
const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (init) => { const value = typeof init === 'function' ? init() : init; return [value, () => {}] },
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
  useEffect: (fn) => { fn() },
}
const reactDom = { createPortal: (node) => node }
const module = captured.factory((name) => {
  if (name === 'react') return react
  if (name === 'react-dom') return reactDom
  throw new Error(`unexpected require(${name})`)
})
ok('导出 apply / inject', typeof module.apply === 'function' && Array.isArray(module.inject), Object.keys(module))

const injections = []
const registrations = []
const ctx = {
  slots: {
    inject(name, callback) { injections.push(name); callback() },
    register(options, component) { registrations.push({ options, component }); return () => {} },
  },
}
module.apply(ctx)
ok('往 conversation.input.right 注入', injections.includes('conversation.input.right'), injections)
ok('注册到 conversation.input.right（order 21，id context-window）',
  registrations.length === 1
  && registrations[0].options.name === 'conversation.input.right'
  && registrations[0].options.id === 'context-window'
  && registrations[0].options.order === 21, registrations.map(r => r.options))

/* -------------------------------------------------------------------------- */
console.log('用例 2：组件渲染（有选中模型 / 没有选中模型）')
const Control = registrations[0].component
const withModel = Control({ useProjection: () => ({ lastUsed: { provider: 'merge', model: 'ctai_my/deepseek-v4.1-flash' } }) })
ok('返回一个包裹节点', withModel !== null && withModel !== undefined && withModel.type === 'span', withModel?.type)
// createElement(..., [child, child, child]) → children 是「装着子节点数组」的单元素数组
const kids = Array.isArray(withModel.children?.[0]) ? withModel.children[0] : (withModel.children ?? [])
const button = kids.find(child => child?.props?.className?.startsWith('dcw-btn'))
ok('渲染出档位按钮', button !== undefined, kids.map(c => c?.props?.className))
ok('按钮不带蓝色高亮类（非默认也用原色）', !String(button.props.className).includes('dcw-on'), button.props.className)
ok('按钮上先是占位文案「上下文」', (button.children?.[0] ?? []).includes('上下文'), button.children)
ok(
  'state 请求带上了当前模型的 provider / model',
  fetched.some(url => url === '/api/dsh-context-window.state?provider=merge&model=ctai_my%2Fdeepseek-v4.1-flash'),
  fetched,
)

fetched.length = 0
const withoutModel = Control({ useProjection: () => null })
ok('没有选中模型且宿主回填失败时不渲染按钮（返回 null）', withoutModel === null, withoutModel)
ok('仍然按「新会话」问了宿主一次（不带参数）', fetched.includes('/api/dsh-context-window.state'), fetched)

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
