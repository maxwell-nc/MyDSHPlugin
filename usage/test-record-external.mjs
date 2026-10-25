/**
 * dsh-usage —— recordExternal / dsh-usage/report 集成自测。
 *
 * 不装进任何 profile、不花 token：用临时账本文件驱动 usage.mjs 的 apply()，
 * 收下注册的 `dsh-usage/report` 监听器，喂几份视觉上报，再读回账本断言
 * 「模型名、token 分桶、calls」都按预期落到「当天」名下。
 *
 * 运行：DSH_USAGE_DATA=<临时文件> node test-record-external.mjs
 * （脚本内已自动设好，直接 node 跑即可；账本写在系统临时目录，用完清理。）
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-usage-test-'))
const ledger = join(tmp, 'usage.json')
process.env.DSH_USAGE_DATA = ledger
process.env.DSH_USAGE_QUIET = '1'

const { apply } = await import('./usage.mjs')

/** 假 ctx：只记录它注册的监听器与 inject 子插件，apply 需要什么给什么。 */
function fakeCtx() {
  const listeners = new Map()
  const effects = []
  return {
    listeners,
    effects,
    get: () => undefined,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(handler)
      return () => {
        const list = listeners.get(event)
        const idx = list.indexOf(handler)
        if (idx >= 0) list.splice(idx, 1)
      }
    },
    inject(deps, fn) {
      // usage 只在有 connection 时挂 HTTP 路由；这里没有，跳过即可
      return () => {}
    },
    effect(fn) { effects.push(fn) },
  }
}

function emit(ctx, event, payload) {
  for (const handler of ctx.listeners.get(event) ?? []) handler(payload)
}

function state() {
  return JSON.parse(readFileSync(ledger, 'utf8'))
}

// apply 注册表单例作用域。为了能手动触发 flush/退出钩子，进程退出时会落盘，
// 这里读前先等一小会并触发退出路径。
const ctx = fakeCtx()
apply(ctx)
// 手动跑 apply 注册的 effect（清理每日定时器 + collect flush），否则进程退不掉
for (const effect of ctx.effects) effect()

// 1) 一份带 input+output 的视觉上报
emit(ctx, 'dsh-usage/report', {
  provider: 'ctai_my',
  model: 'glm-5.3-vision',
  usage: { inputTokens: 100, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
})
// 2) 一份只有模型没 provider、且没有 cache 桶的
emit(ctx, 'dsh-usage/report', {
  model: 'deepseek-vl',
  usage: { inputTokens: 50, outputTokens: 20 },
})
// 3) 一份空 usage —— 应该被忽略
emit(ctx, 'dsh-usage/report', { provider: 'x', model: 'y', usage: {} })
// 4) 一份非 usage 对象 —— 忽略
emit(ctx, 'dsh-usage/report', { provider: 'x', model: 'y' })

// 给去抖落盘留时间
await new Promise((r) => setTimeout(r, 1000))

const s = state()
assert.ok(s.days, '应有 days')

const dayKeys = Object.keys(s.days)
assert.equal(dayKeys.length, 1, '两天内只记到今天')

const day = s.days[dayKeys[0]]
const { models } = day

const a = models['glm-5.3-vision']
assert.ok(a, 'glm-5.3-vision 应被记账')
assert.equal(a.input, 100)
assert.equal(a.output, 40)
assert.equal(a.cacheRead, 0)
assert.equal(a.cacheWrite, 0)
assert.equal(a.tokens, 140)
assert.equal(a.calls, 1)

const b = models['deepseek-vl']
assert.ok(b, 'deepseek-vl 应被记账')
assert.equal(b.input, 50)
assert.equal(b.output, 20)
assert.equal(b.tokens, 70)
assert.equal(b.calls, 1)

assert.equal(Object.keys(models).length, 2, '空 usage 与缺 usage 的上报不计账')

// 5) 明细来源列表：两笔有效上报各记一笔，新到旧；没显式带 source 的兜底成「解析图片」
assert.ok(Array.isArray(s.sources), '应有 sources 明细列表')
assert.equal(s.sources.length, 2, '两笔有效上报 → 两笔来源明细')
assert.equal(s.sources[0].model, 'deepseek-vl')
assert.equal(s.sources[0].source, '解析图片', '未带 source 的上报默认归「解析图片」')
assert.equal(s.sources[0].tokens, 70)
assert.equal(s.sources[1].model, 'glm-5.3-vision')
assert.equal(s.sources[1].source, '解析图片')
assert.equal(s.sources[1].tokens, 140)
assert.ok(typeof s.sources[0].time === 'string' && s.sources[0].time.length > 0, '来源明细应带时间戳')

console.log('PASS: dsh-usage recordExternal/dsh-usage/report 集成自测通过')
rmSync(tmp, { recursive: true, force: true })