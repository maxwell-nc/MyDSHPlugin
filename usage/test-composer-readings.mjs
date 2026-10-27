// composer 读数（dsh-usage/client/composer-readings.js）的自测。
//
// 这一版是「按 id 顶掉核心 pill、自己画 React 组件」：格式化与读数文本都在纯函数里
// （`activityReadings` / `usageReadings` / `contextReadings`），组件只负责摆 DOM。
// 所以读数规则能在 node 里全验；真正的渲染、面板定位只能刷新界面看。
//
// 跑法：node usage/test-composer-readings.mjs（或在本目录 node test-composer-readings.mjs）

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'lib/client.js'), 'utf8')

/** 捕获 __ModuleLoader__.load 注册的条目。 */
let entry = null
const fakeWindow = {
	__ModuleLoader__: {
		load(registration) {
			entry = registration
		}
	}
}

/** createElement 桩：只记结构，不渲染（组件里的 useState 之类因此永远不会被调到）。 */
function createElement(type, props, ...children) {
	return { type, props: { ...(props ?? {}), children: children.length > 1 ? children : children[0] } }
}

/** require 桩：任何没写的属性都返回一个空函数，免得加载期调用炸掉。 */
function stubModule(overrides) {
	return new Proxy(overrides, {
		get(target, key) {
			if (key in target) return target[key]
			if (key === 'then') return undefined
			return () => undefined
		}
	})
}

function fakeRequire(id) {
	if (id === 'react') return stubModule({ createElement })
	if (id === 'react-dom') return stubModule({ createPortal: () => null })
	if (id === 'dsh-model-name') return stubModule({})
	throw new Error('未预料的 require：' + id)
}

// 工厂里除注入的依赖外只碰 window（挂 CSS 那截有 typeof document 守卫），所以这样就能跑。
new Function('window', source)(fakeWindow)
assert.ok(entry !== null, 'client.js 没有按 __ModuleLoader__ 契约注册')
assert.equal(entry.id, 'dsh-usage')

const usage = entry.factory(fakeRequire)
const {
	trimTrailingZero,
	formatWanReading,
	formatCompactTokens,
	formatExactTokens,
	exactCount,
	formatTokensPerSecond,
	formatDuration,
	billedInputTokens,
	cacheHitPercent,
	contextOccupancy,
	activityReadings,
	usageReadings,
	contextReadings
} = usage.__readings

// ── 万 / 亿：万不带小数；够 1 亿改亿、2 位小数且省末尾 0；不到 1 万给原始 token ──
assert.equal(trimTrailingZero('570.00'), '570')
assert.equal(trimTrailingZero('1.20'), '1.2')
assert.equal(trimTrailingZero('1.23'), '1.23')
assert.equal(formatWanReading(5_700_000), '570 万')
assert.equal(formatWanReading(573_000), '57 万')
assert.equal(formatWanReading(1_250_000), '125 万')
assert.equal(formatWanReading(10_000), '1 万')
assert.equal(formatWanReading(99_990_000), '9999 万')
assert.equal(formatWanReading(99_999_999), '1 亿')
assert.equal(formatWanReading(120_000_000), '1.2 亿')
assert.equal(formatWanReading(100_000_000), '1 亿')
assert.equal(formatWanReading(123_456_789), '1.23 亿')
// 不够 1 万：原始 token（跟账本 formatAmount 同一套 measure() 规则）
assert.equal(formatWanReading(9_400), '9400')
assert.equal(formatWanReading(300), '300')
assert.equal(formatWanReading(0), '0')

// ── 紧凑 / 精确 token 数（核心面板同款） ──
assert.equal(formatCompactTokens(517), '517')
assert.equal(formatCompactTokens(1_500), '1.5K')
assert.equal(formatCompactTokens(12_200), '12.2K')
assert.equal(formatCompactTokens(144_000), '144K')
assert.equal(formatCompactTokens(262_144), '262K')
assert.equal(formatCompactTokens(1_000_000), '1M')
assert.equal(formatCompactTokens(1_500_000), '1.5M')
assert.equal(formatExactTokens(5_701_000), '5,701,000')
assert.equal(formatExactTokens(300), '300')
// 核心面板的计数读数带单位：`{n} tok`
assert.equal(exactCount(5_701_000), '5,701,000 tok')
assert.equal(exactCount(0), '0 tok')

