/**
 * dsh-usage —— 时序桶（平均输出速度 / 平均首字延迟）自测。
 *
 * 不装 profile、不花 token：用临时账本驱动 usage.mjs 的 apply()，喂合成会话事件，
 * 走完「首字记录 → 结算 → 重结算覆盖 → 下一步」整条链路，再从读取接口取 payload
 * 断言时序桶；最后加载浏览器半边验聚合与读数口径。
 *
 * 锁住的规则（都是容易改错的）：
 *   1. 首字延迟 = step/start → 首个非空 delta（与上游 session-stats 投影同式）；
 *   2. 解码窗口 = 首个非空 delta → assistant/message（只在有 outputTokens 时算）；
 *   3. 同一步重复结算 / 流式收敛（token 变多）：**覆盖**而不是累加，工时也跟着覆盖；
 *   4. 打包成 `text-chunks` 运行段的流（time0 + dt）能还原出正确的首字时刻；
 *   5. 外来上报（解析图片）只进 token 桶，不污染平均值的分母；
 *   6. buildView 合并模型/切区间时，每个模型各自带自己的时序桶（读数按模型算，
 *      不是全区间一个总平均）；
 *   7. 图例「其他」行把折叠模型的时序相加（sumTiming），加权口径不变。
 *
 * 跑法：node usage/test-timing.mjs（账本在系统临时目录，跑完清理）
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const here = import.meta.dirname
const tmp = mkdtempSync(join(tmpdir(), 'dsh-usage-timing-'))
const ledger = join(tmp, 'usage.json')
process.env.DSH_USAGE_DATA = ledger
process.env.DSH_USAGE_QUIET = '1'

const { apply } = await import('./usage.mjs')

/* -------------------------------------------------------------------------- */
/* 假 ctx / 假会话                                                             */
/* -------------------------------------------------------------------------- */

/** 假 ctx：收监听器 + 接 connection 的 fetch 路由（读 payload 用）。 */
function fakeCtx() {
  const listeners = new Map()
  const effects = []
  let route = null
  return {
    listeners,
    effects,
    getRoute: () => route,
    get: () => undefined,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(handler)
      return () => {
        const list = listeners.get(event)
        const index = list.indexOf(handler)
        if (index >= 0) list.splice(index, 1)
      }
    },
    inject(deps, fn) {
      // usage 只要 connection 时就挂 HTTP 读取接口；这里给一条能取 payload 的。
      if (Array.isArray(deps) && deps.includes('connection')) {
        fn({
          connection: {
            fetch: {
              register(registration) {
                route = registration
              }
            }
          }
        })
      }
      return () => {}
    },
    effect(fn) {
      effects.push(fn)
    }
  }
}

function emit(ctx, event, payload) {
  for (const handler of ctx.listeners.get(event) ?? []) handler(payload)
}

/** 一个可增长的假会话：事件数组当会话日志，seq 跟着数组长度走。 */
function makeSession(events, id) {
  return {
    header: { id },
    get seq() {
      return events.length
    },
    eventAt: (index) => events[index]
  }
}

const T0 = 1_700_000_000_000
const events = []
const push = (event) => events.push(event)
/** 一次 assistant 结算的 stream：一个原始 chunk 记录（delta 带时刻）。 */
const deltaChunk = (time, text) => [{ type: 'chunk', time, chunk: { type: 'text-delta', index: 0, text } }]

const ctx = fakeCtx()
apply(ctx)
const route = ctx.getRoute()
assert.ok(route !== null, '有 connection 时应注册读取接口')

/* -------------------------------------------------------------------------- */
/* 1) 第一步：首字在 attempt 记下，message 结算                                */
/* -------------------------------------------------------------------------- */

push({ type: 'request/header', time: T0 - 20, data: { header: { config: { model: 'deepseek-chat' } } } })
push({ type: 'step/start', time: T0, data: { turn: 0, step: 0 } })

