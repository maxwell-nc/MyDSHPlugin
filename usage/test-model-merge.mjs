/**
 * dsh-usage「合并徽章」开关的自测。
 *
 * 这一版把共享 dsh-model-name 的**真身**装进 require 桩里（不是复制一份规则），
 * 所以顺带验了两边的对接：usage 的统计键 = 共享库的规范化 + 徽章切分。
 *
 * 锁住的规则（用户点名的合并）：
 *   cf/DeepSeek-V4-Flash-0731-TokenPlan + cf/DeepSeek-V4-Flash-0817-DL
 *     → 开关开：并成一行 DeepSeek-V4-Flash；开关关：各自一行。
 *   原始 model id（账本里的键）一个都不动。
 *
 * 跑法：node test-model-merge.mjs（或在本目录 pnpm test:model-merge）
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname

/** 浏览器模块格式的加载器：接住 __ModuleLoader__.load 的注册项（保留 window 上已有的桩）。 */
function loadModule(source) {
	let entry = null
	globalThis.window = { ...(globalThis.window ?? {}), __ModuleLoader__: { load(registration) { entry = registration } } }
	// eslint-disable-next-line no-new-func -- 客户端半边是按浏览器模块格式写的一整个文件
	new Function(source)()
	assert.ok(entry !== null, '没有按 __ModuleLoader__ 契约注册')
	return entry
}

// 共享库真身：与 usage / thinking_strength 在浏览器里 require 到的是同一份。
const modelName = loadModule(readFileSync(join(here, '..', 'dsh-model-name', 'lib', 'client.js'), 'utf8'))
	.factory(() => { throw new Error('dsh-model-name 不应 require 其它模块') })

/** 最小 React 替身：hooks 只求「不炸 + 拿到初始值」，够把面板渲染成结构树看开关。 */
function fakeReact() {
	return {
		Fragment: Symbol('Fragment'),
		createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
		useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
		useRef: () => ({ current: null }),
		useMemo: (fn) => fn(),
		useCallback: (fn) => fn,
		useEffect: (fn) => { fn() },
		useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot()
	}
}

/** 记录 localStorage 写入，供开关落盘断言。 */
const storageWrites = []
globalThis.window = {
	__ModuleLoader__: { load() {} },
	localStorage: {
		getItem: () => null,
		setItem: (key, value) => { storageWrites.push([key, value]) }
	}
}

// usage 的网页半边。
const entry = loadModule(readFileSync(join(here, 'lib', 'client.js'), 'utf8'))
globalThis.document = {
	body: {},
	head: { appendChild() {} },
	createElement: () => ({ dataset: {}, textContent: '' }),
	querySelector: () => null
}
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ today: '2026-11-06' }) })
const usage = entry.factory((id) => {
	if (id === 'react') return fakeReact()
	if (id === 'react-dom') return { createPortal: (node) => node }
	if (id === 'dsh-model-name') return modelName
	throw new Error('未预料的 require：' + id)
})
const { buildView, badgeBase } = usage.__usage

/** 一笔账：`tokens` 以外的字段补 0，形状与宿主落账一致。 */
const bucket = (tokens) => ({ tokens, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 1 });

const recorded = new Map([
	['2026-11-06', {
		date: '2026-11-06',
		total: 0,
		models: {
			'cf/DeepSeek-V4-Flash-0731-TokenPlan': bucket(100),
			'cf/DeepSeek-V4-Flash-0817-DL': bucket(50),
			'ctai_my/glm-5.3': bucket(30),
			'opencodezen/glm-5.3-flash-free': bucket(20)
		}
	}]
]);
const keys = ['2026-11-06'];

// ── 开关开（默认）：徽章合并，同一模型的不同发行变体并成一行 ──
{
	const view = buildView(keys, recorded, true, true);
	assert.deepEqual(
		view.models.map((model) => model.label + '=' + model.tokens),
		['DeepSeek-V4-Flash=150', 'GLM-5.3=30', 'GLM-5.3-Flash=20'],
		'合并徽章后：0731-TokenPlan 与 0817-DL 都记到 DeepSeek-V4-Flash'
	);
	assert.deepEqual(Object.keys(view.days[0].models).sort(), ['DeepSeek-V4-Flash', 'GLM-5.3', 'GLM-5.3-Flash']);
	assert.equal(view.total, 200);
}

