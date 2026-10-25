/**
 * UI 冒烟测试：极简 React 桩执行 dsh-session-manager 的客户端组件，
 * 覆盖 loading / error / ready（含列表行、批量条、确认弹层）渲染分支。
 * 只验证「组件树构建时没有 ReferenceError/TypeError」，不做视觉断言。
 */
import { readFileSync } from 'node:fs'
import assert from 'node:assert'

/* ------------------ 极简 React ------------------ */
let hooks = []
let cursor = 0
let needsRender = false
function resetHooks() {
  hooks = []
  cursor = 0
}
function depsEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
}
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length <= 1 ? children[0] : children }, key: props?.key ?? null }),
  Fragment: Symbol('fragment'),
  useState(initial) {
    const slot = cursor++
    if (!(slot in hooks)) hooks[slot] = [typeof initial === 'function' ? initial() : initial]
    const setState = (value) => {
      hooks[slot][0] = typeof value === 'function' ? value(hooks[slot][0]) : value
      needsRender = true
    }
    return [hooks[slot][0], setState]
  },
  useMemo(factory, deps) {
    const slot = cursor++
    if (!(slot in hooks) || !depsEqual(hooks[slot][1], deps)) hooks[slot] = [factory(), deps]
    return hooks[slot][0]
  },
  useCallback(fn, deps) {
    const slot = cursor++
    if (!(slot in hooks) || !depsEqual(hooks[slot][1], deps)) hooks[slot] = [fn, deps]
    return hooks[slot][0]
  },
  useRef(initial) {
    const slot = cursor++
    if (!(slot in hooks)) hooks[slot] = { current: initial }
    return hooks[slot]
  },
  useEffect(fn, deps) {
    const slot = cursor++
    if (!(slot in hooks)) hooks[slot] = { fn, deps, ran: false }
    else if (!hooks[slot].ran || !depsEqual(hooks[slot].deps, deps)) hooks[slot] = { fn, deps, ran: false }
    return hooks[slot]
  }
}
const fakeReactDOM = { createPortal: (node) => ({ portal: node }) }
const globalThisRef = globalThis

/* ------------------ window / document 桩 ------------------ */
const appendedStyles = []
globalThisRef.window = globalThisRef
globalThisRef.document = {
  head: { appendChild: (el) => appendedStyles.push(el) },
  createElement: (tag) => ({ tagName: tag, dataset: {}, textContent: '' }),
  querySelector: () => null,
  body: {}
}
globalThisRef.setTimeout = setTimeout
globalThisRef.clearTimeout = clearTimeout

let loadedModule = null
globalThisRef.__ModuleLoader__ = {
  load(bundle) {
    loadedModule = bundle.factory((name) => (name === 'react' ? fakeReact : fakeReactDOM))
  }
}

/* ------------------ 载入插件 bundle ------------------ */
const code = readFileSync('D:/Project/dsplugin/session_manager/lib/client.js', 'utf8')
new Function(code)() // 顶部就是 window.__ModuleLoader__.load(...)
assert.ok(loadedModule, 'bundle 未被 __ModuleLoader__ 载入')
assert.deepEqual(loadedModule.inject, ['slots'])
assert.equal(typeof loadedModule.apply, 'function')

/* ------------------ slots 桩 ------------------ */
let registered = null
const slotsCtx = {
  slots: {
    inject(name, cb) {
      assert.equal(name, 'settings.section')
      cb()
    },
    register(options, component) {
      registered = { options, component }
      return () => {}
    }
  }
}
loadedModule.apply(slotsCtx)
assert.ok(registered, 'settings.section 未注册')
assert.equal(registered.options.id, 'session-manager')
assert.equal(registered.options.label, '会话管理')
assert.equal(typeof registered.component, 'function')

/* ------------------ 渲染分支 ------------------ */

async function runComponent({ fetchImpl }) {
  globalThisRef.fetch = fetchImpl
  resetHooks()
  let frame
  for (let round = 0; round < 12; round++) {
    cursor = 0
    needsRender = false
    frame = registered.component()
    // 手动跑一遍到期副作用（dep 变化重跑语义在桩里已实现）
    for (let i = 0; i < hooks.length; i++) {
      const hook = hooks[i]
      if (hook && typeof hook === 'object' && 'fn' in hook && !hook.ran) {
        hook.ran = true
        await hook.fn()
      }
    }
    await new Promise((r) => setTimeout(r, 5))
    if (!needsRender) break
  }
  return frame
}

const nodeToText = (node) => {
  if (node === null || node === undefined || node === false) return ''
  if (Array.isArray(node)) return node.map(nodeToText).join('|')
  if (typeof node === 'object' && node.props) return `<${typeof node.type === 'string' ? node.type : 'C'}>${nodeToText(node.props.children)}</>`
  return String(node)
}

