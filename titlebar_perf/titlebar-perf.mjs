/**
 * dsh-titlebar-perf —— Windows 桌面壳标题栏取色的性能修补（host 半边）
 * ================================================================
 *
 * 真正干活的在 Web 半边（lib/client.js）：它把桌面壳 preload 用来取色的那个
 * 隐形探针摘出文档，让 preload 每次 DOM 变更时那一下"整篇强制重排"变成 0 成本，
 * 主题变化时再由插件把颜色写回去（详见 client.js 头部与 README）。
 *
 * 本半边只是为了让这个包成为 profile 插件树里的一个 loader 行 —— dsh 的
 * client 模块发现是跟着 loader entry 走的（见 packages/client/modules/src/index.ts），
 * 没有 host 半边的话 Web 半边根本不会被装上。除此之外它不做任何事，
 * 也不注册任何路由 / 服务 / 定时器。
 *
 * 家规：任何异常都不外抛，插件崩了不能连带 dsh 起不来。
 */

export const name = 'titlebar-perf'

/** 不依赖任何宿主服务。 */
export const inject = []

/** 只打一行启动日志（DSH_TITLEBAR_PERF_QUIET=1 可关掉）。 */
export function apply() {
  if ((process.env.DSH_TITLEBAR_PERF_QUIET ?? '') === '1') return
  console.log('[dsh-titlebar-perf] 已挂载（仅 Windows 桌面端生效；网页版自动空转）')
}
