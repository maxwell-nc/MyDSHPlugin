/**
 * 冒烟测试：不依赖浏览器 / React 真身，把 thinking_strength 的网页半边跑一遍。
 *
 * 重点锁住一条回归：**没有 dsh-model-name 时，整个网页半边不能跟着一起没掉**
 * （它不在客户端的静态种子表里，require 未命中会 throw，一旦抛在 factory 里，
 * 模型座 / 勾选框 / 滑块 / 记忆会全部消失，用户只看到「什么都没发生」）。
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

/** 最小 React 替身：hooks 只求「不炸 + 拿到初始值」，不支持重渲染。 */
function fakeReact() {
  return {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useRef: () => ({ current: null }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: (fn) => { fn() },
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  }
}

const fetched = []

/** 装一遍网页半边：返回 factory 产出的模块 + 它打过的 warn。 */
function install({ modelNameThrows, store, select } = {}) {
  const warnings = []
  let captured
  globalThis.window = { __ModuleLoader__: { load(entry) { captured = entry } } }
  globalThis.document = {
    body: {},
    head: { appendChild() {} },
    createElement: () => ({ dataset: {}, textContent: '' }),
    querySelector: () => null,
  }
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
  globalThis.fetch = (url) => {
    fetched.push(String(url))
    return Promise.resolve({ json: () => Promise.resolve({ ok: false, error: '离线' }) })
  }
  // eslint-disable-next-line no-eval -- 客户端半边是按浏览器模块格式写的一整个文件
  new Function(SOURCE)()

  const realWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }
  let module
  try {
    const usedLib = { used: false }
    module = captured.factory((name) => {
      if (name === 'react') return fakeReact()
      if (name === 'react-dom') return { createPortal: (node) => node }
      if (name === 'dsh-model-name') {
        if (modelNameThrows) throw new Error('client-modules: require("dsh-model-name") missed the module table')
        usedLib.used = true
        return {
          cap: (s) => s,
          normalize: (s) => `STUB(${s})`,
          splitPrefix: (t) => ({ prefix: null, base: t }),
          displayName: (id) => `STUB(${id})`,
        }
      }
      throw new Error(`unexpected require(${name})`)
    })
    module.usedLib = usedLib
  } finally {
    console.warn = realWarn
  }
  const directories = {
    directoryFor: () => (store === undefined ? undefined : { store, load: () => Promise.resolve(), select: select ?? (() => Promise.resolve({ ok: true })) }),
  }
  return { module, warnings, directories }
}

/** 跑 apply，拿到两个席位的注册项（模型座的 props 由 options.inject(sessionId) 提供）。 */
function registeredSlots(module, directories) {
  const registrations = []
  const injections = []
  module.apply({
    inject(services, callback) {
      injections.push(services)
      callback({
        slots: {
          inject(name, run) { injections.push(name); run() },
          register(options, component) { registrations.push({ options, component }); return () => {} },
        },
        modelDirectories: directories,
        sessions: { subagentAddress: () => undefined },
        remote: { session: {} },
      })
    },
  })
  return registrations
}

const seatProps = (registration, sessionId = 's1') => registration.options.inject(sessionId)
const seatOf = (regs) => regs.find((r) => r.options.name === 'conversation.input.model')
const checkboxOf = (regs) => regs.find((r) => r.options.name === 'conversation.input.right')