// ── 速度 / 耗时（耗时用核心中文文案 `duration.compact*`：45.2秒 / 2分42秒） ──
assert.equal(formatTokensPerSecond(142.4), '142')
assert.equal(formatTokensPerSecond(39.6), '40')
assert.equal(formatTokensPerSecond(4.55), '4.6')
assert.equal(formatTokensPerSecond(0), '0')
assert.equal(formatDuration(45_200), '45.2秒')
assert.equal(formatDuration(59_000), '59秒')
assert.equal(formatDuration(162_000), '2分42秒')
assert.equal(formatDuration(3_600_000), '60分0秒')

// ── 缓存命中：整数；部分命中宁可低报 99.9 也不谎报 100 ──
const tokenUsage = (uncached, cacheRead, cacheWrite = 0, output = 0) => ({
	uncachedInputTokens: uncached,
	cacheReadTokens: cacheRead,
	cacheWriteTokens: cacheWrite,
	outputTokens: output
})
assert.equal(billedInputTokens(tokenUsage(12_000, 88_000)), 100_000)
assert.equal(cacheHitPercent(tokenUsage(12_000, 88_000)), '88')
assert.equal(cacheHitPercent(tokenUsage(0, 0)), null)
assert.equal(cacheHitPercent(tokenUsage(0, 1_000)), '100')
assert.equal(cacheHitPercent(tokenUsage(1, 99_999)), '99.9')

// ── 上下文占用：projectedTokens 优先、缺一不可、封顶 100 ──
assert.deepEqual(contextOccupancy({ projectedTokens: 144_000, contextWindow: 262_144 }), {
	percent: 55,
	usedTokens: 144_000,
	contextWindow: 262_144
})
assert.equal(contextOccupancy({ pressureTokens: 100, projectedTokens: 200, contextWindow: 1_000 }).usedTokens, 200)
assert.equal(contextOccupancy({ pressureTokens: 100, contextWindow: 1_000 }).percent, 10)
assert.equal(contextOccupancy({ pressureTokens: 100 }), null)
assert.equal(contextOccupancy(undefined), null)
assert.equal(contextOccupancy({ projectedTokens: 400_000, contextWindow: 262_144 }).percent, 100)

// ── 三格读数的文本与面板行 ──
const stats = {
	turns: 1,
	steps: 65,
	llmMs: 210_000,
	toolMs: 32_000,
	ttftMs: 4_400,
	ttftSteps: 10,
	decodeMs: 60_000,
	decodeTokens: 8_520
}
const activity = activityReadings(stats)
assert.equal(activity.counts, '1 轮 65 步')
assert.equal(activity.speed, '速度 142 t/s')
// 面板行 = 核心「会话统计」那张表（`stats.dialog.*` 文案 + 中文耗时）
assert.deepEqual(activity.rows, [
	['模型用时', '3分30秒'],
	['工具调用用时', '32秒'],
	['首 token 平均（TTFT）', '0.4秒'],
	['输出速度（TPS）', '142 t/s']
])
// 没有解码工时就退回纯计数（核心同款：`1 轮 65 步`）
assert.equal(activityReadings({ ...stats, decodeMs: 0 }).speed, null)
// 一行耗时都没有时不带面板（`rows` 为空，组件那边渲染成纯读数）
assert.equal(activityReadings({ turns: 1, steps: 2, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 }).rows.length, 0)

const usageReading = usageReadings(tokenUsage(12_000, 88_000, 0, 5_610_000))
assert.equal(usageReading.total, 5_710_000)
assert.equal(usageReading.totalText, '消耗 571 万')
assert.equal(usageReading.totalExact, '5,710,000 tok')
assert.equal(usageReading.hitText, '缓存命中 88%')
// 面板行 = 核心「Token 用量」那张表（`message.turnUsage.*` 文案 + `{n} tok`）
assert.deepEqual(usageReading.rows, [
	['缓存命中', '88%'],
	['未缓存输入', '12,000 tok'],
	['缓存读取', '88,000 tok'],
	['输出', '5,610,000 tok']
])
// 有缓存写就多一行
assert.deepEqual(usageReadings(tokenUsage(1_000, 1_000, 2_000, 0)).rows, [
	['缓存命中', '25%'],
	['未缓存输入', '1,000 tok'],
	['缓存读取', '1,000 tok'],
	['缓存写入', '2,000 tok'],
	['输出', '0 tok']
])
// 只有输出（全是新 token）：没有提示侧输入就没有命中率那一行
const outputOnly = usageReadings(tokenUsage(0, 0, 0, 4_200))
assert.equal(outputOnly.hitText, null)
assert.equal(outputOnly.totalText, '消耗 4200')
assert.deepEqual(outputOnly.rows.slice(0, 1), [['未缓存输入', '0 tok']])

