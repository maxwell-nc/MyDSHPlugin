# dsh-stuck-fix —— 桌面端"卡死"引信拆除器

> 前身 `dsh-titlebar-perf`（当时是个停用的空壳）。改名后不再只记录结论，而是真的动手。

## 治的是什么

Windows 桌面壳 `apps/desktop/src/preload-windows.ts` 的 `syncWindowsAppearance`：

- 往 body 插一个隐形 `<span>` 探针，用 `getComputedStyle(probe)` 取标题栏颜色；
- `MutationObserver` 盯着 `document.head` 整棵子树（childList + subtree + characterData）
  以及 `body` 的 style / `data-ds-dark-theme`、`html` 的 lang；
- **每变一次就同步取色**；文档样式一脏，这一下就是整篇强制重排；
- "值没变就 return" 写在取色和 canvas 读回**之后** —— 值不变也付全价。

2026-11-11 用 V8 采样抓到的现场：卡死 100 秒的窗口里，**101,172ms / 101,188ms**
的采样全落在那个 `send()` 上。主线程完全不让出 → 不重绘、鼠标无响应、心跳发不出
→ 宿主 terminate 长连接 → 界面显示"重新连接中"，实测能卡 26 分钟不恢复。

单次成本：3.7k 节点 8~18ms，13k 节点 233ms（本机空闲、样式干净时 0.34ms，
所以平时看不出来，只在流式输出把样式改脏时爆发）。

## 为什么插件现在能修（之前记录的三条路仍然不通）

preload 在**隔离世界**（`contextIsolation: true`），页面改不到它的代码 —— 实测：页面里
包一层 `getComputedStyle`，往 head 打 10 次变更，**一次都没经过**包装函数；
`window.process` / `require` / `electron` 在主世界也全是 undefined。

| 老路 | 结果 |
|---|---|
| 把探针摘出文档 | 脱文档元素 `getComputedStyle` 返回空串（实测，哪怕内联的是字面量颜色也一样）；`nativeColor("")` 沿用上一次 fillStyle → 背景色与符号色同化 → 标题栏和三个系统按钮变黑 |
| 搬进隐藏 iframe + 镜像 CSS 变量 | 颜色能取对，耗时反升（主文档 8~18ms vs iframe 15~23ms） |
| 关掉那个 observer | 隔离世界，够不着 |

**新路：不关它，让它自己收尾。** preload 自己挂了 `pagehide` 的清理：

```js
observer.disconnect(); menu.dispose(); probe.remove(); ...
```

主世界派发的 DOM 事件能到达隔离世界的监听器 —— 实测 `window.dispatchEvent(new
Event('pagehide'))` 之后取色探针确实从 body 上消失了（`document.head` 上的
`load` 捕获监听也一并摘掉）。所以插件只要判断"风暴来了"，就把这份收尾替它跑掉：
观察者断开，取色不再发生，主线程立刻活。

控制台实测：`DOMDebugger.getEventListeners(window)` 里主世界的 `pagehide`
监听器是 **0** 个，所以派发这个合成事件不会误伤应用自己的收尾逻辑。

## 代价（必须知情）

- 标题栏 / 系统按钮的颜色停在**最后一次正确的值**，不再随主题切换变化；
- titlebar 的原生右键菜单被一并销毁；
- 重新加载窗口（Ctrl+R）恢复原生行为 —— 风暴再来，插件会再拆一次。

换来的是：**不再卡死**。

## 判据

| 参数 | 值 | 说明 |
|---|---|---|
| `BUCKET_MS` | 500 | 一个采样桶 |
| `TRIP_PER_BUCKET` | 13（≈26 次/秒） | 单拍达到就拆（纯速率的天花板） |
| `LAG_MS` + `LAG_MIN_CHURN` | 120ms + 6 次 | **定时器自己晚到**这么多、且这一拍确有 head 变动，说明主线程已被占住 —— 拆 |
| `SUSTAINED_PER_BUCKET` | 8（≈16 次/秒） | 连续两拍都在水位也拆（慢起势的风暴） |
| `WARMUP_MS` | 5000 | 首屏 Vite 预加载一批 `<link>` 不算数 |

掉帧判据是主判据：一次取色的成本随文档规模暴涨（13k 节点 233ms/次），光看速率会漏，
而"定时器晚到"正是主线程被占的直接读数。空闲时它是 0~20ms。

head 变动的实际来源（2026-11-11 用探针按秒统计）：**`<title>` 被反复摘掉再挂上**，
以及 head 直接子节点的增删，空闲时 2~10 次/秒 —— 每次都会触发 preload 取色。流式输出
时 React 重渲染更密，叠加变贵的重排，就是卡死。

## 根治仍然在上游

`apps/desktop/src/preload-windows.ts` 四行：

1. 把"值没变就 return"提到取色之前 —— 先比 `root.lang` + 主题属性，没变直接返回；
2. `document.head` 只观察 `childList`，去掉 `subtree` 与 `characterData`；
3. `send()` 用 `requestAnimationFrame` 合并，一帧最多一次；
4. 颜色直接读 `getComputedStyle(document.body).getPropertyValue('--dsw-specific-sidebar-fill')`
   与 `--dsw-alias-label-primary`，省掉 canvas 两次读回。

上游修好后本插件自动空转：找不到探针就什么都不做。