const session = makeSession(events, 'timed-1')
// 第一次见到该会话：只回放、只补模型和起点，**不计账**（这是「不回填历史」的约定）
emit(ctx, 'session/event', session)

push({
  type: 'assistant/attempt',
  time: T0 + 250,
  data: { turn: 0, step: 0, stream: deltaChunk(T0 + 200, '你') }
})
push({
  type: 'assistant/message',
  time: T0 + 500,
  data: {
    turn: 0,
    step: 0,
    // 输出 40 token；首字在 T0+200 → 首字延迟 200ms、解码窗口 300ms
    usage: { inputTokens: 100, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stream: deltaChunk(T0 + 200, '你')
  }
})
emit(ctx, 'session/event', session)

/** 取一次 payload（同一条鉴权路由，和浏览器读的是同一份）。 */
async function payload() {
  const response = await route.fetch({})
  assert.ok(response.ok !== false, '读取接口应能返回')
  return response.json()
}

const first = await payload()
const day = first.days.find((row) => row.date === first.today)
assert.ok(day, '今天应有记录')
const chat = day.models['deepseek-chat']
assert.ok(chat, 'deepseek-chat 应被记账')
assert.equal(chat.tokens, 140, '100 输入 + 40 输出')
assert.equal(chat.output, 40)
assert.equal(chat.calls, 1)
assert.equal(chat.ttftMs, 200, '首字延迟 = step/start(T0) → 首个 delta(T0+200)')
assert.equal(chat.ttftSteps, 1)
assert.equal(chat.decodeMs, 300, '解码窗口 = 首字(T0+200) → 结算(T0+500)')
assert.equal(chat.decodeTokens, 40, '解码窗口内只算这次上报的输出 token')

/* -------------------------------------------------------------------------- */
/* 2) 同一步重结算（一模一样的样本）→ 不动账                                  */
/* -------------------------------------------------------------------------- */

push({
  type: 'assistant/message',
  time: T0 + 500,
  data: {
    turn: 0,
    step: 0,
    usage: { inputTokens: 100, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stream: deltaChunk(T0 + 200, '你')
  }
})
emit(ctx, 'session/event', session)

const duplicate = (await payload()).days.find((row) => row.date === first.today).models['deepseek-chat']
assert.equal(duplicate.tokens, 140, '重复结算不应翻倍')
assert.equal(duplicate.calls, 1, '重复结算不算两次调用')
assert.equal(duplicate.ttftMs, 200, '重复结算不应把工时加两遍')
assert.equal(duplicate.ttftSteps, 1)
assert.equal(duplicate.decodeMs, 300)
assert.equal(duplicate.decodeTokens, 40)

/* -------------------------------------------------------------------------- */
/* 3) 流式收敛：同一步的 usage 变大 → 覆盖 token 同时也覆盖工时               */
/* -------------------------------------------------------------------------- */

push({
  type: 'assistant/message',
  time: T0 + 700,
  data: {
    turn: 0,
    step: 0,
    // 输出从 40 收敛到 60，结算时刻也推到 T0+700
    usage: { inputTokens: 100, outputTokens: 60, cacheReadTokens: 0, cacheWriteTokens: 0 },
    stream: deltaChunk(T0 + 200, '你')
  }
})
emit(ctx, 'session/event', session)

const converged = (await payload()).days.find((row) => row.date === first.today).models['deepseek-chat']
assert.equal(converged.tokens, 160, '覆盖后是 100 + 60，不是 140 + 160')
assert.equal(converged.output, 60)
assert.equal(converged.calls, 1, '同一步还是同一次调用')
assert.equal(converged.ttftMs, 200, '首字时刻不因重结算而变')
assert.equal(converged.ttftSteps, 1)
assert.equal(converged.decodeMs, 500, '解码窗口跟着结算时刻重新算（T0+200 → T0+700）')
assert.equal(converged.decodeTokens, 60)

/* -------------------------------------------------------------------------- */
/* 4) 下一步：首字来自**打包的运行段**（time0 + dt）                            */
/* -------------------------------------------------------------------------- */

push({ type: 'step/end', time: T0 + 700, data: { turn: 0, step: 0 } })
emit(ctx, 'session/event', session)

const T1 = T0 + 10_000
push({ type: 'step/start', time: T1, data: { turn: 1, step: 0 } })
push({
  type: 'assistant/message',
  time: T1 + 400,
  data: {
    turn: 1,
    step: 0,
    usage: { inputTokens: 20, outputTokens: 10 },
    // 压缩后的 text-chunks：time0 = T1+100，dt[0]=0（第 0 个成员空）、dt[1]=30
    // 第一个非空成员是 index 1 → 时刻 = time0 + dt[0] = T1+100
    stream: [{ type: 'text-chunks', time0: T1 + 100, index: 0, dt: [0, 30], texts: ['', '你'] }]
  }
})
emit(ctx, 'session/event', session)

const second = (await payload()).days.find((row) => row.date === first.today).models['deepseek-chat']
assert.equal(second.ttftMs, 300, '两步的累计：200 + 100（上一步的 200 也没丢）')
assert.equal(second.ttftSteps, 2)
assert.equal(second.decodeMs, 800, '300 + 300')
assert.equal(second.decodeTokens, 70, '40 + 10 → 覆盖后 60 + 10')
assert.equal(second.tokens, 190, '160 + 30')

/* -------------------------------------------------------------------------- */
/* 5) 外来上报（解析图片）没有工时：只进 token 桶                             */
/* -------------------------------------------------------------------------- */

emit(ctx, 'dsh-usage/report', {
  provider: 'x',
  model: 'glm-vision',
  usage: { inputTokens: 10, outputTokens: 5 }
})

const afterReport = await payload()
const vision = afterReport.days.find((row) => row.date === first.today).models['glm-vision']
assert.ok(vision, '外来上报应记账')
assert.equal(vision.tokens, 15)
assert.equal(vision.ttftSteps, 0, '外来上报不应进首字延迟的分母')
assert.equal(vision.decodeMs, 0, '外来上报不应进速度的分母')
const chatAfterReport = afterReport.days.find((row) => row.date === first.today).models['deepseek-chat']
assert.equal(chatAfterReport.ttftSteps, 2, '外来上报不能改变会话结算的工时统计')
assert.equal(chatAfterReport.decodeMs, 800)

/* -------------------------------------------------------------------------- */
/* 6) 落盘：账本里真的带时序桶（重启/别的进程读得到）                          */
/* -------------------------------------------------------------------------- */

// 跑一遍 apply 注册的 effect：清每日定时器 + 立即落盘（不用等 800ms 去抖）
for (const effect of ctx.effects) effect()

const saved = JSON.parse(readFileSync(ledger, 'utf8'))
const savedChat = saved.days[Object.keys(saved.days)[0]].models['deepseek-chat']
assert.equal(savedChat.ttftMs, 300)
assert.equal(savedChat.ttftSteps, 2)
assert.equal(savedChat.decodeMs, 800)
assert.equal(savedChat.decodeTokens, 70)

/* -------------------------------------------------------------------------- */
/* 7) 浏览器半边：buildView 合并时序 + 读数口径                                */
/* -------------------------------------------------------------------------- */

/** 按浏览器模块格式加载 client.js（与 test-model-merge.mjs 同一套桩）。 */
let entry = null
globalThis.window = {
  ...(globalThis.window ?? {}),
  __ModuleLoader__: {
    load(registration) {
      entry = registration
    }
  },
  localStorage: { getItem: () => null, setItem: () => {} }
}
globalThis.document = {
  body: {},
  head: { appendChild() {} },
  createElement: () => ({ dataset: {}, textContent: '' }),
  querySelector: () => null
}
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
// eslint-disable-next-line no-new-func -- 客户端半边就是按浏览器模块格式写的一整个文件
new Function(readFileSync(join(here, 'lib', 'client.js'), 'utf8'))()
assert.ok(entry !== null, 'client.js 没有按 __ModuleLoader__ 契约注册')

/** 最小 React 替身：只是让加载期定义组件不炸，这个测试不渲染。 */
const fakeReact = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (fn) => fn()
}
const client = entry.factory((id) => {
  if (id === 'react') return fakeReact
  if (id === 'react-dom') return { createPortal: (node) => node }
  if (id === 'dsh-model-name') return { displayName: (raw) => raw, splitBadge: (raw) => ({ base: raw }) }
  throw new Error('未预料的 require：' + id)
})

const { buildView } = client.__usage
const { timingReadings } = client.__timing

/** 两天的账：只测时序合并，模型名不做任何规范化/合并（两个开关都关）。 */
const recorded = new Map([
  [
    '2026-11-11',
    {
      date: '2026-11-11',
      total: 0,
      models: {
        'deepseek-chat': {
          tokens: 140, input: 100, output: 40, cacheRead: 0, cacheWrite: 0, calls: 1,
          ttftMs: 200, ttftSteps: 1, decodeMs: 300, decodeTokens: 40
        }
      }
    }
  ],
  [
    '2026-11-12',
    {
      date: '2026-11-12',
      total: 0,
      models: {
        'deepseek-chat': {
          tokens: 100, input: 40, output: 60, cacheRead: 0, cacheWrite: 0, calls: 1,
          ttftMs: 100, ttftSteps: 1, decodeMs: 500, decodeTokens: 60
        },
        'glm-vision': {
          // 外来上报：没有工时
          tokens: 15, input: 10, output: 5, cacheRead: 0, cacheWrite: 0, calls: 1
        }
      }
    }
  ]
])

const view = buildView(['2026-11-11', '2026-11-12'], recorded, false, false)
const chatModel = view.models.find((model) => model.id === 'deepseek-chat')
assert.ok(chatModel, 'deepseek-chat 应出现在模型排行里')
assert.equal(chatModel.ttftSteps, 2, '按模型合并时工时也合并')
assert.equal(chatModel.decodeTokens, 100)
// 这个模型自己的读数：100 token / 0.8s = 125 t/s；300ms / 2 步 = 150ms → 0.2秒
assert.deepEqual(timingReadings(chatModel), { speed: '125', ttft: '0.2秒' }, '每个模型自己的平均读数')

const visionModel = view.models.find((model) => model.id === 'glm-vision')
assert.equal(visionModel.ttftSteps, 0, '没有工时的模型不进分母')
assert.deepEqual(timingReadings(visionModel), { speed: null, ttft: null }, '外来上报没有工时 → 表格显示「—」')

// 切区间：读数跟着所选范围收窄（只剩 11-12：60 token / 0.5s = 120）
const onlyOneDay = buildView(['2026-11-12'], recorded, false, false).models.find((model) => model.id === 'deepseek-chat')
assert.deepEqual(timingReadings(onlyOneDay), { speed: '120', ttft: '0.1秒' })

// 「其他」行：折叠模型的时序相加后再算读数（加权，不是各行速度的平均）
const { sumTiming } = client.__timing
const grouped = sumTiming([
  chatModel,
  { ttftMs: 100, ttftSteps: 1, decodeMs: 500, decodeTokens: 20 }
])
assert.deepEqual(grouped, { ttftMs: 400, ttftSteps: 3, decodeMs: 1300, decodeTokens: 120 }, '多行时序相加')
assert.deepEqual(timingReadings(grouped), { speed: '92', ttft: '0.1秒' }, '相加后仍按加权口径')
assert.deepEqual(sumTiming([]), { ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 }, '空组给 0')
assert.deepEqual(sumTiming(undefined), { ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 })

assert.deepEqual(timingReadings({}), { speed: null, ttft: null }, '没有工时就不给读数（不显示 0）')
assert.deepEqual(timingReadings(undefined), { speed: null, ttft: null })

console.log('PASS: dsh-usage 时序桶（平均速度 / 平均首字延迟）自测通过')
rmSync(tmp, { recursive: true, force: true })
