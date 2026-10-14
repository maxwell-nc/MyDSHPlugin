/**
 * dsh-motion-control —— 动画控制（host 半边）
 * ================================================================
 *
 * 真正干活的在 Web 半边（lib/client.js）：它在这个应用的渲染进程里覆写
 * `window.matchMedia` 并对 `prefers-reduced-motion` 说谎，从而无视操作系统
 * 的「减少动态效果」，强制动画开 / 关——这是唯一在 dsh 插件沙箱里可靠生效
 * 的路径（见 README 的架构结论）。
 *
 * 本半边只负责三件小事：
 *   1. 把 tri-state（follow / on / off）**持久化**到 `~/.dsh/dsh-motion-control.json`，
 *      Web 半边启动时通过 /api 读回，实现跨重启记忆；
 *   2. 暴露两个走 connection 鉴权通道的接口：GET /api/motion.get、POST /api/motion.set；
 *   3. **尽力而为**地尝试通过 Electron CDP 下发 `Emulation.setEmulatedMedia`
 *      ——在 dsh 的 host 沙箱里通常拿不到 webContents（host 与桌面主进程是两个
 *      进程、也没有远程调试端点），所以这一步几乎总会返回 `available:false`，
 *      属加分项、绝不依赖它，任何一步失败都不外抛。
 *
 * 家规：任何异常都不外抛，插件崩了不能连带 dsh 起不来（usage 家教规）。
 * 环境变量：DSH_MOTION_QUIET=1 不打启动横幅。
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

export const name = 'motion-control'

/** 本插件不依赖任何必选宿主服务：client 半边通过 slots 在 Web 侧干活。 */
export const inject = []

const TAG = '[dsh-motion-control]'
const QUIET = (process.env.DSH_MOTION_QUIET ?? '') === '1'

const ROUTE_GET = '/api/motion.get'
const ROUTE_SET = '/api/motion.set'

const MODES = ['follow', 'on', 'off']
const OVERRIDE_KEYS = ['whale', 'spinner', 'shimmer', 'js']
const DEFAULT_OVERRIDES = { whale: true, spinner: true, shimmer: true, js: true }

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
function stateFile() {
  return join(dshHome(), 'dsh-motion-control.json')
}

/** 当前生效模式：'follow' 跟随系统 | 'on' 强制开动画 | 'off' 强制关动画。 */
let mode = 'follow'
/** 每类动画的覆盖开关（仅「强制开启」时生效），默认全部覆盖=开。 */
let overrides = { ...DEFAULT_OVERRIDES }

/** 只保留合法键的布尔值，缺失项用默认 true。 */
function normalizeOverrides(value) {
  const out = { ...DEFAULT_OVERRIDES }
  if (value && typeof value === 'object') {
    for (const key of OVERRIDE_KEYS) {
      if (typeof value[key] === 'boolean') out[key] = value[key]
    }
  }
  return out
}

function state() {
  return { mode, overrides }
}

async function load() {
  try {
    const text = await readFile(stateFile(), 'utf8')
    const parsed = JSON.parse(text)
    if (MODES.includes(parsed?.mode)) mode = parsed.mode
    overrides = normalizeOverrides(parsed?.overrides)
  } catch {
    /* 首次运行或文件坏掉：保持默认 follow + 全开 */
  }
}

async function save() {
  try {
    await mkdir(dshHome(), { recursive: true })
    await writeFile(stateFile(), JSON.stringify(state(), null, 2))
  } catch (error) {
    console.error(`${TAG} 持久化失败：${error?.message ?? error}`)
  }
}

/** 模式下对应的媒体特性取值：'on' → no-preference，'off' → reduce，'follow' → 空（还原系统默认）。 */
function mediaValue() {
  if (mode === 'on') return 'no-preference'
  if (mode === 'off') return 'reduce'
  return ''
}

/* ----------------------- 尽力而为的 CDP 仿真（加分项） ----------------------- */

/**
 * 惰性拿 electron。在 dsh 的 host 沙箱里通常拿不到（host 不是桌面主进程），
 * 拿不到就返回 null，一切降级为纯 Web 半边方案。
 */
let electronPromise
function getElectron() {
  if (electronPromise === undefined) {
    electronPromise = (async () => {
      try {
        const { createRequire } = await import('node:module')
        const req = createRequire(import.meta.url)
        return req('electron')
      } catch {
        return null
      }
    })()
  }
  return electronPromise
}

/** 找 dsh 主窗口的 webContents（桌面主进程才有）并下发媒体仿真。任何失败降级。 */
async function cdpApply() {
  try {
    const electron = await getElectron()
    const all = electron?.webContents?.getAllWebContents
    if (typeof all !== 'function') return { available: false }
    const target = all.call(electron.webContents).find((wc) => {
      try {
        return /dsh-app:/.test(wc.getURL()) || /127\.0\.0\.1|localhost/.test(wc.getURL())
      } catch {
        return false
      }
    })
    if (!target) return { available: true, attached: false }
    const value = mediaValue()
    const debuggerApi = target.debugger
    if (!debuggerApi || !debuggerApi.isAttached()) debuggerApi?.attach?.('1.3')
    await debuggerApi.sendCommand('Emulation.setEmulatedMedia', {
      features: value ? [{ name: 'prefers-reduced-motion', value }] : [],
    })
    return { available: true, attached: true, value }
  } catch (error) {
    return { available: false, error: String(error?.message ?? error) }
  }
}

/* ------------------------- 插件入口 ------------------------- */

export function apply(ctx) {
  // 启动即读档 + 落盘；异步，不阻塞。
  load().then(save)

  ctx.inject(['connection'], (scoped) => {
    const register = (path, methods, handler) => {
      scoped.connection.fetch.register({
        path,
        methods,
        requestBody: 'buffered',
        fetch: async (request) => {
          try {
            const result = await handler(request)
            return Response.json(result ?? {}, { headers: { 'cache-control': 'no-store' } })
          } catch (error) {
            const status = Number(error?.status) || 500
            const message = String(error?.message ?? error)
            return Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } })
          }
        },
      })
    }

    register(ROUTE_GET, ['GET'], async () => ({
      mode,
      overrides,
      cdp: await cdpApply(),
      mediaValue: mediaValue(),
    }))

    register(ROUTE_SET, ['POST'], async (request) => {
      let body = {}
      try { body = await request.json() } catch { /* 非法 JSON 视为未提交 */ }
      if (MODES.includes(body?.mode)) {
        mode = body.mode
        overrides = normalizeOverrides(body?.overrides)
        await save()
      } else if (body?.overrides) {
        // 只改覆盖开关、模式不变。
        overrides = normalizeOverrides(body.overrides)
        await save()
      }
      return { mode, overrides, cdp: await cdpApply(), mediaValue: mediaValue() }
    })
  })

  if (!QUIET) {
    console.error(`${TAG} 动画控制已就绪（设置 → 动画控制；模式=${mode}）`)
  }
}

export default { name, inject, apply }