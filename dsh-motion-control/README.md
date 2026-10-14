# dsh-motion-control —— dsh 动画控制（设置面板三态开关）

在 dsh 设置里新增「**动画控制**」一节，用一个三态开关**无视操作系统**地强制
打开 / 关闭 dsh 的动画，并按动画类别提供**每类覆盖开关**：

| 选项 | 行为 |
|---|---|
| 跟随系统 | 默认。动画开闭跟随操作系统「减少动态效果」，不干预 |
| 强制开启 | 无视系统减少动画，把 dsh 动画打开（含运行中鲸鱼） |
| 强制关闭 | 无视系统设置，把 dsh 动画彻底关掉 |

**每类覆盖开关**（仅「强制开启」时生效，默认**全部覆盖=开**）：

| 开关 | 覆盖的动画 |
|---|---|
| 🐋 运行中鲸鱼 | chat 运行状态那条鲸鱼 APNG |
| 🔄 任务转圈（StateDot） | 任务进行中的旋转圆环 |
| ✨ 思考扫光（TextShimmer） | 思考/深度思考文字上的左右扫光 |
| 🎬 JS 驱动动画（一组） | 平滑滚动 / 工作区运动行 / 引导页转场 / 附件分页 |

关掉某个开关后，「强制开启」会跳过该类动画的强制还原，让它退回系统「减少
动态效果」的行为。

开关只作用于 dsh 应用窗口，**不改系统设置、不影响其他程序**。

## 为什么会有「当前 dsh 没动画」

dsh 的动画开/关**没有内置开关**，完全由 CSS 媒体特性 `prefers-reduced-motion`
驱动，而它取自操作系统：

- 系统开启「动画效果」（Windows：设置 → 辅助功能 → 视觉效果 → 动画效果）时，
  Chromium 上报 `no-preference` → dsh 动画正常；
- 关闭该选项 → 上报 `reduce` → dsh 里 **几十处** `@media (prefers-reduced-motion:
  reduce)` 规则生效，把动画过渡设为 `animation:none`/`transition:none`，同时 JS
  侧调用 `window.matchMedia('(prefers-reduced-motion: reduce)').matches` 跳过
  平滑滚动、进场字幕、动效行等；运行中的鲸鱼 APNG 也只在 `no-preference` 下显示，
  否则退化为静态图标。

所以只要你系统关了「动画效果」，dsh 就会整体「没动画」，而设置里没有能拉回来的选项。

## 实现原理（可靠、不靠 CDP）

这个插件在 dsh 的**渲染进程**里干活（走的正是你其他插件
`window.__ModuleLoader__.load` + `settings.section` 的组合包套路）：

1. **覆写 `window.matchMedia`**：对所有 `prefers-reduced-motion` 查询说谎——
   强制开 → reduce 查询返回 `false`、no-preference 返回 `true`（**仅当 JS 驱动
   动画开关开着**，否则退回系统原生值）；强制关则一律答 `true`。
   dsh 的全部 JS 动画判据都经 `matchMedia(...).matches`，这一处就把
   **平滑滚动 / 进场字幕 / 动效行 / 引导动画**等 JS 驱动的动画双向修好了。
2. **注入页面样式**：强制关 → 一条 `* { animation/transition: none !important }`
   一刀切（最彻底）；强制开 → 按每类覆盖开关拼出对应的还原 CSS：
   - **鲸鱼**：用同一张 APNG 把动画遮罩强制还原（系统减少动画时默认只显示静态 SVG）；
   - **任务转圈 / 思考扫光**：两个纯 CSS keyframes 动画，用**可读子串
     `[class*=…]` + 自带的 `@keyframes dshmc-*`** 锚定和驱动（不引用 dsh 的哈希
     keyframe 名），扫光用 `[class*="decoration"]:has([data-shimmer-decoration])`
     结构锚定，避开 `sweep`/`highlight` 这类过泛的短类名误匹配。
