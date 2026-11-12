# 思考强度开关（thinking_strength）

dsh 组合包（bundle）：宿主半边（`thinking-strength.mjs`）+ Web 客户端半边（`lib/client.js`）。
条目 id 和包名都是 `dsh-thinking-strength`。

三件事：

1. **自绘模型选择座** —— 替换输入框里内置的模型选择按钮，左侧是「选模型」按钮，
   只显示斜杠后的短名（`opencode/glm-5.3 → glm-5.3`），单击打开**复用**共享目录数据的模型列表（直达选择）。
2. **5 档思考强度滑块** —— 模型按钮右侧的滑块是唯一的思考控件：**有多少档就有多强**，
   按「默认 / 低 / 中 / 高 / 最大」切换。**选任意非「默认」档 = 开启思考**（自动为模型声明
   `reasoningEfforts` 并以该强度发出）；**选「默认」档 = 关闭思考**（撤掉声明 + 清该模型档位记忆，
   请求不带任何思考参数、交回上游默认）。没有单独的开关按钮。
3. **按模型记住思考强度** —— 切换模型再切回来，自动带回你上次选的档位，
   不再被重置成该模型的默认档。

## 一、自绘模型选择座 + 5 档滑块

它在 `conversation.input.model` seat 上以 `priority: -1` 盖掉内置按钮，渲染成两个相邻控件：

| 控件 | 行为 |
| --- | --- |
| 左侧「选模型」按钮 | 只显示斜杠后短名；名字末尾的**徽章**单独画成小药丸（同色）；单击打开模型列表（分组、蓝色供应商标题、白底阴影，按原始名称 a–z 排序、带当前选中标记），点某行**直达选择**（切走即生效） |
| 右侧 5 档滑块 | 自绘椭圆轨道，每档一个圆球、选中球为蓝色 #4176E6；默认 / 低 / 中 / 高 / 最大（wire 依次为 `undefined` / `low` / `medium` / `high` / `max`） |

- **徽章（只改呈现，不改模型 id）**：模型名末尾的套餐 / 渠道 / 构建标记从名字里切出来单独画成
  **浅蓝底的小药丸**（`#e8f1fe` 底、`#cfe2fb` 边、`#2f6fd0` 字，12px），按钮与列表同一套规则，
  所有徽章不管内容是什么都用同一个颜色。规则以共享 `dsh-model-name` 的 `splitBadge`
  为准（末尾连续的 `TokenPlan` / `Free` / `Trial` / `Beta` / `Preview` / `Demo` / `DL` 词典词，
  以及 `0731` / `1017` / `0817` 这样的 4 位构建号，都算徽章段；整名都是标记时不切）：

  | 模型 id（短名） | 画出来 |
  | --- | --- |
  | `DeepSeek-V4-Flash-0731-TokenPlan` | `DeepSeek-V4-Flash` + 徽章 `0731-TokenPlan` |
  | `Qwen3.8-27B-TokenPlan` | `Qwen3.8-27B` + 徽章 `TokenPlan` |
  | `GLM-5.3-Flash-Free` | `GLM-5.3-Flash` + 徽章 `Free` |
  | `GLM-5.3` | `GLM-5.3`（无徽章） |

  点击、收藏、`select()` 提交的仍然是**原始 model id**，一个字都不动；没装 `dsh-model-name`
  时用文件内等价的本地兜底实现（只损失词典里那几个规范大小写）。

- 模型列表直接**复用** `modelDirectories` 服务：它与内置 `/model` 弹窗、`conversation.input.model`
  共用**同一份**目录数据与同一个 `selectModel` 提交，所以本插件里切模型，别处立刻同步。

**滑块 = 思考开关 + 强度合一（没有单独的「思考」勾选框）：**

- 「默认」档（唯一不算「打开」的档）＝ 关闭思考：调 `/set enabled=false`
  **删掉当前模型的 `reasoningEfforts` 声明**、清掉该模型的档位记忆，然后不发显式档位
  （wire 省略 → 请求不带任何思考参数 → 交回上游/模型自身默认）。选它会让本页的 `/ensure`
  缓存立即失效，所以再点非默认档会重新补声明。
