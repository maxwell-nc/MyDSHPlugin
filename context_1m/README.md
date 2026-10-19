# 1M 上下文开关（context_1m）

dsh 组合包（bundle）：宿主半边（`context-1m.mjs`）+ Web 客户端半边（`lib/client.js`）。
条目 id 和包名都是 `dsh-context-1m`。

在输入框模型选择器左边放一个**勾选框**：「1M」。它作用的对象永远是**当前模型**
（`modelSelection` 投影，切换模型即时跟随）。

| 操作 | 结果 |
| --- | --- |
| 勾上  | 自动往 llm-pi-ai 配置里**写入**该模型的 `contextWindow: 1000000`（1M token）**和** `maxTokens: 128000`（128K 最大输出，覆盖默认 32K） |
| 取消  | 从 llm-pi-ai 配置里**删除**该模型的 `contextWindow` 与 `maxTokens`，回到原来的上下文与默认 32K 最大输出 |

勾选状态 = 当前模型在 llm-pi-ai 配置里是否声明了 `contextWindow`（按模型各自独立）。

## 为什么改的是「配置文件」而不是「请求参数」

DSH 的上下文容量靠**模型目录声明**取值：llm-pi-ai 校验层只接受正整数（单位 token）
的 `contextWindow`；模型没声明时用 provider 的 `defaultContextWindow` 兜底
（默认 `1e6` = 1M）。所以：

- 某模型当前实际是较小窗口时，勾上「1M」就把它**显式抬到 1,000,000**；
- 取消删除字段，模型回到**原来的上下文**（适配器自带值或 provider 的 default）；
- 上下文压力 / 自动压缩也会按声明值计算（`models[].contextWindow` 要 > 请求 maxTokens）。

这正是 llm-pi-ai 给手写 provider 模型声明能力的字段，和思考插件的
`reasoningEfforts` 是同一类声明式能力。

## 怎么工作

**宿主半边**（`context-1m.mjs`）解释：

- 定位 profile：优先 `DSH_PROFILE_DIR` → `DSH_HOME` + `DSH_PROFILE` → 兜底扫描
  `$DSH_HOME/profiles/*` 找装了本插件的目录。
- 读写目标：`<profile>/cordis.patch.yml` 里 llm-pi-ai 条目的
  `config.providers.<provider>.models[].contextWindow` 与 `.maxTokens`。
- YAML 用 profile 共享 store 里的 `yaml`（`parseDocument`），改目标模型那一段时
  **保留其它注释与排版**；写文件走「临时文件 + rename」。
- 勾上写入的默认值：`{ contextWindow: 1000000, maxTokens: 128000 }`（1M 上下文 + 128K 最大输出）。

**网页半边**（`lib/client.js`）是输入框里的勾选框，走两个 /api：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-context-1m.state?provider=&model=` | `{ok, provider, model, has, declared, declaredMaxTokens}` |
| POST | `/api/dsh-context-1m.set` | `{provider, model, enabled}` 写入 / 删除 |

切换模型时勾选框自动回读、状态按模型独立；出错（模型不在 llm-pi-ai 配置里等）会在
勾选框的 tooltip 里显示具体原因。

## 生效时机

patch 文件写入后，长驻 surface（web GUI）会热重载 profile 补丁层。若上下文容量提示
没有**立刻**变化，重开 profile / 重启 dsh 即生效。

## 文件

- `package.json` —— 组合包清单：`dsh.bundle.patch`、`dsh.client`、`peerDependencies`
- `cordis.patch.yml` —— 补丁片段：把宿主半边插进 profile 插件树（`name` 裸包标识符）
- `context-1m.mjs` —— 宿主半边（profile 定位 + patch 编辑 + /api）
- `lib/client.js` —— 网页半边（输入框里的勾选框）
- `locale/zh.json`、`locale/en.json` —— 组合包列表里的标题 / 简介

## 安装

```bash
pnpm add D:/Project/dsplugin/context_1m
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
- 取消勾选是删除 `contextWindow` 字段（模型回到适配器默认 / provider 的
  `defaultContextWindow`，而不是恢复到勾选前的某个具体值）。
- 若某个 provider 的 `defaultContextWindow` 本身就不是 1M，且你不想动 provider，
  就只在该模型上勾本插件（写模型级 `contextWindow`，优先级高于 provider 默认）。
- 任何异常都吞掉 / 通过响应里的 `error` 返回，插件崩了不连带 dsh 起不来。