/* 1. fetch 失败 → error 分支 */
let frame = await runComponent({
  fetchImpl: async () => { throw new Error('boom-503') }
})
const errorText = nodeToText(frame)
assert.ok(errorText.includes('读取失败'), 'error 分支应可见: ' + errorText.slice(0, 200))
console.log('PASS error 分支 →', errorText.slice(0, 120))

/* 2. 正常 overview → ready 分支（含 2 个工作区、5 个会话行、purge 计数） */
resetHooks()
const now = Date.now()
const sample = {
  storageRoot: 'C:/Users/ali/.dsh/storages',
  sessionRoot: 'C:/Users/ali/.dsh/sessions',
  updatedAt: now,
  workspaces: [
    { id: 'ws1', title: 'dsplugin', path: 'D:\\Project\\dsplugin', dir: 'D:/session-dir-1', dirStatus: 'ok', sessionIds: [], sessionCount: 3, sizeBytes: 3000, status: 'ok' },
    { id: 'ws2', title: '空区', path: 'D:\\Project\\empty', dir: null, dirStatus: 'missing-dir', sessionIds: [], sessionCount: 0, sizeBytes: 0, status: 'missing-dir' }
  ],
  sessions: [
    { id: 'session-live-0000', cwd: 'D:\\Project\\dsplugin', createdAt: now - 9e8, updatedAt: now - 1e5, sizeBytes: 1200, dir: 'x', eventCount: 5, archived: false, pinned: true, live: true, subagent: false, parent: null, workspaceId: 'ws1' },
    { id: 'session-aa11', cwd: 'D:\\Project\\dsplugin', createdAt: now - 95e8, updatedAt: now - 40 * 864e5, sizeBytes: 900, dir: 'x', eventCount: 3, archived: true, pinned: false, live: false, subagent: false, parent: null, workspaceId: 'ws1' },
    { id: 'session-bb22', cwd: 'D:\\Project\\dsplugin', createdAt: now - 3e8, updatedAt: now - 20 * 864e5, sizeBytes: 800, dir: 'x', eventCount: 2, archived: false, pinned: false, live: false, subagent: false, parent: null, workspaceId: 'ws1' },
    { id: 'legacy-cc33', cwd: null, createdAt: now - 2e8, updatedAt: now - 10 * 864e5, sizeBytes: 300, dir: 'x', eventCount: 1, archived: false, pinned: false, live: false, subagent: false, parent: null, workspaceId: null },
    { id: 'fork-dd44', cwd: 'D:\\Project\\dsplugin', createdAt: now - 3e10, updatedAt: now - 1e5, sizeBytes: 500, dir: 'x', eventCount: 2, archived: false, pinned: false, live: false, subagent: false, parent: 'session-aa11', workspaceId: 'ws1' },
    { id: 'sub-ee55', cwd: 'D:\\Project\\dsplugin', createdAt: now - 3e10, updatedAt: now - 1e5, sizeBytes: 400, dir: 'x', eventCount: 1, archived: false, pinned: false, live: false, subagent: true, parent: 'session-live-0000', workspaceId: 'ws1' }
  ],
  archivedCount: 1, pinnedCount: 1, liveCount: 1, sessionCount: 6, totalBytes: 3200
}
globalThisRef.fetch = async (path, opts) => {
  if (String(path).includes('overview')) return { ok: true, json: async () => JSON.parse(JSON.stringify(sample)) }
  if (String(path).includes('titles')) {
    const body = JSON.parse(opts.body)
    return { ok: true, json: async () => ({ titles: body.ids.map((id) => ({ id, title: '「' + id + '」的标题' })) }) }
  }
  throw new Error('unexpected fetch ' + path)
}
frame = await runComponent({ fetchImpl: globalThisRef.fetch })
const readyText = nodeToText(frame)
assert.ok(readyText.includes('正在清点') === false, '加载完成后不应停留在 loading')
;['dsplugin', '空区', 'aa11…', '「session-aa11」的标题', '使用中', '已归档', '置顶', '分支', '子代理', '未分组', '一键清理', '30 天前（1）', '15 天前（2）', '7 天前（3）', '打开存储根目录', '全选（使用中的除外）'].forEach((needle) => {
  assert.ok(readyText.includes(needle), 'ready 分支缺少: ' + needle + '\n…' + readyText.slice(0, 500))
})
console.log('PASS ready 分支：工作区/行/标签/快捷清理计数 渲染完整')
console.log('PASS 客户端 bundle 冒烟测试全部通过')