- 选非默认档（低/中/高/最大）＝ 开启思考：先调 `/ensure` 把当前模型在 llm-pi-ai 配置里的
  `reasoningEfforts` **补全成完整 5 档** `{ off: null, low: low, medium: medium, high: high, max: max }`
  （medium 是 pi-ai 的 `THINKING_LEVELS` 标准档，缺了它「中」会发不出去），再以该档强度设档。

### 为什么改的是「配置文件」而不是「请求参数」

DSH 的 llm 校验层（`resolveCallWithInfo`）只接受**模型目录声明过的** reasoningEffort 档位；
模型没声明时，任何显式 `reasoningEffort` 都会直接抛 `UNSUPPORTED_REASONING_EFFORT`。
`reasoningEfforts` 正是 llm-pi-ai 给手写 provider 模型声明能力的字段：

- 物化成 `reasoning: true` + `thinkingLevelMap`；
- 每次请求按档位把 `reasoning_effort: <wire>` 发给上游（openai-completions 默认路径）。

写入不自己解析 YAML，而是走**宿主自己的 `ctx.configEditor` 服务**（`config-editor` 插件）：

- 由它加锁、重新读盘、按 llm-pi-ai 自己的 Config 校验、写 profile 补丁层、调和 Loader 热重载；
- 只重写 llm-pi-ai 那一行（该行会被重新序列化，行内注释会给格式化掉），文件里其余行与注释原样保留；
- 所以**只装桌面版、没装 CLI 也能用** —— 插件不需要 `yaml` 库（profile 的 `node_modules` 里只有
  profile 安装的 bundle，其中 `yaml` 软链还可能指向已经删掉的 CLI 安装）。

## 二、按模型记住思考强度

### 为什么需要它

DSH 核心没有「每模型记住档位」的概念：

- 客户端点模型行时**不带** effort（`ModelSelect` 的 `choose({provider, model})`）；
- host 的 `session.selectModel` 走 `resolveCallConfig`，把缺省的 effort 解析成
  **该模型的默认档**（llm 的 `requested ?? reasoning.defaultEffort`）；
- `agentDefaultModel` 只有一个全局槽位，没有 `provider/model → effort` 的表。

所以「切到 B 再切回 A」时，A 的档位被解析成了 A 的默认档，你上次选的档丢了。

### 怎么做的

宿主半边补一张「`provider/model` → effort」记忆表，用**事件回放**补齐：

| 事件（`session/event` 里的 `model/selection`） | 含义 | 动作 |
| --- | --- | --- |
| 路由**变了** | 用户切换模型（effort 被重置成默认档） | 查记忆，用 `ctx.sessionController.selectModel` 把记忆档补回去 |
| 路由没变、带了档位 | 用户在滑块 / 面板里主动改档 | 写进记忆 |
| 路由没变、**没带**档位 | 用户在同一模型上选「默认」档 | **删掉**该模型的记忆（否则切回时旧档位会盖回来） |

首见（前序路由判不出来）**不动记忆**：那种情况分不清「用户选了模型」还是「用户选了默认档」。

为什么按「路由变没变」而不是「effort 变没变」判定：用户主动改档和切换模型重置档位，
在事件里长得一样（都是一条新的 `model/selection`），只有路由能区分。判定前序路由依次取：

1. 日志里上一条 `model/selection`（恢复会话的场景）；
2. 会话最近一次请求头（从没显式选过模型、但发过消息）；
3. 宿主的默认模型（全新会话）。

取不到就按「首见」处理，只记录不回放。

回放是**幂等**的：回放事件路由不变、effort 等于记忆值，只会再写一次同样的记忆，不会自激；
回放不改 provider/model，所以也不会触发核心的「`[model changed]`」提示。

### 记忆存哪

