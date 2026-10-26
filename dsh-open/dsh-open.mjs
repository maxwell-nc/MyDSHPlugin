/**
 * dsh-open —— 用「系统默认工具」打开文件与文件夹（host 半边）
 * =====================================================================
 *
 * ## 为什么需要这个插件
 *
 * 宿主自带的「在文件夹中显示」在 Windows 上是**硬编码**的
 * `explorer.exe /select,<path>`（见 dsh 源码
 * `packages/util/native-command/src/path-opener.ts`）：Node 直接
 * CreateProcess，不走 shell 的动词表。于是哪怕系统默认文件管理器早就换成了
 * Directory Opus，那个按钮也只会唤出资源管理器。
 *
 * 这是结构性的，不是配置问题。Opus 的 Explorer Replacement 只有两条接管路径：
 *
 *   * shell 动词：`HKCU\Software\Classes\Folder\shell\(默认)=openindopus`
 *     → `dopusrt.exe /nodde /idlist,%I,%L`（**只有 ShellExecute 才走这里**）
 *   * DDE：`dopusrt.exe /dde` 监听文件夹打开请求
 *
 * Opus 官方文档 "Explorer replacement limitations" 明确写着：
 *   *A program that specifically invokes Explorer may not be able to be
 *    intercepted by Opus (although many times it will).*
 * 而 DSH 恰恰是 "specifically invokes Explorer"。唯一能劫持 CreateProcess 的
 * 手段是 IFEO（Image File Execution Options\explorer.exe\Debugger），那会连
 * 登录时的 shell 本身一起劫持，不能碰。
 *
 * ## 本插件的做法
 *
 * 不去「劫持 explorer.exe」，而是自己按**系统实际注册的默认文件管理器**来打开：
 *
 *   1. 探测：读 shell 自己的注册 —— HKCU/HKLM 的
 *      `Software\Classes\Folder\shell` 默认动词，再看该动词的 command。
 *      本机 Opus 接管时是 `openindopus` → `"<Opus>\dopusrt.exe" /nodde /idlist,%I,%L`。
 *      判据是「注册表说谁是默认」，不是「哪个 exe 存在」，所以用户换管理器也能跟上。
 *
 *   2. 动作（每一条都在本机实测过，结论见 README）：
 *        * Opus：`dopusrt.exe /open "<路径>"`。给文件夹开新 Lister；给**文件**
 *          路径时会打开所在目录并**选中该文件**（实测 tab 列表里 sel="1"）。
 *          之后再 `AppActivate` 把 Opus 置前 —— `/open` 自己不会置前（Windows
 *          前台锁：调用方不是前台进程），不补这一步只会后台开标签页。
 *        * 其他平台/管理器：打开走 ShellExecute（PowerShell `Start-Process`，
 *          路径经**环境变量**传递，规避一切引号/空格转义问题），定位走
 *          `explorer.exe /select,`（Windows）、`open -R`（macOS）、
 *          `xdg-open <父目录>`（Linux）。
 *
 *   3. 给 Web 半边两条同源 connection 路由：
 *        GET  /api/dsh-open.info  → 探测结果（按钮文案要用）
 *        POST /api/dsh-open.act   → { path, mode: 'open' | 'reveal' }
 *
 * 「操作只实现一次」：这两条路由就是唯一的实现，将来的 agent 工具直接调
 * perform() 即可，不另写一套逻辑。
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const name = 'dsh-open'

const TAG = '[dsh-open]'
const API_INFO = '/api/dsh-open.info'
const API_ACT = '/api/dsh-open.act'

/** 探测结果缓存时长：注册表随用户改（换文件管理器），别缓存太久。 */
const MANAGER_TTL_MS = 10_000

/** 上一次探测结果。 */
let managerCache = { at: 0, value: undefined }

const jsonResponse = (data, status = 200) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store' } })

/**
 * 统一收口的外部命令执行：不继承 stdio、有超时、失败带 stderr。
 * @param exe - 可执行文件。
 * @param args - 参数数组（不经过 shell，无需转义）。
 * @param options - timeoutMs / env / tolerateFailure。
 * @returns stdout/stderr；tolerateFailure 时失败返回 undefined。
 */
async function exec(exe, args, options = {}) {
  const { timeoutMs = 10_000, env, tolerateFailure = false } = options
  try {
    return await run(exe, args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 1 << 20,
      ...(env === undefined ? {} : { env })
    })
  } catch (error) {
    if (tolerateFailure) return undefined
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    const reason = stderr.length > 0 ? stderr : String(error?.message ?? error)
    throw new Error(`${exe} 执行失败：${reason}`)
  }
}