// ── 开关关：退回只做「规范模型名」的老行为，发行变体各自成行 ──
{
	const view = buildView(keys, recorded, true, false);
	assert.deepEqual(
		view.models.map((model) => model.label),
		['DeepSeek-V4-Flash-0731-TokenPlan', 'DeepSeek-V4-Flash-0817-DL', 'GLM-5.3', 'GLM-5.3-Flash-Free']
	);
}

// ── 不剥前缀时，合并只作用于原始 id 的末尾标记 ──
{
	const view = buildView(keys, recorded, false, true);
	assert.deepEqual(
		view.models.map((model) => model.label).sort(),
		['cf/DeepSeek-V4-Flash', 'ctai_my/glm-5.3', 'opencodezen/glm-5.3-flash']
	);
	const viewOff = buildView(keys, recorded, false, false);
	assert.deepEqual(viewOff.models.map((model) => model.label).sort(), [
		'cf/DeepSeek-V4-Flash-0731-TokenPlan',
		'cf/DeepSeek-V4-Flash-0817-DL',
		'ctai_my/glm-5.3',
		'opencodezen/glm-5.3-flash-free'
	]);
}

// ── 纯函数：徽章切分（共享库的规则） ──
assert.equal(badgeBase('DeepSeek-V4-Flash-0731-TokenPlan'), 'DeepSeek-V4-Flash');
assert.equal(badgeBase('DeepSeek-V4-Flash-0817-DL'), 'DeepSeek-V4-Flash');
assert.equal(badgeBase('GLM-5.3-Flash-Free'), 'GLM-5.3-Flash');
assert.equal(badgeBase('GLM-5.3'), 'GLM-5.3');

// ── 账本一个字节都不动：原始 model id 仍是记账键 ──
assert.deepEqual(
	Object.keys(recorded.get('2026-11-06').models).sort(),
	['cf/DeepSeek-V4-Flash-0731-TokenPlan', 'cf/DeepSeek-V4-Flash-0817-DL', 'ctai_my/glm-5.3', 'opencodezen/glm-5.3-flash-free']
);

// ── 面板上的开关：「合并徽章」默认开，另一个是「规范模型名」 ──
/** 深度遍历假 createElement 树。 */
function walk(node, out = []) {
	if (Array.isArray(node)) { node.forEach((child) => walk(child, out)); return out }
	if (node === null || node === undefined || typeof node !== 'object') return out
	if (node.props !== undefined) out.push(node);
	walk(node.children, out);
	return out;
}

/** 跑一遍 apply，拿到挂到 main 槽的面板组件（与浏览器里注册的一致）。 */
const registrations = [];
usage.apply({
	slots: {
		inject(name, run) { run() },
		register(options, component) { registrations.push({ options, component }); return () => {} }
	}
});
const page = registrations.find((registration) => registration.options.name === 'main');
assert.ok(page !== undefined, '面板没有注册到 main 槽');

const tree = page.component();
const switches = walk(tree).filter((node) => node.type === 'input' && node.props?.type === 'checkbox');
assert.equal(switches.length, 2, '操作行应有两个开关（规范模型名 + 合并徽章）');
assert.equal(switches[0].props.checked, false, '「规范模型名」默认关');
assert.equal(switches[1].props.checked, true, '「合并徽章」默认开');
// 开关上的文字要短，长说明放 hover 提示（title）里。
const switchLabels = walk(tree)
	.filter((node) => String(node.props?.className ?? '') === 'dshu-switchLabel')
	.map((node) => node.children?.[0]);
assert.deepEqual(switchLabels, ['规范模型名', '合并徽章'], '可见文字只留开关名');
const switchRows = walk(tree).filter((node) => node.props?.className === 'dshu-switch');
assert.ok(
	switchRows.length >= 2 && String(switchRows[1].props.title).includes('DeepSeek-V4-Flash-0817-DL'),
	'长说明（含合并例子）应在 title 提示里'
);
switches[1].props.onChange({ target: { checked: false } });
assert.deepEqual(storageWrites.at(-1), ['dsh-usage:mergeBadge', '0'], '关掉合并徽章要落盘');
switches[0].props.onChange({ target: { checked: true } });
assert.deepEqual(storageWrites.at(-1), ['dsh-usage:hidePrefix', '1'], '规范模型名开关照旧落盘');

console.log('PASS: dsh-usage 合并徽章自测通过');