`<profile>/dsh-thinking-strength.efforts.json`，与 `cordis.patch.yml` 同级：

```json
{
  "version": 1,
  "providers": {
    "merge": {
      "ctai_my/deepseek-v4.1-flash": "max"
    }
  }
}
```

清空记忆：**先删文件、再重启 dsh**。记忆表在进程内只从磁盘读一次（载入后以内存为准，
每次改动整表写回），所以运行中删掉文件**不算数**——下一次改档会把内存里那份（含你删掉的条目）
重新写回磁盘。要立刻生效又不重启的话：先删文件，再退出 dsh 重开即可；只删文件不重启，
旧的档位仍会继续被回放。

滑块选「默认」档（`/set enabled=false`）会顺手清掉该模型的记忆，并让本页的 `/ensure` 缓存失效
（否则再点非默认档会跳过「补全声明」这一步，被宿主拒掉）。

不用 `localStorage`：Desktop 用 `--port 0` 启动，每次重启端口变了 origin 也就变了，浏览器存储留不住。

### 边界与已知行为

- **会多一条会话事件**：每次回放都会追加一条 `model/selection`（路由不变、只换档位）。
  它不产生 `[model changed]` 提示，但确实在会话日志里多一条记录。
- **档位失效自动丢弃**：模型后来不再声明该档（比如声明被删）时，回放会拿到
  `does not support reasoning effort`，此时删除该条记忆而不是反复重试。
- **竞态保护**：回放前重读当前路由，若用户已经切走就放弃，避免迟到的回放把新模型盖回去。
- **子会话跳过**：`session.header.origin === 'subagent'` 的会话不参与记忆与回放。
- **失败不致命**：记忆表读写、回放失败都只记日志；记忆表损坏按空表处理，插件不会因此起不来。

## 怎么工作

**宿主半边**（`thinking-strength.mjs`）：

- 定位 profile：优先 `DSH_PROFILE_DIR` → `DSH_HOME` + `DSH_PROFILE` → 兜底扫描
  `$DSH_HOME/profiles/*` 找装了本插件的目录（只用于记忆表；配置读写交给 `configEditor`）。
- 读写目标：llm-pi-ai 条目的 `config.providers.<provider>.models[].reasoningEfforts`，
  经宿主的 `ctx.configEditor`（`entries()` 找条目、`edit()` 落盘并热重载）。
- 补全的默认档位：`{ off: null, low: low, medium: medium, high: high, max: max }`
  （`off` 不传参 = 上游默认不开思考，其余档位直发 wire 值）。
- `/set` 已经在目标状态时不写盘；`/ensure` 只在该模型还差档位时写盘，两者都幂等。
- 记忆表与回放：`session/event`（只看 `model/selection`）+ `sessionController.selectModel`。

