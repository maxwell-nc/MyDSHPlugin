# dsh-usage — Token 用量统计

订阅 dsh 的 `session/event`，把模型返回的 usage 按「天 × 模型」记账，
并在 Web 界面的**左下角、设置按钮上方**给一个入口：点开是**折线图**（一个模型一条线、
一天一个点），横轴默认**当月**（本月 1 号到今天，跨天自动更新；可自定义日期范围，
最多 60 天、最少 2 天；可选隐藏模型名的 `/`、`\` 前缀并合并同名用量）；
鼠标移到某天上提示模型 + 颜色 + **当日占比** + 用量。**每条线都铺满整条横轴、一天一个点**，
但**没有用量的部分统一是灰色**：没用量的点一律按 0 画成灰线灰点，只有真用过的段才用模型
自己的颜色 —— 底部因此永远只有**一条灰线和一排灰点**，不会因为「最后画的那个模型」把基线
染成它的颜色（早期那条「底部橙色线」就是这么来的），也不会像删掉 0 值段那样把线画断。
图例（模型排行）只显示**前 5 名**，第 6 名起合并成「其他」一行；折线图不受影响，**模型全画**。
「其他」行的最右列是**文字**形式的**展开/收起**（不是箭头），展开后在「其他」下面列出被折叠
的模型（**带各自色块**、名字更淡 + 用量，不给占比）；也可**点击模型名字筛选**
（只画选中的模型、其余变灰，支持多选，点折叠行同样能把它单独画出来 —— 单独筛一个小用量
模型时，它的曲线会按自己的量程铺满画布；「重置筛选」恢复全部）。

除了 `session/event`（agent loop 的结算事件），还监听宿主事件 **`dsh-usage/report`**，
收下配套插件上报的**辅助 LLM 请求**用量——主要是 dsh-image-reader 的视觉桥接
（直接 `ctx.llm.stream()`、不经 agent loop，会话里没有结算事件）。这是两条独立的
采集来源，都落到「当天 × 模型」同一笔账上（见 recordExternal()），缺哪个都不影响另一个。

这个目录是一个 **dsh profile bundle（组合包）**，包名 `dsh-usage`，宿主侧条目 id
也是 `dsh-usage`。0.2.0-rc.2 起组合包由 pnpm 装进 profile 的 `node_modules`，
身份写在 `package.json` 的 `dsh.bundle.patch` 上 —— 没有单独的元数据文件。

```
usage/
├── package.json        # 组合包身份：dsh.bundle.patch + dsh.client + engines + files
├── cordis.patch.yml    # 本组合包自己的 patch 层（只插 host 半边）
├── locale/zh.json      # 组合包列表里的中文标题 / 简介
├── locale/en.json      # 同上，英文
├── usage.mjs           # host 半边：采集 + 读取接口
└── lib/client.js       # 浏览器半边：入口 + 面板 + 柱状图
```

**账本不在上面这个目录里。** 它放在**应用数据根**下：

```
%LOCALAPPDATA%\DeepSeekHarness\data\usage.json
```

和宿主自己的 `config.json` / `plugins.json` 同一处。放这儿是因为组合包是由 pnpm 装进
profile `node_modules` 的**安装目录**：账本放包里面，一是装/升级组合包时安装目录被整体
重算、账本跟着没了，二是源码树那份和装出来那份天然变成两个副本、谁是最新的说不清。
挪出来以后全局只有一份，组合包怎么装怎么升级都碰不到它。

（本目录下如果还留着 `data/`，那是 1.0.x 时代写在插件目录里的旧账本残留，
已经搬到上面那个路径，**别再往里写**。）

## 装法

在 profile 目录下用**绝对路径**安装：

```bash
plugin_manager install_bundle D:\Project\dsplugin\usage
# 或者直接用包管理器：
pnpm add D:\Project\dsplugin\usage
```

装完组合包**默认启用**：安装器会把 `dsh-usage` 加进该 profile `package.json` 的
`dsh.profile.bundles`，并把本包声明的 patch 层应用上去：

```yaml
- insert:
    - id: dsh-usage
      name: dsh-usage