/**
 * 读一个注册表键的默认值（REG_SZ / REG_EXPAND_SZ）。
 * @param key - 完整键路径。
 * @returns 值；键不存在、无默认值或非 Windows 时返回 undefined。
 */
async function regDefaultValue(key) {
  try {
    const { stdout } = await run('reg.exe', ['query', key, '/ve'], { windowsHide: true, timeout: 5000 })
    const line = stdout.split(/\r?\n/).find(row => /\bREG_(?:SZ|EXPAND_SZ)\b/.test(row))
    if (line === undefined) return undefined
    const value = line.replace(/^.*?\bREG_(?:SZ|EXPAND_SZ)\s+/, '').trim()
    return value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * 从 shell 动词命令模板里取可执行文件路径。
 * @param command - 形如 `"C:\…\dopusrt.exe" /nodde /idlist,%I,%L`。
 * @returns exe 路径；取不到返回 undefined。
 */
function executableOf(command) {
  const quoted = command.match(/"([^"]+\.exe)"/i)
  if (quoted !== null) return quoted[1]
  const bare = command.match(/^\s*(\S+\.exe)/i)
  return bare === null ? undefined : bare[1]
}

/**
 * 探测系统当前注册的默认文件管理器。
 * @returns { kind: 'opus' | 'system', label, rt?, verb? }。
 */
async function detectFileManager() {
  if (process.platform !== 'win32') {
    return { kind: 'system', label: process.platform === 'darwin' ? '访达' : '系统默认' }
  }
  const now = Date.now()
  if (managerCache.value !== undefined && now - managerCache.at < MANAGER_TTL_MS) return managerCache.value

  let value = { kind: 'system', label: '系统默认' }
  for (const root of ['HKCU\\Software\\Classes', 'HKLM\\SOFTWARE\\Classes']) {
    const verb = await regDefaultValue(`${root}\\Folder\\shell`)
    if (verb === undefined) continue
    const command = await regDefaultValue(`${root}\\Folder\\shell\\${verb}\\command`)
    if (command === undefined) continue
    const exe = executableOf(command)
    if (exe === undefined) continue
    if (/dopusrt\.exe|dopus\.exe/i.test(exe)) {
      const rt = join(dirname(exe), 'dopusrt.exe')
      value = { kind: 'opus', label: 'Directory Opus', rt: existsSync(rt) ? rt : exe, verb }
      break
    }
  }
  managerCache = { at: now, value }
  return value
}

/**
 * 把 Opus 主窗口拉到前台（best-effort，失败不影响已经打开的窗口）。
 * `/open` 自己不会置前，而调用方（DSH 宿主）不是前台进程，所以必须显式补一次。
 * @returns 是否成功置前。
 */
async function focusOpus() {
  // 注意：Microsoft.VisualBasic.Interaction::AppActivate(int) 返回 **void**，
  // 写成 `if (AppActivate(...))` 永远为假（早期版本就是这么误报失败的）。
  // 判定改成「找到带窗口的 Opus 进程 → 调用 → 报告成功」，找不到才重试。
  const script = [
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    'for ($i = 0; $i -lt 20; $i++) {',
    '  $p = Get-Process -Name dopus -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1',
    '  if ($null -ne $p) { [Microsoft.VisualBasic.Interaction]::AppActivate($p.Id); exit 0 }',
    '  Start-Sleep -Milliseconds 200',
    '}',
    'exit 3'
  ].join('; ')
  try {
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 15_000 })
    return true
  } catch (error) {
    console.error(`${TAG} 置前失败（窗口已打开，只是没抢到焦点）：${String(error?.message ?? error)}`)
    return false
  }
}

/**
 * Windows 盘符路径（D:\x、D:/x、\\server\share）或 POSIX 绝对路径。
 * @param value - 待判定路径。
 * @returns 是否绝对路径。
 */
function isAbsoluteTarget(value) {
  if (value.startsWith('/') || value.startsWith('\\\\')) return true
  return /^[a-zA-Z]:[\\/]/.test(value)
}

/**
 * 用默认文件管理器打开（或定位到）一个路径。
 * @param target - 绝对路径。
 * @param mode - 'open' 打开；'reveal' 定位（能选中就选中）。
 * @param manager - detectFileManager() 的结果。
 * @returns { command, focused? }。
 */
