# dsh-titlebar-perf —— 已停用（结论记录）

> **状态：空转。** 装着的 profile 不会报错，但它什么都不做；标题栏取色完全交回
> 桌面壳 preload。可以随时在插件管理器里卸载。

## 要治的问题（仍然存在）

Windows 桌面壳 `apps/desktop/src/preload-windows.ts` 为了给标题栏 / 系统按钮上色：

- 往 body 插一个隐形 `<span>` 探针，用 `getComputedStyle(probe)` 取色；
- 用 `MutationObserver` 盯着 `document.head` 整棵子树（childList + subtree +
  characterData）、`body` 的 style / `data-ds-dark-theme`、`html` 的 lang；
- **每变一次就同步取色**，而只要文档样式是脏的，这一下就是整篇强制重排；
- 而且"值没变就返回"写在最贵的两步（取色、canvas 读回）后面，值不变也付全价。

实测单次成本：3.7k 节点 8~18ms，13k 节点 **233ms**。流式输出时每秒几十次，
主线程被塞满 → 提交不了帧（不重绘、鼠标输入不派发）→ 长连接漏心跳被网关
terminate → "卡死一会儿，然后自动重连"。

## 为什么插件修不了（实测三条路都不行）

| 方案 | 结果 |
|---|---|
| 把探针摘出文档 | `getComputedStyle` 对脱文档元素返回**空串**；preload 的 `nativeColor("")` 会沿用 canvas 上一次 fillStyle，背景色和符号色被同化 → 标题栏和三个按钮**变黑** |
| 搬进隐藏 iframe + 镜像 CSS 变量 | 颜色能取对，但耗时反升：主文档 8~18ms vs iframe 15~23ms |
| 阻止 head 变更 / 关观察者 | preload 的 observer 在隔离世界（`contextIsolation: true`），页面够不着；head 变更来自核心的 Vite 预加载（高亮语法包的 `<link>`）与 React 渲染 |

## 根治方案（上游四行）

`apps/desktop/src/preload-windows.ts`：

1. 把"值没变就 return"提到取色之前 —— 先比 `root.lang` + 主题属性，没变直接返回；
2. `document.head` 只观察 `childList`，去掉 `subtree` 与 `characterData`；
3. `send()` 用 `requestAnimationFrame` 合并，一帧最多一次；
4. 颜色直接读 `getComputedStyle(document.body).getPropertyValue('--dsw-specific-sidebar-fill')`
   与 `--dsw-alias-label-primary`，省掉 canvas 两次读回。
