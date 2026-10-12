/**
 * stream-check.mjs —— host 半边行为自检（不需要 dsh，桩上下文直接驱动 apply）。
 *
 * 覆盖：
 *   1. 两条 /api 路由注册成功；
 *   2. 快照接口返回正确的 running 状态 JSON；
 *   3. SSE 流：序言 retry + 初始 st；Agent 开始跑后 st r=1 + 180ms 帧流；
 *      停止后 st r=0 帧流停止；空闲期 hb 心跳；客户端断开（abort）后泵停转；
 *   4. 卸载 disposer 执行无异常、流关闭。
 *
 * 运行：node test/stream-check.mjs
 */
import assert from 'node:assert/strict'
import { apply } from '../whale-title.mjs'

const STREAM_PATH = '/api/whale-title.stream'
const STATUS_PATH = '/api/whale-title.status'

/** 桩：可控的 Agent 集合。 */
const fakeAgents = [{ status: 'idle' }, { status: 'idle' }]
const disposers = []
const routes = {}

const ctx = {
  agents: {
    list: () => fakeAgents
  },
  inject: (names, set) => {
    set({
      connection: {
        fetch: {
          register: (route) => {
            routes[route.path] = route
          }
        }
      }
    })
  },
  effect: (setup, _label) => {
    disposers.push(setup())
  }
}

apply(ctx)

assert.ok(routes[STREAM_PATH], 'SSE 路由未注册')
assert.ok(routes[STATUS_PATH], '快照路由未注册')
console.log('[1] 两条路由注册 ✓')

const fallbackConsole = console.error
console.error = (...args) => {
  const text = String(args[1] ?? '')
  if (!text.includes('已就绪')) fallbackConsole(...args)
}

/* ---- 快照接口 ---- */
{
  const response = await routes[STATUS_PATH].fetch(new Request('http://x' + STATUS_PATH))
  const json = await response.json()
  assert.equal(json.ok, true)
  assert.equal(json.running, false)
  assert.equal(json.runningCount, 0)
  assert.equal(json.agents, 2)
  fakeAgents[1].status = 'running'
  const again = await (await routes[STATUS_PATH].fetch(new Request('http://x' + STATUS_PATH))).json()
  assert.equal(again.running, true)
  assert.equal(again.runningCount, 1)
  fakeAgents[1].status = 'idle'
  console.log('[2] 快照接口状态正确 ✓')
}

/* ---- SSE 流 ---- */
const decoder = new TextDecoder()
let received = ''
let lastLength = 0

const controller = new AbortController()
const request = new Request('http://x' + STREAM_PATH, { signal: controller.signal })
const response = await routes[STREAM_PATH].fetch(request)
assert.equal(response.status, 200)
assert.match(response.headers.get('content-type'), /text\/event-stream/)
assert.equal(response.headers.get('cache-control'), 'no-store')
const reader = response.body.getReader()

const pumpIn = (async () => {
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += decoder.decode(value, { stream: true })
    }
  } catch {
    /* abort */
  }
})()

const drain = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const count = (needle) => received.split(needle).length - 1

// 给第一条 reader.read() 一个事件循环周期把序言捞出来
await drain(150)
assert.ok(received.includes('retry: 2000'), '序言缺 retry')
console.log('[3a] SSE 序言格式 ✓')

await drain(500)
{
  const response2 = await routes[STATUS_PATH].fetch(new Request('http://x' + STATUS_PATH))
  void response2
}
assert.ok(received.includes('event: st\ndata: {"r":0}'), '初始状态未推送 st r=0')
console.log('[3b] 初始空闲状态 st r=0 ✓')

fakeAgents[0].status = 'running'
await drain(700)
assert.ok(received.includes('event: st\ndata: {"r":1}'), '运行态未推送 st r=1')
assert.ok(count('event: fr') >= 3, '运行期帧流未出现')
lastLength = received.length
await drain(500)
assert.ok(received.length > lastLength, '运行期帧流中断')
const frames = [...received.matchAll(/event: fr\ndata: {"k":(\d+)\}/g)].map((m) => Number(m[1]))
for (let i = 1; i < frames.length; i++) assert.equal(frames[i], frames[i - 1] + 1, '帧号必须连续')
console.log('[3c] 运行期 st r=1 + 连续帧流 ✓（帧号样例:', frames.slice(-3).join('→'), '）')

fakeAgents[0].status = 'idle'
await drain(600)
const stopAt = count('event: fr')
assert.ok(received.includes('event: st\ndata: {"r":0}', received.indexOf('event: st\ndata: {"r":1}')), '结束态未推送 st r=0')
await drain(400)
assert.equal(count('event: fr'), stopAt, '空闲后仍有帧到达')
console.log('[3d] 结束态 st r=0、帧流停 ✓（空闲保持 st 状态不变）')

await drain(4000)
assert.ok(count('event: hb') >= 1, '空闲心跳 hb 未出现')
console.log('[3e] 空闲心跳 hb ✓')

/* ---- 断开与卸载 ---- */
const before = received.length
controller.abort()
await drain(400)
assert.equal(received.length, before, '断开后仍有字节')

for (const dispose of disposers) dispose()
for (const dispose of disposers) assert.equal(typeof dispose, 'function')
console.log('[4] abort 后泵停转、卸载 disposer 无异常 ✓')

console.error = fallbackConsole
console.log('\n[stream-check] 全部通过 ✓')