/* -------------------------------------------------------------------------- */
console.log('用例 1：没有 dsh-model-name 时网页半边仍要活着（D1 回归）')
{
  const { module, warnings } = install({ modelNameThrows: true })
  ok('factory 没有抛（模块成功加载）', module !== undefined && typeof module.apply === 'function')
  ok('打了兜底日志，说明名字为什么不一样', warnings.some((line) => line.includes('dsh-model-name')), warnings)
  ok('没有走外部模型名库', module.usedLib.used === false)

  const regs = registeredSlots(module, {
    directoryFor: () => ({
      store: {
        subscribe: () => () => {},
        getSnapshot: () => ({
          current: { provider: 'merge', model: 'ctai_my/glm-5.3', reasoningEffort: 'high' },
          groups: [{ id: 'merge', models: [{ id: 'ctai_my/glm-5.3', name: 'glm-5.3', reasoning: {} }] }],
          pending: null,
        }),
      },
      load: () => Promise.resolve(),
      select: () => Promise.resolve({ ok: true }),
    }),
  })
  ok('两个席位都注册了（模型座 + 思考勾选框）',
    seatOf(regs) !== undefined && checkboxOf(regs) !== undefined, regs.map((r) => r.options.name))
  const tree = seatOf(regs).component(seatProps(seatOf(regs)))
  ok('模型座用兜底实现渲染出名字', JSON.stringify(tree).includes('Glm-5.3'), JSON.stringify(tree).slice(0, 200))
  const checkTree = checkboxOf(regs).component({
    useProjection: () => ({ lastUsed: { provider: 'merge', model: 'ctai_my/glm-5.3' } }),
  })
  ok('勾选框也还能渲染', checkTree !== null && JSON.stringify(checkTree).includes('思考'), JSON.stringify(checkTree).slice(0, 120))
}

/* -------------------------------------------------------------------------- */
console.log('用例 2：装了 dsh-model-name 就用它（名字走共享库）')
{
  const { module } = install({ modelNameThrows: false })
  ok('用了外部模型名库', module.usedLib.used === true)
  const regs = registeredSlots(module, {
    directoryFor: () => ({
      store: {
        subscribe: () => () => {},
        getSnapshot: () => ({
          current: { provider: 'merge', model: 'ctai_my/glm-5.3' },
          groups: [{ id: 'merge', models: [{ id: 'ctai_my/glm-5.3', name: 'glm-5.3' }] }],
          pending: null,
        }),
      },
      load: () => Promise.resolve(),
      select: () => Promise.resolve({ ok: true }),
    }),
  })
  const tree = JSON.stringify(seatOf(regs).component(seatProps(seatOf(regs))))
  ok('标签来自共享库', tree.includes('STUB(ctai_my/glm-5.3)'), tree.slice(0, 200))
}

/* -------------------------------------------------------------------------- */
console.log('用例 3：目录 store 的失败会显示成控件旁的「!」（D2）')
{
  const { module } = install({ modelNameThrows: false })
  const regs = registeredSlots(module, {
    directoryFor: () => ({
      store: {
        subscribe: () => () => {},
        getSnapshot: () => ({
          current: { provider: 'merge', model: 'A' },
          groups: [{ id: 'merge', models: [{ id: 'A', name: 'A' }] }],
          pending: null,
          error: 'session/writer-held: 该会话正被另一个窗口写入',
        }),
      },
      load: () => Promise.resolve(),
      select: () => Promise.resolve({ ok: true }),
    }),
  })
  const tree = seatOf(regs).component(seatProps(seatOf(regs)))
  // createElement(..., [child, child, child]) → children 是「装着子节点数组」的单元素数组
  const kids = Array.isArray(tree.children?.[0]) ? tree.children[0] : (tree.children ?? [])
  const error = kids.find((child) => child?.props?.className === 'dts-err')
  ok('渲染出「!」并带上原因', error !== undefined && String(error.props.title).includes('writer-held'), error?.props?.title)
}

/* -------------------------------------------------------------------------- */
console.log('用例 4：勾选框会去读宿主状态（有模型时）')
{
  fetched.length = 0
  const { module } = install({ modelNameThrows: false })
  const regs = registeredSlots(module, {})
  const tree = checkboxOf(regs).component({
    useProjection: () => ({ lastUsed: { provider: 'merge', model: 'ctai_my/deepseek-v4.1-flash' } }),
  })
  ok('渲染出勾选框', tree !== null && JSON.stringify(tree).includes('思考'), JSON.stringify(tree).slice(0, 160))
  ok('按当前模型问了宿主 state',
    fetched.some((url) => url === '/api/dsh-thinking-strength.state?provider=merge&model=ctai_my%2Fdeepseek-v4.1-flash'),
    fetched)
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
