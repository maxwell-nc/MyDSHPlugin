# dsh-usage — Token 用量统计

订阅 dsh 的 `session/event`，把模型返回的 usage 按「天 × 模型」记账，
并在 Web 界面的**左下角、设置按钮上方**给一个入口：点开是堆叠柱状图，
横轴固定最近 15 天（刻度只写「日」），一天一根柱子、每个模型一个颜色；
鼠标移到色块上提示模型 + 颜色 + **当日占比** + 用量。没有用量的那天留一条占位短横。
图例（模型排行）只显示**前 5 名**，第 6 名起合并成「其他」一行；**只有「其他」
一行**可悬浮 —— 弹窗显示**全部**模型的完整对比（含前 5 名，逐行分离）。

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
  }
}
```

`tokens = input + cacheRead + cacheWrite + output`，四个桶互不重叠
（reasoning 已含在 output 里）—— 和上游 `@deepseek-ai/dsh-token-meter` 的
`usageTokens()` 一致。

界面上的用量单位**自动进位**：不到 1 亿走「万」（除以 10000），到 1 亿走「亿」
（除以 1e8）。判定按四舍五入后的值来（阈值 `9999.5 万`），免得写出「10000.0 万」。
单位是**按单个数值各选各的**，不做全局面板统一 —— 一个模型 1.2 亿、另一个 3000 万时，
各显示各的读起来更顺；硬统一会冒出「0.30 亿」这种数字。

**展示、统计、留存是同一个 15 天窗口（`KEEP_DAYS`，插件里唯一的天数配置）。**
柱子、总量、模型排行都是「今天往前 15 天」，账本也只留这 15 天，更早的**每天清理一次**。
柱状图柱子不撑满。** 横轴永远是「今天往前 15 天」，日期由客户端自己按日
推出来（不是拿账本里「有记录的天」铺）—— 中间某天完全没用过模型时账本里根本没有那一天，
按天铺会错位、也看不出空档；现在那天只画一条浅色占位短横，日期照常标注。每根柱子最宽
20px 且居中排（`flex:1 1 0; max-width:20px`），面板宽度跟着收到 460px —— 宁可留白，
不为了填满把柱子拉粗。配色走**柔和浅色系**（天蓝 / 浅绿 / 杏黄 / 薰衣草 …，见
`PALETTE`）：一天一根挨着排，饱和深色堆一片会闷；相邻两位刻意错开色相，叠在一起分得开。

**横轴刻度只写「日」，不写月份。** 列宽只有 20px，10px 字号下「09-15」有 25px 宽，
会被 `overflow:hidden` 裁掉半截（这是实际踩过的）；只留 `date.slice(8)` 就装得下，
完整日期在 `title` 和 hover 气包里都有。

**气包里的占比是「当天占比」，图例那行是「近 15 天」占比。** 柱子本来就是「一天一根」，
看的是那天各模型怎么分的，分母只能是那天的合计；拿窗口总量当分母会把日内差异压成
零点几个百分点（实测同一天：当日 13.7% vs 窗口 1.88%）。所以图例是窗口排行口径、
气包是日内口径，两处刻意不一样。

**图例只显示前 5 名，其余合并进「其他」；只有「其他」可悬浮看全部。** 模型多了
以后一行一个会撑爆面板，所以图例行数固定为前 `TOP_N = 5`，第 6 名起合并成一行
「其他」（用量相加、色用中性灰 `#9aa3b5`）。**只有「其他」这一行**是悬浮触发点
（样式上带虚线下划线提示）—— 移上去弹和柱状图同一个悬浮窗（`UsageTip` 复用），
显示**全部**模型的完整对比：前 5 名和「其他」背后的每个模型都逐行列出，占比与
图例同口径（窗口总量做分母）。前 5 名本身不弹窗，数字在行内即可读。

## 几个刻意的设计（都是坑，别随手改）

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
