# 思考强度开关（thinking_strength）

dsh 组合包（bundle）：宿主半边（`thinking-strength.mjs`）+ Web 客户端半边（`lib/client.js`）。
条目 id 和包名都是 `dsh-thinking-strength`。

两件事：

1. **让当前模型能思考** —— 在输入框模型选择器左边放一个**勾选框**「思考」，
   勾上就为当前模型声明 `reasoningEfforts`，取消就删除声明。
2. **按模型记住思考强度** —— 切换模型再切回来，自动带回你上次选的档位，
   不再被重置成该模型的默认档。

## 一、勾选框：声明 / 删除 reasoningEfforts

它作用的对象永远是**当前模型**（`modelSelection` 投影，切换模型即时跟随）。

| 操作 | 结果 |
| --- | --- |
| 勾上  | 自动往 llm-pi-ai 配置里**补全**该模型的 `reasoningEfforts` 档位 |
| 取消  | 从 llm-pi-ai 配置里**删除**该模型的 `reasoningEfforts` |

勾选状态 = 当前模型在 llm-pi-ai 配置里是否声明了 `reasoningEfforts`（按模型各自独立）。

### 为什么改的是「配置文件」而不是「请求参数」

DSH 的 llm 校验层（`resolveCallWithInfo`）只接受**模型目录声明过的** reasoningEffort 档位；
模型没声明时，任何显式 `reasoningEffort` 都会直接抛 `UNSUPPORTED_REASONING_EFFORT`。
`reasoningEfforts` 正是 llm-pi-ai 给手写 provider 模型声明能力的字段：

- 物化成 `reasoning: true` + `thinkingLevelMap` → 内置 ModelSelect 的 effort 面板自动出现；
- 每次请求按档位把 `reasoning_effort: <wire>` 发给上游（openai-completions 默认路径）。

所以这个勾选框 =「让 DSH 认账这个模型能思考 + 打开内置档位入口」。勾完之后，具体强度
（off / low / high / max）在内置的模型选择器 effort 面板里选即可。

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
| 路由没变、effort 变了 | 用户在档位面板里主动改档（含「恢复默认档」） | 写进记忆 |

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

**删掉这个文件就清空记忆**；取消勾选框（删除该模型的 `reasoningEfforts`）会顺手清掉该模型的记忆。

不用 `localStorage`：Desktop 用 `--port 0` 启动，每次重启端口变了 origin 也就变了，浏览器存储留不住。

### 边界与已知行为

- **会多一条会话事件**：每次回放都会追加一条 `model/selection`（路由不变、只换档位）。
  它不产生 `[model changed]` 提示，但确实在会话日志里多一条记录。
- **档位失效自动丢弃**：模型后来不再声明该档（比如勾选框被取消）时，回放会拿到
  `does not support reasoning effort`，此时删除该条记忆而不是反复重试。
- **竞态保护**：回放前重读当前路由，若用户已经切走就放弃，避免迟到的回放把新模型盖回去。
- **子会话跳过**：`session.header.origin === 'subagent'` 的会话不参与记忆与回放。
- **失败不致命**：记忆表读写、回放失败都只记日志；记忆表损坏按空表处理，插件不会因此起不来。

## 怎么工作

**宿主半边**（`thinking-strength.mjs`）：

- 定位 profile：优先 `DSH_PROFILE_DIR` → `DSH_HOME` + `DSH_PROFILE` → 兜底扫描
  `$DSH_HOME/profiles/*` 找装了本插件的目录（只用于记忆表；配置读写交给 `configEditor`）。
- 勾选框读写目标：llm-pi-ai 条目的 `config.providers.<provider>.models[].reasoningEfforts`，
  经宿主的 `ctx.configEditor`（`entries()` 找条目、`edit()` 落盘并热重载）。
- 补全的默认档位：`{ off: null, low: low, high: high, max: max }`
  （`off` 不传参 = 上游默认不开思考，其余档位直发 wire 值）。
- 已经是目标状态时不写盘（不白改一次排版）。
- 记忆表与回放：`session/event`（只看 `model/selection`）+ `sessionController.selectModel`。

**网页半边**（`lib/client.js`）是输入框里的勾选框，走两个 /api：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-thinking-strength.state?provider=&model=` | `{ok, provider, model, has, profile, patch}` |
| POST | `/api/dsh-thinking-strength.set` | `{provider, model, enabled}` 补全 / 删除，回 `{ok, changed, ...}` |

切换模型时勾选框自动回读、状态按模型独立；出错（模型不在 llm-pi-ai 配置里、`configEditor`
不可用等）会在勾选框的 tooltip 里显示具体原因。

## 生效时机

写入走 `configEditor.edit()`，它在同一个调用里就调和了 Loader，所以模型选择器里的 effort
面板通常**立刻**出现。若没有，重开 profile / 重启 dsh 即生效。

宿主半边的代码改动（不是配置改动）需要重载 profile / 重启 dsh 才生效。

## 文件

- `package.json` —— 组合包清单：`dsh.bundle.patch`、`dsh.client`、`peerDependencies`
- `cordis.patch.yml` —— 补丁片段：把宿主半边插进 profile 插件树（`name` 裸包标识符）
- `thinking-strength.mjs` —— 宿主半边（profile 定位 + configEditor 读写 + 记忆表 + 回放 + /api）
- `lib/client.js` —— 网页半边（输入框里的勾选框）
- `test/memory.test.mjs` —— 记忆表判定 / 回放 / 勾选框读写的回归测试（`pnpm test`）
- `locale/zh.json`、`locale/en.json` —— 组合包列表里的标题 / 简介

## 安装

```bash
pnpm add D:/Project/dsplugin/thinking_strength
```

装完**默认启用**，并出现在 profile `package.json` 的 `dsh.profile.bundles` 数组里。
网页那半边靠 `package.json` 的 `dsh.client` 被 `dsh-client-modules` 自动发现。

**版本要求**：dsh `>=0.2.0-rc.2 <0.3.0`（`package.json` 的 `engines.dsh`；不满足时
DSH 会把插件行强制停用）。

## 环境变量（可选）

| 变量 | 作用 |
| --- | --- |
| `DSH_PROFILE_DIR=<目录>` | 直接指定 profile 目录（含 `cordis.patch.yml`） |
| `DSH_PROFILE=<名字>` | 结合 `DSH_HOME`（默认 `~/.dsh`）算出 profile 目录 |

两者都不设时，插件自动扫描装了它的 profile。自测时设 `DSH_PROFILE_DIR` 指到临时目录即可。

## 边界

- 只修改 llm-pi-ai 配置里「已存在的模型条目」；模型不在配置里会报错并保持不变。
- 需要 profile 挂着 `config-editor`（`ctx.configEditor`）。没有它时勾选框会显示
  「宿主的 configEditor 服务不可用」而不是静默失败。
- 若 llm-pi-ai 的配置被更上层（home patch / 命令行覆盖 / settings 文档）压住，
  `configEditor.edit()` 会拒绝写入并把原因回给 tooltip，磁盘上不会留下半成品。
- 取消勾选是删除 `reasoningEfforts` 字段（包括原来是 `false` 的情况）。
- 任何异常都吞掉 / 通过响应里的 `error` 返回，插件崩了不连带 dsh 起不来。
