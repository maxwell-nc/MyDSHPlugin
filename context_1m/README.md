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

写入不自己解析 YAML，而是走**宿主自己的 `ctx.configEditor` 服务**（`config-editor` 插件）：

- 由它加锁、重新读盘、按 llm-pi-ai 自己的 Config 校验、写 profile 补丁层、调和 Loader 热重载；
- 只重写 llm-pi-ai 那一行（该行会被重新序列化，行内注释会给格式化掉），文件里其余行与注释原样保留；
- 所以**只装桌面版、没装 CLI 也能用** —— 插件不需要 `yaml` 库（profile 的 `node_modules` 里只有
  profile 安装的 bundle，其中 `yaml` 软链还可能指向已经删掉的 CLI 安装）。

## 怎么工作

**宿主半边**（`context-1m.mjs`）解释：

- 定位 profile：优先 `DSH_PROFILE_DIR` → `DSH_HOME` + `DSH_PROFILE` → 兜底扫描
  `$DSH_HOME/profiles/*` 找装了本插件的目录（只用于兜底；配置读写交给 `configEditor`）。
- 读写目标：llm-pi-ai 条目的 `config.providers.<provider>.models[].contextWindow` 与 `.maxTokens`，
  经宿主的 `ctx.configEditor`（`entries()` 找条目、`edit()` 落盘并热重载）。
- 勾上写入的默认值：`{ contextWindow: 1000000, maxTokens: 128000 }`（1M 上下文 + 128K 最大输出）。
- 已经是目标状态就不写盘（不白改一次排版）；只写了一半（比如只有 1M、maxTokens 还是 32K）会补齐。

**网页半边**（`lib/client.js`）是输入框里的勾选框，走两个 /api：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-context-1m.state?provider=&model=` | `{ok, provider, model, has, declared, declaredMaxTokens, profile, patch}` |
| POST | `/api/dsh-context-1m.set` | `{provider, model, enabled}` 写入 / 删除，回 `{ok, changed, ...}` |

切换模型时勾选框自动回读、状态按模型独立；出错（模型不在 llm-pi-ai 配置里、`configEditor`
不可用等）会在勾选框的 tooltip 里显示具体原因。

## 生效时机

写入走 `configEditor.edit()`，它在同一个调用里就调和了 Loader，所以上下文容量提示通常
**立刻**更新。若没有，重开 profile / 重启 dsh 即生效。

## 文件

- `package.json` —— 组合包清单：`dsh.bundle.patch`、`dsh.client`、`peerDependencies`
- `cordis.patch.yml` —— 补丁片段：把宿主半边插进 profile 插件树（`name` 裸包标识符）
- `context-1m.mjs` —— 宿主半边（configEditor 读写 + /api）
- `lib/client.js` —— 网页半边（输入框里的勾选框）
- `test/api.test.mjs` —— 勾选框读写的回归测试（`pnpm test`）
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
- 需要 profile 挂着 `config-editor`（`ctx.configEditor`）。没有它时勾选框会显示
  「宿主的 configEditor 服务不可用」而不是静默失败。
- 若 llm-pi-ai 的配置被更上层（home patch / 命令行覆盖 / settings 文档）压住，
  `configEditor.edit()` 会拒绝写入并把原因回给 tooltip，磁盘上不会留下半成品。
- 取消勾选是删除 `contextWindow` 字段（模型回到适配器默认 / provider 的
  `defaultContextWindow`，而不是恢复到勾选前的某个具体值）。
- 若某个 provider 的 `defaultContextWindow` 本身就不是 1M，且你不想动 provider，
  就只在该模型上勾本插件（写模型级 `contextWindow`，优先级高于 provider 默认）。
- 任何异常都吞掉 / 通过响应里的 `error` 返回，插件崩了不连带 dsh 起不来。