3. **持久化**：Web 半边写 `localStorage`（键 `dsh-motion-control.state`，存
   `{ mode, overrides }`），并同步给 host 半边落盘到
   `~/.dsh/dsh-motion-control.json`（跨重启记忆，host 为权威、localStorage 兜底）。

## 能力边界（如实说明）

这套方案能完整、可靠地做到：

- ✅ **强制关**：JS + CSS 全部动画关掉，100% 彻底。
- ✅ **强制开（由覆盖开关决定还原哪些）**：三类 CSS 动画（鲸鱼 / 任务转圈 /
  思考扫光）各自独立开关；JS 驱动一组开关。
- ✅ **每类独立控制**：强制开启时按上方 4 个开关决定是否还原该类别，默认全开。

做不到（需要 CDP 才能通用、而插件沙箱里够不着，见下）：

- ⚠️ **JS 驱动动画无法逐项拆分**：平滑滚动 / 工作区运动行 / 引导页转场 /
  附件分页**共用同一个 `matchMedia('(prefers-reduced-motion: reduce)')`
  查询**（渲染端插件只能改写 `window.matchMedia` 这一个点，无法区分这次调用是
  谁发起的），所以它们只能作为「一组」整体开关。只有 EmptyHero 悬浮用的是另一个
  查询，但那个动画体量微小、影响可忽略。
- ❌ 系统减少动画时，少数**纯 CSS 渐变过渡**（如 hover 淡入淡出、进度条）无法被
  通用地反转为原值——理论上只有 Chrome DevTools 的
  `Emulation.setEmulatedMedia`（强制 `no-preference`）能一次性覆盖全部 CSS 媒体
  查询。**但 dsh 的插件沙箱拿不到它**：DSH core host 与桌面主进程是**两个进程**，
  渲染进程也没有 Electron preload 桥 / 远程调试端点，`webContents.debugger` 只在
  Electron 主进程（`apps/desktop/src/main.ts`）手里，而插件的 host 半边够不着。
  → 所以这个插件走「渲染端注入」这条唯一可靠的路，代价就是强制开对个别 CSS
  过渡是有边界的。

如果你想把那最后一点 CSS 过渡也一并强制打开，唯一会彻底的办法是改 Electron 主
进程（给桌面壳加一个 CDP/IPC 通道并在启动或设置切换时下发
`Emulation.setEmulatedMedia`），那需要给 DSH 打主进程补丁，本插件不做。

## 安装

和你的 `dsh-usage` / `dsh-session-manager` / `dsh-whale-title` 组合包一致：

1. 把本目录作为组合包装进桌面 profile 的 `node_modules`（例如用 pnpm/yarn 把
   `dsh-motion-control` 加进 profile 的依赖），并按 `cordis.patch.yml` 把它插进
   profile 插件树（host 半边插进去，client 半边即被自动发现装上）。
2. 重启 dsh。
3. 打开 **设置 → 动画控制**，选「强制开启」试试系统减少动画时恢复动画。

> 依赖脚本：`lib/client.js` 里内嵌的运行鲸鱼 APNG 来自
> `packages/client/ui-chat/src/client/chat/running-whale@2x.png`（base64 data URI）。
> 若 dsh 版本更换导致这个资源路径变化，重新生成即可：
> `printf 'data:image/png;base64,'$$(base64 -w0 <png路径>)` 替换 `lib/client.js`
> 中两处 `mask:url("data:image/png;base64,…")`。

## 文件

| 文件 | 角色 |
|---|---|
| `cordis.patch.yml` | 把 host 半边插进 profile 插件树（client 发现的前提） |
| `motion-control.mjs` | host 半边：持久化 `{ mode, overrides }` 到 `~/.dsh/dsh-motion-control.json` + `/api/motion.get|set` + 尽力而为的 CDP 加分尝试 |
| `lib/client.js` | Web 半边：`matchMedia` 覆写 + 样式注入 + 设置面板「动画控制」区块 |