**网页半边**（`lib/client.js`）是自绘模型座 + 5 档滑块，客户端只调其中两个 /api：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/dsh-thinking-strength.set` | `{provider, model, enabled}` 补全 / 删除声明。滑块选非默认档补全，选「默认」档（`enabled:false`）**删除**，回 `{ok, changed, ...}` |
| POST | `/api/dsh-thinking-strength.ensure` | `{provider, model}` 把声明补全成完整 5 档（含 medium），回 `{ok, changed, ...}` |

（`/api/dsh-thinking-strength.state` 仍由宿主注册，供外部读取当前模型的声明状态，UI 不再使用。）

切换模型时滑块状态随 `modelSelection` 投影自动更新、按模型独立；出错（模型不在 llm-pi-ai
配置里、`configEditor` 不可用等）会在控件旁用「!」提示，悬停可见具体原因。

**在自绘列表里选模型失败也有提示**：`select()` 失败不抛异常，只回 `{ok:false, error}`
（例如另一个窗口正持有该会话的写入权 → `session/writer-held`、模型不可用 →
`session/model-unavailable`）。这些结果和目录 store 里的 `error` 都会汇到座位旁那个
「!」上，不会再出现「列表收起、模型没变、什么都不说」。

## 生效时机

写入走 `configEditor.edit()`，它在同一个调用里就调和了 Loader，所以档位声明通常**立刻**生效。
若没有，重开 profile / 重启 dsh 即生效。

宿主半边的代码改动（不是配置改动）需要重载 profile / 重启 dsh 才生效；网页半边的改动按
常规 client-plugin 方式（开发时 `pnpm run dev:web` HMR，或刷新页面）生效。

## 文件

- `package.json` —— 组合包清单：`dsh.bundle.patch`、`dsh.client`、`peerDependencies`
- `cordis.patch.yml` —— 补丁片段：把宿主半边插进 profile 插件树（`name` 裸包标识符）
- `thinking-strength.mjs` —— 宿主半边（profile 定位 + configEditor 读写 + 记忆表 + 回放 + /api）
- `lib/client.js` —— 网页半边（自绘模型座 + 5 档滑块）
- `test/memory.test.mjs` —— 记忆表判定 / 回放 / 读写 + `/ensure` 的回归测试（`pnpm test`）
- `test/client.test.mjs` —— 网页半边冒烟测试（缺 `dsh-model-name` 时模块仍要加载、席位注册、渲染、徽章切分、失败提示）
- `locale/zh.json`、`locale/en.json` —— 组合包列表里的标题 / 简介

## 安装

```bash
pnpm add D:/Project/dsplugin/thinking_strength
```

装完**默认启用**，并出现在 profile `package.json` 的 `dsh.profile.bundles` 数组里。
网页那半边靠 `package.json` 的 `dsh.client` 被 `dsh-client-modules` 自动发现。

**版本要求**：dsh `>=0.2.0-rc.2 <0.3.0`（`package.json` 的 `engines.dsh`；不满足时
DSH 会把插件行强制停用）。

**可选依赖 `dsh-model-name`**：模型名规范化（`ctai_my/glm-5.3` → `Glm-5.3` 之类）与徽章切分
规则都用它。装了就自动用；**没装也能跑**——`require("dsh-model-name")` 未命中模块表时会被
catch 住，退回一份等价的本地实现（只做大写兜底、没有它那份词典；徽章规则本地也照抄了一份），
功能不受影响。
所以不需要为了本插件额外装它；想统一名字显示（它也给 usage 等插件提供同一套名字）再装：

```bash
pnpm add D:/Project/dsplugin/dsh-model-name
```

## 环境变量（可选）

| 变量 | 作用 |
| --- | --- |
| `DSH_PROFILE_DIR=<目录>` | 直接指定 profile 目录（含 `cordis.patch.yml`） |
| `DSH_PROFILE=<名字>` | 结合 `DSH_HOME`（默认 `~/.dsh`）算出 profile 目录 |

两者都不设时，插件自动扫描装了它的 profile。自测时设 `DSH_PROFILE_DIR` 指到临时目录即可。

## 边界

- 只修改 llm-pi-ai 配置里「已存在的模型条目」；模型不在配置里会报错并保持不变。
- 需要 profile 挂着 `config-editor`（`ctx.configEditor`）。没有它时控件会显示
  「宿主的 configEditor 服务不可用」而不是静默失败。
- 若 llm-pi-ai 的配置被更上层（home patch / 命令行覆盖 / settings 文档）压住，
  `configEditor.edit()` 会拒绝写入并把原因回给提示，磁盘上不会留下半成品。
- 参数层无法强制「关」：滑块「默认」档 = 不发显式档位，请求不带任何思考参数、交回上游/模型
  自身默认。**它不是字节级的强制关闭** —— 若某个上游默认就思考，选「默认」它仍会思考（这是
  pi-ai 这一层的固有行为，`off` 档与「不设」在 wire 上是同一个意思）。「默认」同时会**删掉该模型
  的 `reasoningEfforts` 声明**和**档位记忆**，让模型回到无思考能力的状态。
- 任何异常都吞掉 / 通过响应里的 `error` 返回，插件崩了不连带 dsh 起不来。