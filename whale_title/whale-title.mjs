/**
 * dsh-whale-title —— 任务运行时窗口标题鲸鱼动画
 * ================================================
 *
 * 复刻 DeepseekHarnessDesktopLite 的「任务栏鲸鱼」：只要有任一 Agent 在跑，
 * 窗口标题（也就是任务栏按钮文字）就变成一条在一层层推开的浪里往返的鲸鱼；
 * 空闲后恢复 dsh 官方标题（dsh-client-ui-layout 维护的「会话标题 — DeepSeek」）。
 *
 * 旧版是一个独立的 Python 外壳，用两个 dsh 之外的能力实现：
 *   1. 原生 GUI API 直接改窗口标题；
 *   2. 开 WebSocket 用 `api-session/status` 事件 + 后台线程画动画帧。
 * 官方版 dsh 里这两样都有插件可达的等价物：
 *
 * 1. 标题：桌面 App 的窗口标题跟随 document.title（Electron 默认行为，
 *    官方 dsh-client-ui-layout 正是自己写 `document.title = 标题 — 产品名`）。
 *    浏览器半边（lib/client.js）写 document.title 就能驱动窗口标题/任务栏文字。
 * 2. 状态：Agent.status（'idle' | 'running'）就是 `api-session/status` 事件
 *    的上游真源（dsh-api-session-controller 由 agent/status 转发而来）。
 *    host 半边每帧现场读 ctx.agents.list()，不缓存、不靠事件补集 —— 插件
 *    中途装载 / HMR 重载后，已经在跑的任务也立即可见。
 *
 * 为什么帧由宿主 SSE 推、而不是浏览器半边 setInterval 自己画：
 *   官方桌面 App 没有动 Electron 的 backgroundThrottling（默认 true），
 *   窗口最小化约 5 分钟后 Chromium 会把 DOM 定时器链压到 1 次/分钟 ——
 *   客户端本地计时会把鲸鱼冻住。SSE 事件走网络唤醒、不受该节流约束，
 *   而且「持有活动连接的页面」本身就是 Chromium 定时器节流的豁免类。
 *   旧版外壳是另一个进程所以没有这个问题；SSE 是官方版里的等价物。
 *
 * 浏览器半边另有降级路径（EventSource 断到连不上时改本地计时 + 轮询），
 * 见 lib/client.js。
 *
 * -----------------------------------------------------------------------
 *
 * 任何异常都不能连带 dsh 起不来：所有入口 try/catch（usage 插件的家规）。
 * `ctx.effect` 用「返回 disposer」的姿势：`ctx.effect(() => () => 清理())`。
 * 直接把清理语句写进 callback 会在**注册时**当场执行（cordis 4 的语义，
 * lan_access 插件踩过，usage 里那条其实是个恰好无害的潜在 bug）。
 */

export const name = 'whale-title'

/**
 * 非有它不可的服务：`ctx.agents` 由 dsh-base 的 dsh-agent-loop 提供，
 * 每个带 Agent 的 profile 都有，声明它不会把插件挂死在别的 profile 里。
 * `connection` 只有 web profile 有，所以放在 apply() 里 `ctx.inject` 按需
 * 绑定（和 usage 一致）—— 没有 connection 的 profile 里插件就是纯待机。
 */
export const inject = ['agents']

const TAG = '[dsh-whale-title]'

/** 浏览器半边的 SSE 帧流入口，走 connection 的鉴权通道。 */
const STREAM_PATH = '/api/whale-title.stream'
/** 一次性状态快照接口：浏览器半边的降级轮询 / 人工 curl 调试用。 */
const STATUS_PATH = '/api/whale-title.status'

/** 帧间隔（毫秒）：与旧版 FRAME_INTERVAL = 0.18s 完全一致。 */
const FRAME_MS = 180
/** 空闲期心跳周期（帧 tick 数）：1 tick = 180ms → 20 tick ≈ 3.6s 一次。 */
const HEARTBEAT_TICKS = 20

