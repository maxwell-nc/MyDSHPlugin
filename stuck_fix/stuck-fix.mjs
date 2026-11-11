/**
 * dsh-stuck-fix —— 桌面端"卡死"引信拆除器（host 半边）
 * ================================================================
 *
 * 真正干活的在 Web 半边（lib/client.js）：它盯着 <head> 的变动速率，一旦进入
 * "每次变动都强制整篇重排"的风暴，就替桌面壳 preload 跑掉它自己的 pagehide 收尾
 * （断开取色观察者 + 移除探针），把主线程救回来。详见 client.js 头部与 README。
 *
 * 本半边只是为了让这个包成为 profile 插件树里的一个 loader 行 —— dsh 的 client
 * 模块发现是跟着 loader entry 走的，没有 host 半边的话 Web 半边不会被装上。
 * 除此之外它不做任何事，也不注册任何路由 / 服务 / 定时器。
 *
 * 家规：任何异常都不外抛，插件崩了不能连带 dsh 起不来。
 */
export const name = 'stuck-fix'
/** 不依赖任何宿主服务。 */
export const inject = []
/** 只打一行启动日志（DSH_STUCK_FIX_QUIET=1 可关掉）。 */
export function apply() {
  if ((process.env.DSH_STUCK_FIX_QUIET ?? '') === '1') return
  console.log('[dsh-stuck-fix] 已挂载（仅 Windows 桌面端生效；网页版自动空转）')
}
