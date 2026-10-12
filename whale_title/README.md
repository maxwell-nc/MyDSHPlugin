# dsh-whale-title —— 任务运行时窗口标题鲸鱼动画

复刻 `DeepseekHarnessDesktopLite` 时代的「任务栏鲸鱼」：**只要有一个 Agent 在跑**，
窗口标题（= 任务栏按钮文字）就变成一条在一层层推开的浪里往返的鲸鱼；空闲后恢复
dsh 官方标题（`dsh-client-ui-layout` 维护的「会话标题 — DeepSeek」）。

```
~~🐋~~~~~~~~~   运行中的窗口标题每一帧（180ms 一帧）：
~-~~🐋~~-~~~~     · 鲸鱼按三角波匀速左右往返；
~~~-~~🐋~~-~~     · 三层浪（内 ≈、中 ~、外 -）从鲸鱼两侧泛起又收回，
~~~~--~≈🐋≈~-       相位错开 2 帧，一层推一层。
```

与旧版逐帧等价：`test/frame-parity.mjs` 把本插件 JS 实现和旧 `dsh_shell.py` 的
`TaskbarJobWatcher._frame` 对比，64/64 帧逐字符一致。

## 组成

| 文件 | 角色 |
|---|---|
| `whale-title.mjs` | host 半边：Agent 状态采样 + `/api` 路由（SSE 帧流 / 状态快照） |
| `lib/client.js` | Web 客户端半边：鲸鱼绘制 + `document.title` 守卫 + 帧源接线 |
| `cordis.patch.yml` | 把 host 半边插进 profile 插件树的 patch 片段 |
| `test/` | 回归脚本（不参与安装，`files` 未包含） |

## 实现机制

### 标题：为什么浏览器半边能改窗口标题

桌面 App 的窗口标题跟随 `document.title`（Electron 默认行为；官方
`dsh-client-ui-layout` 自己也是这么设置标题的，本插件不抢这个位置，只在运行期
临时接管）。为不跟官方逻辑打架，浏览器半边把 `document` 实例上的 `title`
影子化为守卫访问器：

- 官方每次 `document.title = …` 都被记为 **intended**（官方当前想显示的字）；
- 空闲时**直接放行**，官方行为一个字节不受影响；
- 运行中吞掉官方写入（画布由帧事件写），任务结束再把**最新** intended 用原生
  setter 复写回去 —— 即使任务中途切换了会话 / 换了语言，恢复的也是官方**当前
  应显示**的字，不会滚回旧值。

### 状态：宿主半边怎么知道「有任务在跑」

`Agent.status`（`'idle' | 'running'`）就是 `api-session/status` 事件的上游
真源（`dsh-api-session-controller` 由 `agent/status` 转发）。host 半边每帧现场
读 `ctx.agents.list()`，不缓存、不靠事件补集 —— 插件中途装上（含 HMR 重载）后，
已经在跑的任务也立即可见。子代理 / 工作流代理也在这个清单里，和旧版
「任一 running 就播动画」的语义一致。

### 帧流：为什么用 SSE 推、而不是页面 setInterval 自己画

官方桌面 App 没有动 Electron 的 `backgroundThrottling`（默认 `true`），窗口
最小化约 5 分钟后 Chromium 会把 DOM 定时器链压到 1 次/分钟 —— 页面本地计时
会把鲸鱼**冻住**。旧版动画是另一个进程画的所以没这个问题；官方版里的等价物是
**服务端推帧**：SSE 事件由网络到达驱动、不受该节流约束，而且「持有活动连接的
页面」本身就是 Chromium 定时器节流的豁免类。

host 半边只在有流的连接时跑一条 180ms 共享泵：

- `st {"r":0|1}` —— 状态翻转（连接建立时立刻发一次当前值）；
- `fr {"k":帧号}` —— 运行期每 180ms 一发，每 32 帧（≈5.8s）鲸鱼游一个完整来回；
- `hb {}` —— 空闲期心跳（≈3.6s 一次）。

帧号只在运行期递增（同旧版「停走不停帧」）。所有窗口共享同一帧序列。

浏览器半边另有**本地降级**（看门狗发现 SSE 断到连不上时启用）：轮询状态快照 +
本地 180ms 计时 —— 能画总比不画强，只是后台标签页可能被节流拖慢；SSE 恢复后
自动切回。系统开了 `prefers-reduced-motion` 也照常播放动画：任务栏鲸鱼是
「任务在跑」的功能性状态指示，旧版从来不做这个降级，复刻以旧版为准。

## 安装

在 dsh 里用插件管理器安装本目录（等价于 profile 里 `link:` 依赖 +
`dsh.profile.bundles` 追加 `dsh-whale-title`）：

```
插件管理器 → 安装 → D:\Project\dsplugin\whale_title
```

或进程内（`plugin_manager` 工具 / `dsh-plugin-manager` 远端）：

```
install("D:/Project/dsplugin/whale_title")
```

安装后需重启宿主生效（`requiresRestart` 类变更）。

## 验证

- 空闲时：`curl -s http://127.0.0.1:$(端口)/api/whale-title.status` 应返回
  `{"v":1,"ok":true,"running":false,...,"frameMs":180}`（需带浏览器 cookie 鉴权，
  或直接在宿主机上的 dsh 控制台里用 Web 设置页的网络面板看）；
- 任一会话发一条消息：窗口标题立即变成鲸鱼动画，任务栏同步；
- 空闲后标题恢复为官方「会话标题 — DeepSeek」；
- DevTools 控制台执行 `EventSource` 状态观察：
  `new EventSource('/api/whale-title.stream').addEventListener('fr', e => console.log(JSON.parse(e.data).k))`。

## 自检脚本（源码树内）

```
node test/frame-parity.mjs     # JS vs 旧版 Python 帧算法比对（64 帧逐字符）
node test/stream-check.mjs      # host 半边：路由注册 / 快照 / SSE 序列 / 断开清理
```

## 卸载 / 卸载后的痕迹

- 浏览器半边卸载（HMR 或禁用插件）时自动恢复标题并删除 `document.title` 守卫，
  页面不留任何痕迹；
- host 半边注册的路由随插件 scope 一起被 `connection` 撤销，SSE 连接会被客
  户端 EventSource 自动重连到新 half（无感热重载）。

## 已知边界

- 直连远端（局域网 `dsh-lan-access`）时若代理掐掉长连接，客户端会走本地降级，
  有 SO 2~3 秒的状态空窗，不丢动画；
- `document.title` 净读写不受影响，但同为「另一个插件也想改标题」的扩展与本
  插件的接管期写入会互相覆盖（官方版没有其它改标题的插件）。
