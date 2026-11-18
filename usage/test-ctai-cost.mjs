/**
 * dsh-usage「ctai 计费模块」的自测。
 *
 * 验三件事：
 *   1. 只认 `ctai` 前缀开头的模型（ctai_my / 后续 ctai_xxx），pf/cf/opencodezen 一率不进；
 *   2. 按价目表从「天 × 模型」桶（input/cacheRead/output/cacheWrite）算出金额；
 *   3. 展示口径：deepseek 系 in/out 标准价 + 缓存优惠价 0.02，glm 单一价。
 * 一组有代表性的大数正好可以人工核对，不像真实账本的 token 量级那样难一眼验。
 *
 * 跑法：node test-ctai-cost.mjs（或本目录 pnpm test:ctai-cost）
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname

/** 浏览器模块格式的加载器（与 test-model-merge.mjs 同款）。 */
function loadModule(source) {
	let entry = null
	globalThis.window = { ...(globalThis.window ?? {}), __ModuleLoader__: { load(registration) { entry = registration } } }
	// eslint-disable-next-line no-new-func -- 客户端半边是按浏览器模块格式写的一整个文件
	new Function(source)()
	assert.ok(entry !== null, '没有按 __ModuleLoader__ 契约注册')
	return entry
}

// 共享库真身 + 最小 React 替身（与 test-model-merge.mjs 同款，避免重复维护）。
const modelName = loadModule(readFileSync(join(here, '..', 'dsh-model-name', 'lib', 'client.js'), 'utf8'))
	.factory(() => { throw new Error('dsh-model-name 不应 require 其它模块') })
const fakeReact = () => ({
	Fragment: Symbol('Fragment'),
	createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
	useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
	useRef: () => ({ current: null }),
	useMemo: (fn) => fn(),
	useCallback: (fn) => fn,
	useEffect: (fn) => { fn() },
	useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot()
})
globalThis.window = { __ModuleLoader__: { load() {} }, localStorage: { getItem: () => null, setItem: () => {} } }
const entry = loadModule(readFileSync(join(here, 'lib', 'client.js'), 'utf8'))
globalThis.document = {
	body: {},
	head: { appendChild() {} },
	createElement: () => ({ dataset: {}, textContent: '' }),
	querySelector: () => null
}
const usage = entry.factory((id) => {
	if (id === 'react') return fakeReact()
	if (id === 'react-dom') return { createPortal: (node) => node }
	if (id === 'dsh-model-name') return modelName
	throw new Error('未预料的 require：' + id)
})
const { splitCtai, ctaiCost, formatYuan, CTAI_PRICE } = usage.__usage

// ── 1. splitCtai：只认 ctai 前缀 ──
assert.deepEqual(splitCtai('ctai_my/deepseek-v4.1-flash-1017'), { prefix: 'ctai_my', model: 'deepseek-v4.1-flash-1017' }, 'ctai_my 正常拆分');
assert.deepEqual(splitCtai('ctai_xxx/glm-5.3-flash'), { prefix: 'ctai_xxx', model: 'glm-5.3-flash' }, '后续的 ctai_xxx 也能进');
assert.equal(splitCtai('cf/DeepSeek-V4-Flash'), null, 'cf 前缀不进');
assert.equal(splitCtai('opencodezen/glm-5.3'), null, 'opencodezen 不进');
assert.equal(splitCtai('glm-5.3-flash'), null, '无前缀不认');

// ── 2. ctaiCost：按价目表算金额（元） ──
// deepseek-v4.1-flash：input 2 元/M、output 8、缓存 0.02。
// 4M 输入 = 8.00；6M 缓存 = 0.12；2M 输出 = 16.00 → 合计 24.12。
const bucket = { input: 4_000_000, output: 2_000_000, cacheRead: 6_000_000, cacheWrite: 1_000_000 };
const costDs = ctaiCost('deepseek-v4.1-flash', CTAI_PRICE['deepseek-v4.1-flash'], bucket);
assert.equal(Math.round(costDs * 100) / 100, 24.12, 'deepseek：in 8 + cache 0.12 + out 16 = 24.12，cacheWrite 计 0');

// glm-5.3-flash 单一价：1M 输出 = 2.80；缓存 1M = 0.23 → 3.03。
const bucketGlm = { input: 0, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 0 };
const costGlm = ctaiCost('glm-5.3-flash', CTAI_PRICE['glm-5.3-flash'], bucketGlm);
assert.equal(Math.round(costGlm * 100) / 100, 3.03, 'glm：0 输入 + 2.8 输出 + 0.23 缓存 = 3.03');

// ── 3. formatYuan ──
assert.equal(formatYuan(24.129), '¥24.13');
assert.equal(formatYuan(251.6189), '¥251.62');
assert.equal(formatYuan(0), '¥0.00');

// ── 价目表应含终端在用的三个模型，数字与终稿一致 ──
assert.deepEqual(CTAI_PRICE['deepseek-v4.1-flash'], [2, 8, 0.02, 0]);
assert.deepEqual(CTAI_PRICE['deepseek-v4.1-flash-1017'], [2, 8, 0.02, 0]);
assert.deepEqual(CTAI_PRICE['glm-5.3-flash'], [0.8, 2.8, 0.23, 0]);

console.log('PASS: dsh-usage ctai 计费自测通过');