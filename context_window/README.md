# 上下文 / 输出档位（context_window）

dsh 组合包（bundle）：宿主半边（`context-window.mjs`）+ Web 客户端半边（`lib/client.js`）
+ 档位表（`tiers.json`）。条目 id 和包名都是 `dsh-context-window`。
它取代了旧的 `context_1m`（那个只有「勾上=1M」两态，且 0.2.2 起默认已是 1M，等于空操作）。

在输入框右侧（原 1M 勾选框的位置）放一个**按钮**，上面直接显示当前生效的容量：

```
1M · 128K  ▼        ← 「上下文 · 最大输出」
```

点开是「快速组合」+ 两段档位表：

| 段 | 内容 |
| --- | --- |
| 快速组合 | 默认 / 128K · 16K / 262K · 32K / 500K · 64K / 1M · 128K |
| 上下文 | 默认 / 128K / 200K / 262K / 500K / 1M |
| 输出 | 默认 / 4K / 8K / 16K / 32K / 64K / 128K |

- 点**快速组合** → 上下文和输出**一次写入**（例如「262K · 32K」两步并一步）；
- 点某一档 → 往 profile 的 llm-pi-ai 配置里**当前模型**的条目写 `contextWindow` / `maxTokens`；
- 点「默认」→ **删除**该字段，回到适配器自发默认（llm-pi-ai 0.2.2 起：上下文 1,000,000、输出 128,000）；
- 按钮上的数字永远是**当前生效值**（宿主把「模型声明 → 目录 → provider 默认」依次套完的结果），
  弹层里高亮的则是**当前已声明**的那一档（没声明就高亮「默认」）——蓝色只出现在弹层里命中的
  档位 / 组合上，按钮本身一直是常规配色（非默认档不变蓝）；
- 状态按模型各自独立，切换模型自动回读。

## 档位表与组合怎么改（`tiers.json`）

档位表和快速组合就在包目录下，**每次请求都重新读盘**，改完立即生效、不用重载插件：

```json
{
  "contextTiers": [
    { "label": "默认", "value": null },
    { "label": "128K", "value": 128000 }
  ],
  "outputTiers": [
    { "label": "默认", "value": null },
    { "label": "8K", "value": 8192 }
  ],
  "presets": [
    { "label": "默认", "context": null, "maxTokens": null },
    { "label": "128K · 16K", "context": 128000, "maxTokens": 16384 }
  ]
}
```

- `label` 是按钮/档位上显示的文字，`value` / `context` / `maxTokens` 是写进配置的 token 数；
- `null` = 「默认」（删除该字段的声明）；
- `presets` 里 `context <= maxTokens` 的组合会在读盘时被丢掉（免得点了必然报错）；
- 想改档位只改这个文件；`contextTiers` / `outputTiers` 至少要各剩一个合法档位，否则退回内置档位（日志会说明）；
- 也可以用环境变量 `DSH_CONTEXT_WINDOW_TIERS=<json 路径>` 指到别处的档位表（自测/多套档位时方便）。

## 为什么改的是「配置文件」

DSH 的容量靠**模型目录声明**取值。llm-pi-ai（`catalog.ts`）的优先级是：

```
models[].contextWindow  →  安装的 catalog  →  providers.<p>.defaultContextWindow（0.2.2 起默认 1M）
```

`maxTokens` 同理（0.2.2 起默认 128K），并且**只有配置里显式声明的 model maxTokens 才会变成
请求级默认**，catalog 自带的值只描述模型能力。上下文压力 / 自动压缩也按声明值计算：
basic 压缩要求 `contextWindow` 大于请求 `maxTokens`，所以本插件保证「上下文 > 输出」——

- 只调一边且要越界时，另一边**按档位表自动跟随**，并在响应 `notice` 里说明
  （例如切上下文 128K 时输出会从 128K 跟到 64K）；
- 一次请求里同时给两个冲突值 → 400，让你分两次调。

写入不自己解析 YAML，而是走**宿主自己的 `ctx.configEditor` 服务**（`config-editor` 插件）：
由它加锁、重新读盘、按 llm-pi-ai 自己的 Config 校验、写 profile 补丁层、调和 Loader 热重载。
只装桌面版、没装 CLI 也能用（插件不需要 `yaml` 库）。代价是 llm-pi-ai 那一行会被重新序列化，
文件里其余行与注释不受影响。

## 生效时机

写入走 `configEditor.edit()`，它在同一个调用里就调和了 Loader，所以容量提示通常**立刻**更新。
若没有，重开 profile / 重启 dsh 即生效。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dsh-context-window.state?provider=&model=` | `{ok, provider, model, writable, context, output, tiers, presets, profile, patch}` |
| POST | `/api/dsh-context-window.set` | `{provider, model, contextWindow?, maxTokens?}`（字段出现才改，`null` = 删除声明），回 `{ok, changed, notice?, context, output, tiers, presets}` |

`context` / `output` 的形状：`{ value（生效值）, declared（声明值，可能缺省）, source（declared / catalog / fallback）, label, tier }`；
`tiers` 是 `{ context, output }` 两个档位数组，`presets` 是 `[{ label, context, maxTokens }]`。
`writable=false`（模型不在 llm-pi-ai 配置里）时弹层会禁用全部档位并说明原因。

不带 `provider` / `model` 时用宿主的默认模型兜底（宿主 `agentDefaultModel.currentSelection()`）。

## 文件

- `package.json` —— 组合包清单：`dsh.bundle.patch`、`dsh.client`、`peerDependencies`
- `cordis.patch.yml` —— 补丁片段：把宿主半边插进 profile 插件树（`name` 裸包标识符）
- `context-window.mjs` —— 宿主半边（容量读取 + configEditor 读写 + /api）
- `lib/client.js` —— 网页半边（输入框右侧的档位按钮、快速组合与弹层）
- `tiers.json` —— 档位表 + 快速组合（配置）
- `test/api.test.mjs` —— 宿主半边回归测试（`node test/api.test.mjs`）
- `test/client.test.mjs` —— 网页半边冒烟测试（模块加载 / 插槽注册 / 渲染，`node test/client.test.mjs`）
- `locale/zh.json`、`locale/en.json` —— 组合包列表里的标题 / 简介

## 安装

```bash
pnpm add D:/Project/dsplugin/context_window
```

装完**默认启用**，并出现在 profile `package.json` 的 `dsh.profile.bundles` 数组里。
网页那半边靠 `package.json` 的 `dsh.client` 被 `dsh-client-modules` 自动发现。

**版本要求**：dsh `>=0.2.0-rc.2 <0.3.0`（`package.json` 的 `engines.dsh`；不满足时
DSH 会把插件行强制停用）。

## 边界与已知行为

- 只修改 llm-pi-ai 配置里「已存在的模型条目」；模型不在配置里会报错并保持不变。
- 需要 profile 挂着 `config-editor`（`ctx.configEditor`）。没有它时报明确原因，不静默失败。
- 「默认」档是**删除声明**，不是恢复勾选前的某个具体值；0.2.2 起删除后回到 1M / 128K。
- 输出档位里没有 catalog 级的可读接口：未声明时显示的「适配器默认」= provider 的
  `defaultMaxTokens`，取不到才是内置 128K；catalog 值只描述模型能力、不影响请求默认。
- 任何异常都吞掉 / 通过响应里的 `error` 返回，插件崩了不连带 dsh 起不来。