const contextReading = contextReadings(
	{ projectedTokens: 144_000, contextWindow: 262_144 },
	{ systemTokens: 12_000, toolsTokens: 38_600, messageTokens: 93_400 }
)
assert.equal(contextReading.text, '上下文 55%（144K/262K）')
assert.equal(contextReading.percent, 55)
assert.equal(contextReading.figures, '~144K / 262K')
// 图例三行照核心 ContextMeter：色块 + 文案 + `~计数`
assert.deepEqual(contextReading.rows, [
	{ label: '系统提示词', tone: 'dshu-sreadMeterSystem', value: '~12K' },
	{ label: '工具定义', tone: 'dshu-sreadMeterTools', value: '~38.6K' },
	{ label: '对话消息', tone: 'dshu-sreadMeterMessages', value: '~93.4K' }
])
// 构成条的段宽 = 占用百分比 × 各构成占比（核心同式）
assert.deepEqual(
	contextReading.segments.map((segment) => [segment.key, Math.round(segment.width * 100) / 100]),
	[
		['system', Math.round(55 * 12_000 / 144_000 * 100) / 100],
		['tools', Math.round(55 * 38_600 / 144_000 * 100) / 100],
		['messages', Math.round(55 * 93_400 / 144_000 * 100) / 100]
	]
)
// 没有构成投影（或构成为 0）时退化成一条整段，图例为空
const wholeBar = contextReadings({ projectedTokens: 144_000, contextWindow: 262_144 }, undefined)
assert.deepEqual(wholeBar.rows, [])
assert.deepEqual(
	wholeBar.segments.map((segment) => [segment.key, segment.tone, segment.width]),
	[['total', undefined, 55]]
)
assert.deepEqual(
	contextReadings({ projectedTokens: 144_000, contextWindow: 262_144 }, { systemTokens: 0, toolsTokens: 0, messageTokens: 0 }).segments.map((segment) => segment.key),
	['total']
)
// 宽度为 0 的段被丢掉（核心同款：不留一条假色块）
assert.deepEqual(
	contextReadings({ projectedTokens: 100, contextWindow: 1_000 }, { systemTokens: 0, toolsTokens: 50, messageTokens: 50 }).segments.map((segment) => segment.key),
	['tools', 'messages']
)
// 分子/容量缺失时整格不画
assert.equal(contextReadings({ pressureTokens: 100 }, undefined), null)
assert.equal(contextReadings(undefined, undefined), null)

// ── 接线：三格进同一个槽位；前两格用同 id + priority -1 顶掉核心，第三格是自己的 id ──
const injected = []
const registered = []
const fakeCtx = {
	slots: {
		inject(name, register) {
			injected.push(name)
			register()
		},
		register(options, component) {
			registered.push({ options, component })
		}
	}
}
usage.apply(fakeCtx)
assert.deepEqual(injected, [
	'main',
	'sidebar.panellist',
	'conversation.composer.dock',
	'conversation.composer.dock',
	'conversation.composer.dock'
])
assert.deepEqual(
	registered
		.filter((row) => row.options.name === 'conversation.composer.dock')
		.map((row) => [row.options.id, row.options.order, row.options.priority]),
	[
		['activity', 0, -1],
		['usage', 1, -1],
		['context', 2, undefined]
	]
)
for (const row of registered.filter((entry) => entry.options.id !== undefined && entry.options.id !== 'usage')) {
	assert.equal(typeof row.component, 'function')
}
for (const row of registered.filter((entry) => entry.options.name === 'conversation.composer.dock')) {
	assert.equal(typeof row.component, 'function')
}

// 老版本没这个槽位时，前面两个入口（侧栏行 + 主面板）不能跟着崩
const survived = []
const warning = console.warn
console.warn = () => {}
try {
	usage.apply({
		slots: {
			inject(name, register) {
				register()
			},
			register(options) {
				if (options.name === 'conversation.composer.dock') throw new Error('slot is not declared')
				survived.push(options.name)
			}
		}
	})
} finally {
	console.warn = warning
}
assert.deepEqual(survived, ['main', 'sidebar.panellist'])