```

- **启用 / 停用**：在组合包列表（profile `package.json` 的 `dsh.profile.bundles`）里
  选中 / 取消 `dsh-usage`；数组顺序就是各组合包 patch 层的应用顺序。取消选中后本包的
  patch 层不再应用（包本身仍留在 `node_modules` 里）。
- **条目级开关**：`cordis.patch.yml` 里的 `disabled`（本包没有设）—— 改的是插件树里的
  条目，不是整个组合包。
- **展示元数据**：组合包列表里的标题和简介来自 `locale/zh.json` / `locale/en.json` 的
  `meta.title` / `meta.description`；缺失的 locale 回退到 `package.json` 的
  `name` / `description`。本包没有图标资源，所以不设 `icon`。
- **版本要求**：`engines.dsh` = `>=0.2.0-rc.2 <0.3.0`。

## 账本长什么样

`%LOCALAPPDATA%\DeepSeekHarness\data\usage.json`：

```json
{
  "version": 1,
  "updatedAt": "2026-09-19T02:20:06.312Z",
  "days": {
    "2026-09-19": {
      "models": {
        "deepseek-chat": { "tokens": 2220, "input": 1900, "output": 320,
                           "cacheRead": 0, "cacheWrite": 0, "calls": 3 }
      }
    }
  },
  "sources": [
    { "time": "2026-09-19T02:20:06.312Z", "source": "解析图片",
      "title": "", "sessionId": "",
      "model": "glm-5.3-vision", "tokens": 140 },
    { "time": "2026-09-19T02:19:01.000Z", "source": "对话",
      "title": "帮我修个 bug", "sessionId": "conv-1",
      "model": "deepseek-chat", "tokens": 2220 }
  ]
}
```

`sources` 是最近 `MAX_SOURCES`（默认 5000）笔**消耗来源明细**，新到旧；每笔带时间
（ISO）、来源（对话 / 子代理 / 解析图片…）、模型与总 token（`tokens`，口径同上），
以及**会话 id（`sessionId`，客户端按它把同一会话合并成一行）和标题（`title`，从
`session/title` 事件取，没有就空串）**；外来上报没有会话上下文，这两项为空串。
它与 `days` 的留存互不影响：`days` 按天收敛且只留 KEEP_DAYS 天，
`sources` 按笔收敛且只留最近 `MAX_SOURCES`（默认 5000）笔。**清理只在启动时做一次**
（createCollector 里的 trimSources），运行期间往明细头插不再每次裁剪/重排，避免高频
调用下的不断清理开销；长进程里可能略超上限，等下次重启统一裁回（单条约 120~210 B，
5000 条约 1 MB 上下）。删掉这两者之间没有任何关联，见 `recordSource()`。
旧版账本（1.0.x / 1.1.x）没有 `sources` 字段时不报错，
读取时自动给空数组，界面列表从「还没有来源记录」开始积累。

`tokens = input + cacheRead + cacheWrite + output`，四个桶互不重叠
（reasoning 已含在 output 里）—— 和上游 `@deepseek-ai/dsh-token-meter` 的
`usageTokens()` 一致。

界面上的用量单位**自动进位**：不到 1 亿走「万」（除以 10000），到 1 亿走「亿」
（除以 1e8）。判定按四舍五入后的值来（阈值 `9999.5 万`），免得写出「10000.0 万」。
单位是**按单个数值各选各的**，不做全局面板统一 —— 一个模型 1.2 亿、另一个 3000 万时，
各显示各的读起来更顺；硬统一会冒出「0.30 亿」这种数字。

**展示、统计、留存共用一个窗口上限（`KEEP_DAYS = 60`）。**
总量、模型排行都是「所选区间」内的，账本只留最近 60 天、更早的**每天清理一次**。
横轴默认**当月**（本月 1 号到今天），可起止日期自定义（最多 60 天、最少 2 天）；
默认区间每次渲染都从「今天」现算，所以第二天自动滚到新日期，只有手动选过才固定。
折线图按日铺轴（不是拿账本里「有记录的天」铺），**每条线都铺满整条横轴**（一天一个点、
天与天之间都连线），但**没有用量的部分统一是灰色**：没用量的点按 0 画（灰色），只有真用过
的段才用模型自己的颜色（从底边升上去、降下来的斜边算彩色）。底部那条灰线是**贯穿整条
横轴的一条**（`grayLine`，所有模型共用），灰点按天去重 —— 所以底部永远只有一条灰线和一排
灰点，既不是「按模型各画一条、最后画的那个把基线染成自己的颜色」（早期那条「底部橙色线」），
也不是「干脆把 0 值段删掉、把线画断」。灰线特意整条轴都画：筛选成单个模型后，它有用量的
那几天前后就没有「贴底段」了，只画贴底段的话中间会断成「深灰—极浅灰（坐标轴）—深灰」，
看着就像「筛选后灰线没了」。**刻意不设「用量小到一定程度也算灰色」的阈值**：那种阈值会把
小用量模型真实的数据点悄悄染灰，等于图上把它删了（图例有色块、图上却没线）。
配色走**柔和浅色系**（天蓝 / 浅绿 / 杏黄 / 薰衣草 …，见 `PALETTE`）：
一条线一个色，相邻两位刻意错开色相，叠在一起分得开。

**可选「隐藏模型前缀」开关：把模型名的 `/`、`\` 前缀剥掉再展示，并按忽略大小写合并
同名用量。** 例：`opencode/glm-5.3` 显示为 `glm-5.3`；`opencode/glm-5.3` 与
`GLM-5.3`（不同 provider 出口、大小写不同）归并到同一行、用量相加。这是**纯展示层**的
归一化（`stripModelPrefix` + `buildView`，只影响页面聚合，不落账），开关存
`localStorage`（`dsh-usage:hidePrefix`），关掉即恢复成按原始模型名精确分组。图表、图例、
气包、明细列表的模型列统一走这一口径；归并后的 id 用折叠键、label 用展示名，图和例
对齐，不会丢模型。

**横轴刻度只写「日」，不写月份。** 完整日期在 `title` 和 hover 气包里都有。

**气包里的占比是「当天占比」，图例那行是「所选区间」占比。** 折线是「一天一个点」，
看的是那天各模型怎么分的，分母只能是那天的合计；拿区间总量当分母会把日内差异压成
零点几个百分点（实测同一天：当日 13.7% vs 窗口 1.88%）。所以图例是区间排行口径、
气包是日内口径，两处刻意不一样。

**图例只显示前 5 名，其余合并进「其他」；展开/收起是文字，展开后是纯文本行。**
模型多了以后一行一个会撑爆面板，所以图例行数默认固定为前 `TOP_N = 5`，第 6 名起合并成
一行「其他」（用量相加，不给色块 —— 它是折叠分组，不是一条画出来的线）。「其他」这一行
的**最右列**（模型行放占比的那一列）是**文字**形式的「展开」/「收起」：**点这一行**切换，
展开后把背后被折叠的每个模型在「其他」**下面**列出来 —— **带自己的色块**（它们同样画在
图上，没有色块就认不出哪条线是哪个模型），名字颜色更淡（`dshu-foldName`）、**不给占比**，
一眼能看出这些是被折叠的明细而不是排行里的前几名；色块、名字都和上面排行行**同一条竖线**；
**有折叠模型时才有这一行**，前 5 名都排满时没有「其他」也就不会出现。名字列左内边距统一
`padding: 0 8px`：色块和名字之间留出间隔，「其他」/折叠行的名字也和上面排行行的名字
**同一条竖线对齐**。悬浮「其他」弹和折线图同一个悬浮窗（`UsageTip` 复用），显示**全部**
模型的完整对比。

**折线图不受图例折叠影响：默认模型全画**（含折叠进「其他」的小用量模型）。它们的线大部分
就是那条统一灰的底线，不抢眼；想看某个折叠模型的完整曲线，展开「其他」点一下它的名字
（= 筛选，见下）。**图上的气包跟着筛选走**：筛选后只列选中的模型，抬头「合计」也是这几个
之和（不是当天总量）——不然会出现「合计比下面几行加起来还大」的对不上账。

**点击任意模型名字可筛选：只显示选中的模型，未选中的名字变灰，折线图（和它的气包）也只算
选中的线。**
点一下选中（支持多选），再点取消；有任意选中时就出现一条「已筛选 N 个模型」提示 + 「重置
筛选」按钮，点它回到全部显示（没有任何选中 = 全部显示）。被折叠的文本行同样可以点选，
所以折叠起来的小模型也能单独画出来对比（单独选中后它就是画布上限，贴底阈值按它自己的量程
算，曲线恢复自己的颜色、铺满画布）。

**折线图下方的「最近消耗来源」明细列表，独立翻页。** 显示最近 `MAX_SOURCES = 5000`
笔 token 消耗来源，由宿主按「新到旧」排好放在 `payload.sources` 里；客户端固定一块
高度（264px），**每页按高度决定行数**（行高 44px，向下取整 = 一行 6 条），超出一页
出现「上一页 / 下一页 + 页码」，不撑爆面板。每行列：**类型 / 标题(如果有) / 模型 /
时间 / 消耗**（合并行在标题后标「×N 次」），用量「亿」保留 2 位小数、「万」显示整数
（`formatAmount`）。

**来源标签由采集侧给出**：普通会话结算 =「对话」；`origin:'subagent'` =「子代理」；
**分支（fork）单独算「分支」** —— dsh 的 SessionHeader 只标 `origin?: 'subagent'`，
没有给分支做独立标记（fork 和子代理都带 `parentSession`，区分靠 `origin`：有
`parentSession`/`delegationDepth` 但 `origin` 不是 subagent 的就是复刻分支）；
`dsh-usage/report` 外来上报 = 上报方自带的 `source`（dsh-image-reader 标
「解析图片」），没带就兜底成「解析图片」。

**同一个对话会合并成一行。** 明细里每笔都带 `sessionId`（会话 id）和 `title`（从
`session/title` 事件捕获的会话标题，没到标题事件就留空）；客户端按 `sessionId`
把同一会话的多笔并成一行：标题取非空者、模型列出用到的所有、时间取最近一次、
消耗相加，标题后标「×N 次」。没有 `sessionId` 的外来上报（解析图片）各自成行，不并入
任何对话。合并是**展示层**做的，账本仍按笔留存。

明细是**按笔**留的独立列表（`state.sources`，与按天的聚合账 `days` 解耦），
跟 KEEP_DAYS 无关。

## 几个刻意的设计（都是坑，别随手改）

**辅助 LLM 请求（不经 agent loop）走 `dsh-usage/report` 事件上报。** 视觉桥接
（dsh-image-reader 直接 `ctx.llm.stream()`）这类请求在会话里**没有**结算事件，常规
读日志统计不到。配套插件在拿到 usage 后通过宿主事件 `dsh-usage/report` 上报，usage
插件的 recordExternal() 把它归到「当天 × 上报的模型」名下。上报是尽力而为：没有 usage
就不报，宿主没装 usage 插件时 `ctx.emit` 也没有副作用（无监听者即丢弃）。这份来源与
`session/event` 是两条独立的线，各自去重 —— recordExternal 每次调用都是独立的一笔
（现有调用方每次视觉请求只报一次），不再做 (turn, step) 覆盖；它不读会话，自然也不受
会话水位表影响。

**按 (turn, step) 做「覆盖」而不是「累加」。** 同一步里 `assistant/message` 可能带
同一份 usage 反复结算（重试、流式收敛），直接累加会成倍虚高。做法是记住 last 样本、
新增量 = 新值 − 旧值（上游 `tokenUsageProjection` 同款）；`llm/retry-started` 时清空
last，因为重试是**新**的一次调用，要重新计。

**模型名只来自 `request/header` 的 `header.config.model`。** 所以每个会话要维护
「当前模型」；会话第一次被看到时把它已有的日志回放一遍补模型名（**只读 header、
不计 usage**），否则第一轮会掉进「未知模型」。

**第一次看到某会话时从 `session.seq` 起算，绝不回填历史。** 只统计「插件在场时
新发生的调用」，这样重启进程、插件热重载、会话 fork 都不会重复计数。回填历史必须
自存每会话水位表，水位一丢就双计，代价大于收益。

**`connection` 用 `ctx.inject` 按需绑定，不写进静态 `inject`。** 静态 inject 是
「全部就绪才激活」，而 `connection` 只有 web profile 提供。写进去的话插件在
headless / tui profile 里会**永远停在 pending**，连采集都不跑；而采集本来只依赖
`session/event`（dsh-base 自带 `dsh-session`），不该被传输层连坐。

**浏览器半边不用写进补丁。** `package.json` 里的 `dsh.client.platform = "web"`
就够了 —— dsh 的 `client-modules` 会自动发现 `lib/client.js` 并拼进启动图。

**入口挂在 `sidebar.footer.action`。** 这个 slot 在 DOM 里排在 `sidebar.settings`
**之前**，而侧边栏底栏是 flex-column，所以天然就在设置按钮上方；展开时是整行，
收起成轨道时只剩图标（`wide` 由 shell 传进来）。面板用 `createPortal` + `position: fixed`
挂到 body，因为侧边栏有 overflow 和 transform 动画，留在原位会被裁掉。**面板背景必须配 `backdrop-filter`（dsh 0.1.7 起）。** `--dsw-specific-menu` 从
不透明色变成了半透明色，只留 background 会变成「透明白」（看见底下的对话）。
见根 README「浮层样式」一节。**柱状图的气泡（`.dshu-tip`）也挂在 body**：它是
`position: fixed` 且坐标来自 `getBoundingClientRect()`（视口系），而带
`backdrop-filter` 的面板会成为 fixed 后代的**包含块** —— 留在面板里会被面板的
padding 原点偏移、还会被 `overflow:auto` 裁掉。

**读取接口不需要注入 webServer。** `ctx.connection.fetch.register` 会把路由登记到
connection 自己挂在 `/api` 前缀上的共享 Fetch 处理器里，Host/Origin 围栏和浏览器
cookie 鉴权都由它处理，所以浏览器里直接同源 `fetch('/api/usage.data')` 就行
（实测：带 cookie 200，不带 401）。

**界面每次读都先回读账本文件。** 内存里的账本只在进程启动时读过一次文件，而同一个
`data/usage.json` 可能被别的进程写（同时开着别的 profile、进程被强杀后重启、插件热重载、
或者你手改过）—— 所以 `payload()` 每次都先 `reload()`，「刷新」和 5 秒轮询才真是刷新。
判定「被别人动过」看 mtime（我们每次读/写都记下当时的 mtime），比比 `updatedAt` 可靠。
两个例外不覆盖内存：**有未落盘的增量**（`dirty`）时跳过，**文件不在/读坏**时也不动
（那会儿 `readState` 给的是空账本，不能拿它抹掉内存里的账）。

**任何异常都吞掉。** 插件崩了不能连带 dsh 起不来，所有入口都是 try/catch。

## 环境变量

| 变量 | 作用 |
|---|---|
| `DSH_UI_DATA_DIR=<目录>` | 应用数据根（宿主启动 dsh 时注入，账本落在它的 `data/` 下） |
| `DSH_USAGE_DATA=<路径>` | 直接指定账本文件，优先级最高（自测指到临时目录用） |
| `DSH_USAGE_QUIET=1` | 不打启动横幅 |

没经过宿主、手工跑 `dsh web` 时 `DSH_UI_DATA_DIR` 是空的，插件按同样的约定自己算
（`%LOCALAPPDATA%\DeepSeekHarness`）—— 不能因为启动方式不同就让账本落到两个地方。

## 自测

host 半边可以喂个假 ctx 直接驱动，**不用起 dsh、不花 token**：收下
`connection.fetch.register` 给的路由和 `session/event` 的监听器，喂合成事件，
再通过路由取一次 payload —— 采集口径、去重、回读同步都能这么验。

外来上报（`dsh-usage/report` → recordExternal）有独立的假 ctx 自测：

```bash
node usage/test-record-external.mjs   # 收下上报监听器，喂视觉 usage，读账本断言
```

**真实事件形状**用 headless profile 跑一轮真对话验证（最省事，一条命令跑完即退）：

```bash
# 把 dsh-usage 装进 headless profile（install_bundle 或 pnpm add 本目录），然后：
node <dsh>/lib/bin.js --profile headless "只回答两个字：收到。不要调用任何工具。"
# 看 %LOCALAPPDATA%\DeepSeekHarness\data\usage.json 是否出现 tokens / 模型名 / 当天日期
```

**别让自测污染真账本**：headless 跑真对话时把 `DSH_USAGE_DATA` 指到临时文件，
否则测试用量会记进你日常那份账本里。

Web 那一侧的接点（横幅、启动图里的 `dsh-usage` 行、bundle 可取、`/api/usage.data`
的 200/401）用 `src/tools/probe_plugins.py` 配合一个临时探针核对。
