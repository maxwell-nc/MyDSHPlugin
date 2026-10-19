# 思考强度开关（thinking_strength）

dsh 组合包（bundle）：宿主半边（`thinking-strength.mjs`）+ Web 客户端半边（`lib/client.js`）。
条目 id 和包名都是 `dsh-thinking-strength`。

在输入框模型选择器左边放一个**勾选框**：「思考」。它作用的对象永远是**当前模型**
（`modelSelection` 投影，切换模型即时跟随）。

| 操作 | 结果 |
| --- | --- |
| 勾上  | 自动往 llm-pi-ai 配置里**补全**该模型的 `reasoningEfforts` 档位 |
| 取消  | 从 llm-pi-ai 配置里**删除**该模型的 `reasoningEfforts` |

勾选状态 = 当前模型在 llm-pi-ai 配置里是否声明了 `reasoningEfforts`（按模型各自独立）。

## 为什么改的是「配置文件」而不是「请求参数」

DSH 的 llm 校验层（`resolveCallWithInfo`）只接受**模型目录声明过的** reasoningEhffort 档位；
模型没声明时，任何显式 `reasoningEffort` 都会直接抛 `UNSUPPORTED_REASONING_EFFORT`。
`reasoningEfforts` 正是 llm-pi-ai 给手写 provider 模型声明能力的字段：

- 物化成 `reasoning: true` + `thinkingLevelMap` → 内置 ModelSelect 的 effort 面板自动出现；
- 每次请求按档位把 `reasoning_effort: <wire>` 发给上游（openai-completions 默认路径）。

所以这个勾选框 =「让 DSH 认账这个模型能思考 + 打开内置档位入口」。勾完之后，具体强度
（off / low / high / max）在内置的模型选择器 effort 面板里选即可。

## 怎么工作

**宿主半边**（`thinking-strength.mjs`）解释：

- 定位 profile：优先 `DSH_PROFILE_DIR` → `DSH_HOME` + `DSH_PROFILE` → 兜底扫描
  `$DSH_HOME/profiles/*` 找装了本插件的目录。
- 读写目标：`<profile>/cordis.patch.yml` 里 llm-pi-ai 条目的
  `config.providers.<provider>.models[].reasoningEfforts`。
- YAML 用 profile 共享 store 里的 `yaml`（`parseDocument`），改目标模型那一段时
  **保留其它注释与排版**；写文件走「临时文件 + rename」。
- 补全的默认档位：`{ off: null, low: low, high: high, max: max }`
  （`off` 不传参 = 上游默认不开思考，其余档位直发 wire 值）。

**网页半边**（`lib/client.js`）是输入框里的勾选框，走两个 /api：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-thinking-strength.state?provider=&model=` | `{ok, provider, model, has}` |
| POST | `/api/dsh-thinking-strength.set` | `{provider, model, enabled}` 补全 / 删除 |

切换模型时勾选框自动回读、状态按模型独立；出错（模型不在 llm-pi-ai 配置里等）会在
勾选框的 tooltip 里显示具体原因。

## 生效时机

patch 文件写入后，长驻 surface（web GUI）会热重载 profile 补丁层。若模型选择器里的
effort 面板没有**立刻**出现，重开 profile / 重启 dsh 即生效。

## 文件

- `package.json` —— 组合包清单：`dsh.bundle.patch`、`dsh.client`、`peerDependencies`
- `cordis.patch.yml` —— 补丁片段：把宿主半边插进 profile 插件树（`name` 裸包标识符）
- `thinking-strength.mjs` —— 宿主半边（profile 定位 + patch 编辑 + /api）
- `lib/client.js` —— 网页半边（输入框里的勾选框）
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

## 边界与已知行为

- 只修改 llm-pi-ai 配置里「已存在的模型条目」；模型不在配置里会报错并保持不变。
- 取消勾选是删除 `reasoningEfforts` 字段（包括原来是 `false` 的情况）。
- 任何异常都吞掉 / 通过响应里的 `error` 返回，插件崩了不连带 dsh 起不来。