// ── 结构约定：这一版不许再碰核心 DOM、不挂 observer（上一版就是那样把界面拖死的） ──
const region = source.slice(
	source.indexOf('dsh-usage/client/composer-readings.js'),
	source.indexOf('/** 本插件需要的客户端服务')
)
assert.ok(region.length > 1_000, '没切到 composer 读数区，检查 region 标记')
// 注释里会提到这些词（说明「为什么不用」），所以只看剥掉注释后的代码。
const regionCode = region.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
for (const forbidden of [
	'new Mutation' + 'Observer',
	'querySelector',
	'createTreeWalker',
	'nodeValue',
	'textContent',
	'appendChild',
	'removeChild',
	'innerHTML',
	'setAttribute',
	'insertBefore'
]) {
	assert.equal(regionCode.includes(forbidden), false, `composer 读数区里不该出现 ${forbidden}`)
}
// 只允许：面板定位/关闭用的 document/window 监听与读取，和 portal 用的 document.body
assert.deepEqual(
	[...regionCode.matchAll(/document\.[A-Za-z]+/g)].map((match) => match[0]),
	[
		'document.documentElement',
		'document.addEventListener',
		'document.addEventListener',
		'document.addEventListener',
		'document.removeEventListener',
		'document.removeEventListener',
		'document.removeEventListener',
		'document.body'
	]
)
// 跟随面板尺寸用的是核心同款 ResizeObserver（只量尺寸，不改 DOM）
assert.equal(regionCode.includes('ResizeObserver'), true, '应当按核心的做法用 ResizeObserver 跟随面板尺寸')