async function openWithManager(target, mode, manager) {
  if (manager.kind === 'opus') {
    // /open 同时覆盖两种语义：文件夹开新 Lister；文件则打开所在目录并选中它。
    await exec(manager.rt, ['/open', target])
    const focused = await focusOpus()
    return { command: `"${manager.rt}" /open ${JSON.stringify(target)}`, focused }
  }

  if (process.platform === 'darwin') {
    await exec('open', mode === 'reveal' ? ['-R', target] : [target])
    return { command: `open ${mode === 'reveal' ? '-R ' : ''}${target}` }
  }

  if (process.platform === 'linux') {
    // xdg-open 没有通用的「定位并选中」语义，退回打开所在目录。
    const opened = mode === 'reveal' ? dirname(target) : target
    await exec('xdg-open', [opened])
    return { command: `xdg-open ${opened}` }
  }

  if (mode === 'reveal') {
    // explorer.exe 成功时也常返回 1，退出码不可信 → tolerateFailure。
    await exec('explorer.exe', [`/select,${target}`], { tolerateFailure: true })
    return { command: `explorer.exe /select,${target}` }
  }

  // 打开交给 shell 自己解析（ShellExecute）：任何注册成默认的文件管理器都能生效。
  // 路径经环境变量传入，避免在命令行里做引号转义。
  await exec(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:DSH_OPEN_TARGET'],
    { env: { ...process.env, DSH_OPEN_TARGET: target } }
  )
  return { command: `ShellExecute ${JSON.stringify(target)}` }
}

/**
 * 调用方问题（路径非法或不存在）→ 400；其余（命令执行失败等）→ 500。
 * @param message - 给用户看的失败原因。
 * @returns 带 status 的 Error。
 */
function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

/**
 * 两个模式的共同入口：校验路径 → 探测管理器 → 分派。
 * @param request - { path, mode }。
 * @returns 结果对象（成功）或抛出带原因的错误。
 */
async function perform(request) {
  const target = typeof request?.path === 'string' ? request.path.trim() : ''
  const mode = request?.mode === 'reveal' ? 'reveal' : 'open'
  if (target.length === 0) throw badRequest('缺少 path')
  if (target.length > 4096) throw badRequest('path 过长')
  if (!isAbsoluteTarget(target)) throw badRequest(`只接受绝对路径：${target}`)

  let info
  try {
    info = await stat(target)
  } catch {
    throw badRequest(`路径不存在或不可访问：${target}`)
  }

  const manager = await detectFileManager()
  const result = await openWithManager(target, mode, manager)
  return {
    ok: true,
    mode,
    path: target,
    kind: info.isDirectory() ? 'directory' : 'file',
    opener: { kind: manager.kind, label: manager.label },
    ...result
  }
}

/**
 * 注册两条 connection 路由；没有 connection 服务（CLI 组合）时静默跳过。
 * @param ctx - host 根上下文。
 */
export function apply(ctx) {
  ctx.inject(['connection'], (scoped) => {
    const conn = scoped.connection

    conn.fetch.register({
      path: API_INFO,
      methods: ['GET'],
      // 必须显式 'buffered'：bridge 按「命中路由取 requestBody、缺省走流式」分派，
      // 流式分支会给 GET 挂 stream body，undici 的 Request 构造器对 GET+body 抛
      // TypeError，前端拿到空响应体。
      requestBody: 'buffered',
      fetch: async () => {
        try {
          const manager = await detectFileManager()
          return jsonResponse({
            ok: true,
            platform: process.platform,
            opener: { kind: manager.kind, label: manager.label }
          })
        } catch (error) {
          return jsonResponse({ ok: false, error: String(error?.message ?? error) }, 500)
        }
      }
    })

    conn.fetch.register({
      path: API_ACT,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = await request.json().catch(() => null)
          if (body === null || typeof body !== 'object') {
            return jsonResponse({ ok: false, error: '请求体必须是 JSON 对象' }, 400)
          }
          return jsonResponse(await perform(body))
        } catch (error) {
          const message = String(error?.message ?? error)
          const status = Number.isInteger(error?.status) ? error.status : 500
          console.error(`${TAG} 打开失败：${message}`)
          return jsonResponse({ ok: false, error: message }, status)
        }
      }
    })

    console.error(`${TAG} 接口就绪：GET ${API_INFO} / POST ${API_ACT}`)
  })
}

export default { name, apply }
