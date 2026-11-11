window.__ModuleLoader__.load({
id: "dsh-titlebar-perf",
factory: () => {var module = { exports: {} };var exports = module.exports;/**
 * dsh-titlebar-perf —— 已停用（保留空壳，避免已安装的 profile 报错）
 * ================================================================
 *
 * 目标问题仍然存在：桌面壳 preload-windows.ts 用 MutationObserver 盯 head / body /
 * lang，每变一次就 getComputedStyle(probe) 强制整篇重排（3.7k 节点 8~18ms，
 * 13k 节点 233ms），流式输出时一秒几十次，把主线程塞满 → 提交不了帧（不重绘、
 * 鼠标不响应）→ 长连接漏心跳被 terminate → "卡死一会儿然后重连"。
 *
 * 但**插件侧无法安全消除它**，实测三条路都走不通：
 *
 *   1. 把探针摘出文档 —— 游离元素的 getComputedStyle 返回**空串**（Blink 不给
 *      脱文档元素解析样式），preload 的 canvas 取色 nativeColor("") 会沿用上一次
 *      fillStyle，于是背景色和符号色被同化成同一个值 → 标题栏和三个系统按钮
 *      变黑。这条路会直接把窗口 chrome 弄坏。
 *   2. 把探针搬进隐藏 iframe 再镜像 CSS 变量 —— 颜色能取对，但实测耗时不降
 *      反升（主文档 8~18ms vs iframe 15~23ms），没有收益。
 *   3. 阻止 head 子树变更 / 关掉观察者 —— 预加载的 observer 在隔离世界
 *      （contextIsolation: true），页面够不着；head 变更来自 dsh 核心自己的
 *      Vite 预加载（代码高亮语法包的 <link>）与 React 渲染，插件也拦不住。
 *
 * 结论：根治只能改上游 preload-windows.ts，四行：
 *   a. 把 "值没变就 return" 提到 getComputedStyle / nativeColor 之前 —— 先比
 *      root.lang + 主题属性，没变直接返回；
 *   b. head 只观察 childList，不要 subtree + characterData；
 *   c. send() 用 requestAnimationFrame 合并到一帧一次；
 *   d. 颜色改用 getComputedStyle(document.body).getPropertyValue('--dsw-*') 直接
 *      取变量，省掉 canvas 两次读回。
 *
 * 本文件保持空转：不碰 DOM、不挂观察者、不注册任何东西，卸载插件后即可完全移除。
 */
var TAG = "[dsh-titlebar-perf]";

function disable() {
        try {
                console.log(TAG + " 已停用（插件侧无法安全消除 preload 的强制重排，详见 README；标题栏取色保持原生行为）");
        } catch (error) { /* 日志失败无所谓 */ }
}

function apply() {
        disable();
}

exports.inject = [];
exports.apply = apply;
return module.exports;
}
});