// ── 皮肤对照：面板样式必须跟核心那两个 CSS Module 逐条一致 ──
// 这条是给「面板跟原来看起来不一样」准备的：样式是照抄的，抄漏一条就红。
// 核心源码不在本机时跳过（不失败），只提示。
const CORE_FILES = {
	statDialog: 'packages/client/ui-chat/src/client/chat/stat-dialog.module.css',
	statsPills: 'packages/client/ui-chat/src/client/chat/StatsPills.module.css',
	meter: 'packages/client/ui-conversation/src/client/skeleton/ContextMeter.module.css'
}
const CORE_ROOTS = [
	'D:/Project/Github/deepseek-harness',
	'/d/Project/Github/deepseek-harness'
]
/** 核心类 → 我们的类（面板皮肤一一对应）。 */
const SKIN_PAIRS = [
	['statDialog', '.panel', '.dshu-sreadPanel'],
	['statDialog', '.title', '.dshu-sreadTitle'],
	['statDialog', '.titleLabel', '.dshu-sreadTitleLabel'],
	['statDialog', '.titleValue', '.dshu-sreadTitleValue'],
	['statDialog', '.titleRule', '.dshu-sreadTitleRule'],
	['statDialog', '.details', '.dshu-sreadDetails'],
	['meter', '.panel', '.dshu-sreadMeter'],
	['meter', '.header', '.dshu-sreadMeterHead'],
	['meter', '.headline', '.dshu-sreadMeterHeadline'],
	['meter', '.percent', '.dshu-sreadMeterPercent'],
	['meter', '.figures', '.dshu-sreadMeterFigures'],
	['meter', '.bar', '.dshu-sreadMeterBar'],
	['meter', '.segment', '.dshu-sreadMeterSegment'],
	['meter', '.swatch', '.dshu-sreadMeterSwatch'],
	['meter', '.rows', '.dshu-sreadMeterRows'],
	['meter', '.row', '.dshu-sreadMeterRow'],
	['statsPills', '.anchor', '.dshu-sreadAnchor'],
	['statsPills', '.pill', '.dshu-sreadPill'],
	['statsPills', '.sep', '.dshu-sreadSep'],
	// 复合选择器 / 状态（也一起锁住：抄漏一条就如「hover 没变底色」这种细节）
	['statDialog', '.titleLabel svg', '.dshu-sreadTitleLabel svg'],
	['statDialog', '.details dt, .details dd', '.dshu-sreadDetails dt, .dshu-sreadDetails dd'],
	['statDialog', '.details dd', '.dshu-sreadDetails dd'],
	['statsPills', '.pill svg', '.dshu-sreadPill svg'],
	['statsPills', 'button.pill', 'button.dshu-sreadPill'],
	['statsPills', "button.pill:hover, button.pill[aria-expanded='true']", "button.dshu-sreadPill:hover, button.dshu-sreadPill[aria-expanded='true']"],
	['meter', '.row dt', '.dshu-sreadMeterRow dt'],
	['meter', '.row dd', '.dshu-sreadMeterRow dd']
]
// 我们注入的 CSS 是拼起来的一串字符串字面量：把带 `{` 的都捞出来（含 `button.` 前缀那条）。
const ownCss = [...source.matchAll(/"([^"]*\{[^"]*)"/g)].map((match) => match[1]).join('')
const coreDir = CORE_ROOTS.find((root) => existsSync(join(root, CORE_FILES.statDialog)))
if (coreDir === undefined) {
	console.log('test-composer-readings: 皮肤对照跳过（找不到核心源码目录）')
} else {
	const coreCss = Object.fromEntries(
		Object.entries(CORE_FILES).map(([key, rel]) => [key, readFileSync(join(coreDir, rel), 'utf8')])
	)
	for (const [file, coreSelector, ownSelector] of SKIN_PAIRS) {
		const core = normalizedDeclarations(coreCss[file], coreSelector)
		const own = normalizedDeclarations(ownCss, ownSelector)
		assert.notEqual(core, null, `核心样式里没找到 ${coreSelector}（${file}）`)
		assert.notEqual(own, null, `我们样式里没找到 ${ownSelector}`)
		assert.deepEqual(own, core, `${ownSelector} 与核心 ${coreSelector} 的声明不一致`)
	}
}

console.log('test-composer-readings: 全部通过（三格读数 + 格式化规则 + 接线 + 皮肤对照）')

/**
 * 取一条单类规则的声明（`prop:value` 数组，已排序）。
 * 归一化只做两件无损的事：省掉 `var()` 里的兜底值（我们注入的 CSS 会写兜底，核心不写），
 * 以及把我们的 `--dshu-meter-tint` 还原成核心的 `--meter-tint`（同名前缀会在全局串味，
 * 所以换名是故意的）。
 */
function normalizedDeclarations(css, selector) {
	// 一个选择器可能出现在多条规则里（核心把 `.details dt, .details dd` 的公共声明
	// 单独放一条，`.details dd` 自己的声明又放另一条），所以按属性合并后再比。
	const wanted = selector.trim().split(',').map(normalizeSelector)
	const merged = new Map()
	for (const [selectorList, body] of allRules(css)) {
		const parts = selectorList.split(',').map(normalizeSelector)
		if (!wanted.some((want) => parts.includes(want))) continue
		for (const declaration of body.split(';')) {
			const text = declaration.trim()
			if (text.length === 0) continue
			merged.set(text.split(':')[0].trim(), text)
		}
	}
	if (merged.size === 0) return null
	return [...merged.values()].map(normalizeDeclaration).sort()
}

/** 把 CSS 拆成 `[选择器组, 规则体]`（这两个文件里没有 `@media`/`@keyframes`）。 */
function allRules(css) {
	const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
	const rules = []
	const pattern = /([^{}]+)\{([^{}]*)\}/g
	let match
	while ((match = pattern.exec(code)) !== null) {
		const selectorList = match[1].trim()
		if (!selectorList.startsWith('@')) rules.push([selectorList, match[2]])
	}
	return rules
}

/** 选择器归一化：压掉空白，顺带兼容核心的选择器组换行。 */
function normalizeSelector(selector) {
	return selector.trim().replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ')
}

/** 声明的可比值：省掉 `var()` 兜底（我们注入的 CSS 会写兜底、核心不写）、还原改名过的主题变量、去掉空白。 */
function normalizeDeclaration(declaration) {
	return stripVarFallbacks(declaration)
		.replace(/--dshu-meter-tint/g, '--meter-tint')
		.replace(/\s*:\s*/, ':')
		.replace(/\s+/g, '')
}

/** 去掉 `var()` 的兜底值：`var(--a,rgba(1,2,3))` → `var(--a)`（我们注入的 CSS 会写兜底，核心不写）。 */
function stripVarFallbacks(value) {
	let out = ''
	let index = 0
	while (index < value.length) {
		const at = value.indexOf('var(', index)
		if (at < 0) {
			out += value.slice(index)
			break
		}
		out += value.slice(index, at)
		let depth = 0
		let end = at + 3
		for (; end < value.length; end += 1) {
			if (value[end] === '(') depth += 1
			else if (value[end] === ')') {
				depth -= 1
				if (depth === 0) break
			}
		}
		out += 'var(' + value.slice(at + 4, end).split(',')[0].trim() + ')'
		index = end + 1
	}
	return out
}