export function apply(ctx) {
  const encoder = new TextEncoder()

  /* ------------------------------------------------------------------- */
  /* 任务状态采样                                                          */
  /* ------------------------------------------------------------------- */

  // 连续失败只在「进入失败 / 离开失败」时各报一次，避免 180ms 喷屏。
  let sampleHealthy = true

  /**
   * 现在有没有 Agent 在跑。
   *
   * Agent.status 是个 getter（phase.kind 不是 idle/maintenance 就是 running），
   * 它正是 agent/status 事件、进而 api-session/status 事件的同一真源，
   * 所以语义和旧版盯 api-session/status 完全等价（包括子代理/工作流代理）。
   */
  function sample() {
    let running = 0
    let total = 0
    let ok = true
    try {
      const agents = ctx.agents.list()
      total = agents.length
      for (const agent of agents) {
        try {
          if (agent.status === 'running') running += 1
        } catch {
          // 迭代中间 agent 被卸载之类的瞬态，跳过这一项即可
        }
      }
    } catch (error) {
      ok = false
      if (sampleHealthy) {
        sampleHealthy = false
        console.error(`${TAG} Agent 状态采样失败：${String(error?.message ?? error)}`)
      }
    }
    // 恢复时不日志：反复 ok/不 ok 只会刷屏，失败时已经有一次性标记
    if (ok && !sampleHealthy) sampleHealthy = true
    return { running, total, ok }
  }

  /* ------------------------------------------------------------------- */
  /* 共享泵：一条 interval 驱动所有打开的 SSE 流                            */
  /* ------------------------------------------------------------------- */

  /** 帧号：只在运行期递增（空闲冻结）—— 和旧版一样，鲸鱼停走不停帧。 */
  let tick = 0
  /** null = 本连接周期还没广播过状态；true/false = 最近一次广播的运行态。 */
  let lastRunning = null
  /** 每条流的能力句柄；空集时共享泵停转。 */
  const streams = new Set()
  let pumpHandle = null
  let heartbeat = HEARTBEAT_TICKS

  function broadcast(chunk) {
    for (const stream of streams) {
      try {
        stream.write(chunk)
      } catch {
        // 写死掉的流：该流的 abort/cancel 负责把它摘出去，这里不甩锅
      }
    }
  }

  function pump() {
    const { running } = sample()
    const now = running > 0
    if (lastRunning === null || now !== lastRunning) {
      lastRunning = now
      broadcast(`event: st\ndata: {"r":${now ? 1 : 0}}\n\n`)
    }
    if (now) {
      tick += 1
      // 帧事件只带帧号，鲸鱼长什么样由浏览器半边自己画（表现层的事不跨线传）
      broadcast(`event: fr\ndata: {"k":${tick}}\n\n`)
    } else {
      heartbeat -= 1
      if (heartbeat <= 0) {
        heartbeat = HEARTBEAT_TICKS
        // 空闲期心跳。必须是真事件而不是注释行（`: keepalive`）：
        // EventSource 对注释行不派发任何事件，浏览器半边的新鲜度看门狗
        // 就没法把「健康但空闲」的连接和「掐断了」区分开。
        broadcast('event: hb\ndata: {}\n\n')
      }
    }
  }

  function startPump() {
    if (pumpHandle != null) return
    pumpHandle = setInterval(() => {
      try {
        pump()
      } catch (error) {
        console.error(`${TAG} 帧泵异常：${String(error?.message ?? error)}`)
      }
    }, FRAME_MS)
  }

  function stopPump() {
    if (pumpHandle == null) return
    clearInterval(pumpHandle)
    pumpHandle = null
  }

  /** 停泵判据：所有流都结束了才停（新流接入会重新点着）。 */
  function maybeStopPump() {
    if (streams.size === 0) {
      lastRunning = null
      heartbeat = HEARTBEAT_TICKS
      stopPump()
    }
  }

  /* ------------------------------------------------------------------- */
  /* SSE 路由                                                              */
  /* ------------------------------------------------------------------- */

  /**
   * 事件序列（自上而下）：
   *   `retry: 2000`              —— 断线后最多等 2s 重连；
   *   `st  {"r":0|1}`            —— 状态翻转事件（连上后立刻发一次当前值）；
   *   `fr  {"k":<帧号>}`         —— 运行期每 180ms 一发，鲸鱼由客户端按 k 计算；
   *   `: keepalive`              —— 空闲期注释行，仅维持连接。
   */
  function fetchStream(request) {
    const stream = {
      write: () => {},
      close: () => {},
      closed: false
    }
    let onAbort = () => {}

    const body = new ReadableStream({
      start(controller) {
        stream.write = (text) => {
          if (stream.closed) return
          try {
            controller.enqueue(encoder.encode(text))
          } catch {
            stream.closed = true
            streams.delete(stream)
            controller.close() // 兜底 for-await 结束；半途其 cancel/abort 也已种下
            maybeStopPump()
          }
        }
        stream.close = () => {
          if (stream.closed) return
          stream.closed = true
          try {
            controller.close()
          } catch {
            // 已经关过了
          }
          streams.delete(stream)
          maybeStopPump()
        }
        // 载体层面客户端断开时：bridge 会中断 Request 的 signal（res on close），
        // 我们在这里摘流；ReadableStream.cancel 也做同样的事，双保险。
        onAbort = () => stream.close()
        try {
          request.signal.addEventListener('abort', onAbort, { once: true })
        } catch {
          // no signal 的调用方（测试桩）就靠 cancel 了
        }
        streams.add(stream)
        try {
          stream.write('retry: 2000\n\n')
          const { running } = sample()
          stream.write(`event: st\ndata: {"r":${running > 0 ? 1 : 0}}\n\n`)
        } catch (error) {
          console.error(`${TAG} 写流序言失败：${String(error?.message ?? error)}`)
        }
        startPump()
      },
      cancel() {
        stream.closed = true
        streams.delete(stream)
        maybeStopPump()
      }
    })

    return Promise.resolve(
      new Response(body, {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          'x-accel-buffering': 'no'
        }
      })
    )
  }

  function fetchStatus() {
    const { running, total, ok } = sample()
    return Promise.resolve(
      Response.json(
        {
          v: 1,
          ok,
          running: running > 0,
          runningCount: running,
          agents: total,
          frameMs: FRAME_MS
        },
        { headers: { 'cache-control': 'no-store' } }
      )
    )
  }

  /* ------------------------------------------------------------------- */
  /* 装配                                                                  */
  /* ------------------------------------------------------------------- */

  // 传输层是可选的：只有 web profile 有 connection，缺了就纯待机
  ctx.inject(['connection'], (scoped) => {
    try {
      scoped.connection.fetch.register({
        path: STREAM_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => fetchStream(request)
      })
      scoped.connection.fetch.register({
        path: STATUS_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: () => fetchStatus()
      })
      console.error(`${TAG} 帧流已就绪：${STREAM_PATH}；快照接口：${STATUS_PATH}`)
    } catch (error) {
      console.error(`${TAG} 注册 /api 路由失败：${String(error?.message ?? error)}`)
    }
  })

  // 卸载 / HMR 重载：掐断所有流、停泵。浏览器那边 EventSource 会自己重连，
  // 新 half 装好后无缝接回（帧号从 1 重新数，鲸鱼就当是换了一口气）。
  ctx.effect(
    () => () => {
      for (const stream of [...streams]) {
        try {
          stream.close()
        } catch {
          // 收尾路径不再抛
        }
      }
      streams.clear()
      stopPump()
    },
    'dsh-whale-title: close SSE streams'
  )
}

export default { name, inject, apply }
