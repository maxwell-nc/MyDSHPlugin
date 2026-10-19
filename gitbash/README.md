# dsh-git-bash — 让 dsh 在 Windows 上只用 Git Bash（纯插件版）

把 DeepSeek Harness（`@deepseek-ai/dsh`）的 shell 执行器换成 Git Bash，
**并让模型看到的 shell 工具就叫 `bash`**。标准模式和极简模式都覆盖：
极简模式（minimal 预设）不走 `ctx.shell`，挂的是持久 PTY 终端栈，本插件
把那套 PTY 的 shell 也换成 Git Bash（v2.1.0 起，见下文「极简模式」一节）。

这个目录是一个 **dsh 0.2.x profile 组合包（bundle）**：用 pnpm 装进
profile 的 `node_modules`，身份由 `package.json` 的 `dsh.bundle` 声明。
目标运行时是 **`>=0.2.0-rc.2 <0.3.0`**（`engines.dsh`）。DSH 用
`semver.satisfies(runtime, range, { includePrerelease: true })` 校验，所以预发布版要写成
区间：写死 `0.2.0-rc.2` 会在升到 0.2.1-rc.2 时被整体强制停用。

```
gitbash/
├── package.json        # 组合包清单：name / exports / dsh.bundle.patch / engines
├── cordis.patch.yml    # 本组合包贡献的那一个 patch 层
├── locale/             # 组合包列表里的展示元数据
│   ├── zh.json         #   meta.title / meta.description
│   └── en.json
├── gitbash-shell.mjs   # host 半边（执行器 + 工具改写），即 exports["."]
└── README.md
```

本包**没有浏览器半边**（没有 `lib/client.js`），所以 `exports` 里没有
`./client`、`dsh` 里也没有 `client` 字段 —— 它只动 host 侧。
`peerDependencies` 只声明 `@deepseek-ai/cordis`：rc2 的运行时服务
（`dsh-tool-pwsh`、`dsh-terminal` 等）写进 peer 会触发安装前的
`evaluatePluginCompatibility` 检查，版本一对不上安装直接被拒。

## 身份与落点

| | 值 |
|---|---|
| 组合包名（同时是 patch 里的 `name`） | `dsh-git-bash` |
| 版本 | `2.3.0` |
| 插入的条目 id | `bash-gitbash` |
| 关掉的上游条目 id | `bash-sandbox` / `pwsh-sandbox` |
| 落点 | profile 的 `node_modules/dsh-git-bash`；由 profile `package.json` 的 `dsh.profile.bundles` 选中 |
| 适用平台 | win32（门控在 patch 里，见下文「平台门控」） |

## 安装

用 `plugin_manager` 装，spec 必须是**绝对路径**（相对路径会被判成
`a local path must be absolute` 直接拒掉）：

```
plugin_manager({ action: "install_bundle", target: "D:\\Project\\dsplugin\\gitbash" })
```

或者用 pnpm 直接往 profile 目录里装（profile 目录就是 `dsh.profile` 所在处，
一般形如 `%USERPROFILE%\.dsh\profiles\web`）：

```
pnpm add D:\Project\dsplugin\gitbash
```

装完组合包**默认启用**：安装器会把 `dsh-git-bash` 追加进 profile
`package.json` 的 `dsh.profile.bundles`。反过来，一个没声明 `dsh.bundle` 的包
只会作为普通依赖装进去、不会成为 profile 的一层（安装器会打一行
`declares no dsh.bundle` 的 warning）—— 这也是 `dsh.bundle.patch` 不能少的原因。

## 启用 / 停用

- **组合包级**：在组合包列表里选中 / 取消 `dsh-git-bash`，也就是增删 profile
  `package.json` 的 `dsh.profile.bundles` 数组项。**层与层的应用顺序就是这个
  数组的顺序**（旧形式里那个 `order` 字段在 rc2 已经完全不存在了）。
- **条目级**：用 `cordis.patch.yml` 里的 `disabled`。本包里唯一需要手工判断的
  是下面「平台门控」那三条。

rc2 也没有 `requiresRestart` 这种字段了：运行中的 profile 走 HMR 实时重载，
改完刷新 profile 进程就生效，不需要「重启服务」那一步。

## 展示元数据

组合包列表里显示的标题与简介来自 `locale/<lang>.json`：

```json
{ "meta": { "title": "Git Bash 执行器", "description": "……" } }
```

缺哪个语言就回退到 `package.json` 的 `name` / `description`，所以 `zh.json`
（旧 manifest 里的中文原文）和 `en.json` 两套都给。本包没有图标资源，
不声明 `icon`。

## 平台门控（为什么三条都要 `disabled`）

旧形式的 `manifest.json` 里有 `"platforms": ["win32"]`，rc2 没有这个字段了，
门控只能搬进 patch —— 而且**三条都得门控**：

```yaml
- id: bash-sandbox
  disabled: !!js process.platform === 'win32'
  config:
    timeoutMs: 60000

- id: pwsh-sandbox
  disabled: !!js process.platform === 'win32'

- insert:
    - id: bash-gitbash
      name: dsh-git-bash
      disabled: !!js process.platform !== 'win32'
      config:
        timeoutMs: 60000
        fromTool: pwsh
        toolName: bash
```

前两条与上游 `@deepseek-ai/dsh-base` 的门控写法逐字一致：win32 上把两个上游
执行器关掉、在 POSIX 上一个字节都不干预。第三条保证插进来的 Git Bash 执行器
只在 win32 上生效。**少任何一条都会出事**：只门控前两条的话，在 POSIX 上装这个
组合包会把 `bash-sandbox` 和 `pwsh-sandbox` 同时关掉、又不插回任何执行器 ——
profile 直接没有 shell。

另外两条 patch 语义要记住：按 id 定位的行是**整段替换** config、不做深度合并，
所以 `bash-sandbox` 那条必须把 `config: { timeoutMs: 60000 }` 重述一遍；
patch 指定的条目不存在时只打 stderr 警告，不会让 profile 加载失败。

## 与旧版（preset 版）的区别

| | 旧版 | 现在 |
|---|---|---|
| host 平面（谁提供 `ctx.shell`） | `cordis.patch.yml` | 一样 |
| agent 平面（模型看到 bash 还是 pwsh） | `$DSH_HOME/.agent-presets/gitbash/agent.cordis.yml` + `settings.yaml` 的 `agent-presets.default` | **不需要了**：插件在运行时拦截工具注册，把 `pwsh` 改写成 `bash` |
| 升级 dsh 后 | 需要重新复制一份 shipped `standard` 预设（会落后） | 不用管，改写在运行时发生 |
| 卸载 | 4 步手工清理 | 组合包里取消选中 / 卸载这个包 |

**为什么两层变一层是可行的**：`ctx.tools`（dsh-base 的 `tools` 行）是 host 平面
唯一的工具注册表，agent 预设里的工具行都是往**同一个 ToolRuntime 实例**注册的
（跨 scope 共享，`this.ctx` 由 cordis 的 tracker 按调用方作用域重绑）。
所以插件给 `ToolRuntime.prototype.register` 套一层，就能覆盖包括 per-preset 在内的
所有注册。`register` 本身只做「校验 + 按名字入表」，改写发生在入表之前 —— 后续
`view` / `schemaOf` / dispatch 全都自然读到新名字，**模型看到的 schema 和实际可执行
的名字不会不一致**。

改写只动三处：工具名、工具描述、`command` 参数说明。执行体一行未改，
它照旧走 `ctx.shell` —— 也就是下面的 Git Bash 执行器。

## 为什么需要它

上游 `dsh-base` 按平台二选一：win32 挂 `pwsh-sandbox`，其他平台挂 bash 那一套。
Windows 上改成 bash 有三层原因（都是实测，不是推测）：

1. **裸 `bash` 是 `ENOENT`**。Git for Windows 只把 `<Git>\cmd` 加进 PATH，
   那里只有 `git.exe`；bash.exe 在 `<Git>\bin` 和 `<Git>\usr\bin`，都不在 PATH 上。
   而上游执行器把 `"bash"` 硬编码成 argv[0]，没有配置项能改。
2. **两个 bash 不等价**。`<Git>\bin\bash.exe` 的 wrapper 会先把
   `/mingw64/bin:/usr/bin` 塞进 PATH；`<Git>\usr\bin\bash.exe` 是非登录 shell，
   `command -v ls` 直接找不到，还会继承宿主的 `BASH_ENV`。所以固定优先 `<Git>\bin`。
3. **Git Bash 跑不了 dsh 的 Windows ACL 沙箱**。`dsh-sandbox-windows-acl` 的
   runner 下实测：`cmd.exe` / `node.exe` 正常，`bash.exe` →
   `couldn't create signal pipe, Win32 error 5`（exit 127）。
   MSYS2 要在内核对象命名空间建信号管道，受限令牌不给权限。
   → 插件走**无沙箱**执行器；`DSH_GITBASH_SANDBOX=1` 保留沙箱分支备用。

**代价**：shell 命令以 harness 自身权限运行，不再受 workspace-write / read-only
文件访问限制。**文件工具那条路径不受影响** —— `dsh-fs-sandbox` 是独立体系。
工具描述里已经把这一点如实告诉了模型。

## 极简模式（v2.1.0 修掉的劈叉）

极简模式（minimal 预设）是另一套 shell 栈，**不走 `ctx.shell`**：

```
dsh-terminal（PTY 注册表）
└── dsh-terminal-bash      win32 上 shellDialect: pwsh → 起的是 PowerShell
└── dsh-tool-pwsh-persistent  注册的工具名恰好也叫 `pwsh`
```

v2.0.0 只做了「换执行器 + 按名字改写 `pwsh` 工具」，于是极简模式下出现：
提示词被改成 Git Bash（名字撞上了），执行路径却还是 PowerShell 的 PTY ——
模型按 POSIX 语法写命令，实际进的是 PowerShell。这就是「提示词是 gitbash、
实际是 powershell」的来历。

v2.1.0 补了第三条平面：

- **拦 `TerminalSessionService.prototype.registerBackend`**（原型补丁，覆盖每个
  agent 入局隔离的 terminals 实例）：pwsh 方言的 `shell` 后端被**就地换成**
  Git Bash 的 bash 方言 —— `shellPath`/`shellArgs` 换掉，`shellDialect` 也一起换，
  因为 dialect 决定启动协议（bash 用 `PS1` + `PROMPT_COMMAND` 打就绪标记，
  pwsh 是注入 prompt 函数；只换 shell 不换协议，PTY 就绪检测会崩）。
- **绕过 PTY 的沙箱 confine**：`spawnArgv` 在非 danger 模式下会把 PTY argv 交给
  ACL runner，MSYS2 起不来（第 3 条）。给后端的 ctx 套了个只拦 `get("sandbox")`
  的代理，返回「confine 原样返回」的替身，其余调用全部转发真 ctx。
- **持久工具的提示词单独一份**：状态跨调用保留、没有作业 API、超时/打断会整壳
  重置 —— 和一次性版的「每次新进程」描述区分开。两个工具都叫 `pwsh`，按参数
  形状区分（持久版整个 schema 只有 `command`）。
- **Git Bash 没探测到时不改持久终端**：PTY 换过去只会起不来，不如保留能用的
  PowerShell（工具名也就不撒谎，维持 `pwsh` + PowerShell 描述）。

v2.2.0 又补了一层（这是 2.1.0 没修干净的部分）：**工具层也要换方言**。
`dsh-tool-pwsh-persistent` 不只是名字带 pwsh —— 它的 execute 整个说的是 PowerShell：
建壳时往 PTY 里发 `function prompt {...}` 的 PS 片段，每条用户命令都包进
`Write-Output '开始标记'; Invoke-Expression "..."; Write-Output ('结束标记:' + $LASTEXITCODE)`
的 PS 包装。PTY 换成 Git Bash 后，bash 收到这些等于收到乱码：标记永远打不出来，
工具的标记轮询一直转到 300 秒命令超时 —— 实测就是「每条 bash 都要等很久」，
打断时报 `Error: [object Object]`（abort reason 不是 Error，被 stringify 了）。

所以注册拦截对持久工具做**整体替换**：保留 output schema / presentCall，
`execute` 换成本插件的 bash 方言实现（`createBashPersistentExecute`）：

- 壳缓存按 owner（agent）挂 WeakMap，首次调用 spawn、之后复用（实测同一 shell
  pid、cd 和环境变量跨调用保留）；
- 每条命令包成**单物理行**：`printf '开始标记'; eval "$(printf %s '<base64>' | base64 -d)"; 退出码变量=$?; printf '结束标记:退出码'`
  —— base64 避开引号/换行/续行提示符对输出区的污染，START/END 标记把命令输出
  从 tty 回显和 prompt 里干净地切出来，退出码随 END 标记回来；
- 超时（300s，与上游 minimal 预设一致）回部分输出并整壳重置；被打断按上游语义
  原样上抛 abort reason；session 退出渲染退出状态并重置；
- 终端服务从 `exec.agent.ctx` 现取 —— 那是本 agent 入局隔离的 terminals 注册表，
  PTY 后端已被上面的平面换成 Git Bash。

v2.2.1 修掉 2.2.0 的一个真 bug：**极简模式下持久工具拿不到 terminals**。
2.2.0 的 `createBashPersistentExecute` 从 `exec.agent.ctx` 现取 terminals —— 但
minimal 预设把 `persistent-shell` 组声明成 `isolate: { terminals: true }`，terminals
是**组内**的服务，agent 自己的 scope ctx（组外）向上查不到它，于是每次调用都抛
`persistent bash tool cannot reach the terminals service of this agent` —— 这就是
「极简模式 Git Bash 还是不可用」的根因。

v2.2.2 修掉 2.2.1 的修法：2.2.1 假设 cordis 的 tracker 会把注册拦截里的 `this.ctx`
重绑成 persistent-shell 组的 ctx（看得见 terminals），**实测拿不到** —— 工具改写
确实触发了（模型看到的是 bash + 持久描述），但 `terminalsOf` 对注册时捕获的 ctx
和 `exec.agent.ctx` 都取不到 terminals，照样抛错。真正可靠的是 dsh 文档化的生产
路径 `serviceForAgent(ctx, agent, name)`（`@deepseek-ai/dsh-agent-presets`）：它从
reflect 的**原始 store** 按 fiber 归属取 agent 挂载的隔离服务，不经过 isolate
realm 的可见性过滤 —— api-proxy 的每个浏览器 RPC（session controller 读
`serviceFor(live, "skills")` 等）都走这条路径。`terminalsOf` 现在优先
`serviceForAgent(registrationCtx, owner, 'terminals')`，拿不到再退回注册时捕获的
ctx 与 `exec.agent.ctx`（标准模式等非隔离场景仍直接可见）。

v2.3.0 跟上 dsh 0.1.7 的接口改名（**同时保留旧版本兼容** —— 两套接口都实现，
各自版本只走自己那套）：

| | dsh ≤ 0.1.5-rc.x | dsh ≥ 0.1.7-alpha |
|---|---|---|
| 执行器入口 | `run(spec)` / `start(spec)` → `runArgv` / `startArgv` | `execute(spec)` → `executeArgv`（前台/后台只是「谁 await 句柄的 `result()`」） |
| 沙箱 `confine` | `confine(command, policy)`（同步返回 ConfinedArgv） | `confine(command, policy, signal)`（多一个取消信号，返回 Promise） |
| `serviceForAgent` 所在包 | `@deepseek-ai/dsh-agent-presets` | `@deepseek-ai/dsh-agent-preset-registry` |
| 极简模式持久工具 | 名字与 schema 形状没变（仍叫 `pwsh`、仍只有 `command`） | 同左 |
| 补丁关掉的上游条目 | `bash-sandbox` / `pwsh-sandbox` | 同左（id 没变） |

`LocalBashExecutor` 的入口方法在 0.1.7 从 `run`/`start` 合并成了 `execute`。**只改
这个名字就会静默降级**：插件覆写的 `run` 不再被调用，上游基类的 `execute` 直接拿
硬编码的 `["bash", "-c", …]` 去 spawn —— 也就是回到「裸 bash」那条路。本机因为
PATH 里有别的 bash（TortoiseGit）还能跑起来，换台机器就是 ENOENT，所以这层兼容
必须补上。`serviceForAgent` 是极简模式取 agent 隔离 `terminals` 的唯一可靠路径
（v2.2.2 的结论），包名换了之后 `loadHost` 会解析失败、持久工具又拿不到 terminals，
同样是静默降级。

自测：`src/tools/probe_dsh_compat.py`（跨版本统一查，见根 README「自测」一节），
其中 gitbash 那条会**真跑一条 `bash -c` 并检查 spawn 的 argv[0]** —— 接口改名
这种「改了但没生效」的退化只有真跑才看得出来。

## 跨机器 / 跨项目的细节

- **插件里没有绝对路径。** 插件需要 `@deepseek-ai/dsh-bash-local` 这类包才能
  `extends`，而 Node 是按**插件文件自己的位置**解析裸包名的 —— 本包只声明了
  `@deepseek-ai/cordis` 这一个 peer（理由见开头），pnpm 默认的严格布局下兄弟
  运行时包从本包目录里解析不到，静态 `import` 立刻 `ERR_MODULE_NOT_FOUND`。
  所以插件用 `hostImport()`：从 dsh 运行时自己的
  `node_modules` 解析包入口再 `import`（顺序：`DSH_GITBASH_MODULE_ROOT` →
  从 `process.argv[1]` 往上找带 `@deepseek-ai` 的 `node_modules` →
  `%LOCALAPPDATA%\DeepSeekHarness\runtime\` → 按本文件位置正常解析）。
- **patch 里 `name` 只能是纯字符串，而且必须是裸包标识符。** 给 `!!js` 会让 loader
  拿到表达式对象，然后 `name.startsWith is not a function` 崩掉；旧的
  `./plugins/<id>/<entry>.mjs` 路径形式在 rc2 里会被 `bundleComponentManifests()`
  直接跳过，于是本组合包声明的组件拿不到 DSH peer 兼容检查 —— 所以这里写
  `name: dsh-git-bash`。`disabled` 和 `config` 里可以用 `!!js`。
- **补丁必须成对处理两个执行器。** 上游的 bash/pwsh 执行器会抢同一个 `ctx.shell`，
  只关一个 profile 加载不了。
- **`sandboxMode` 必须声明。** `dsh-permission-presets` 构造函数第一件事就是
  `if (ctx.shell.sandboxMode === void 0) throw ...`。这里如实转述**部署的**模式
  （`ctx.sandboxPolicy.defaultMode`，即 `DSH_PERMISSION_MODE`），**不要**谎报
  `danger-full-access` —— `pinInitialPermission` 会钉住会话模式，连文件围栏一起解掉。
- **工具改写是拦截内部方法，属于"依赖实现"的接法。** 上游若重构
  `ToolRuntime.register`，改写会失效（日志里会打不出"已改写"，Git Bash 执行器部分
  仍然工作，只是模型看到的还是 pwsh 提示词）。异常一律被吞掉、不影响 dsh 启动。

## 环境变量

| 变量 | 作用 |
|---|---|
| `DSH_HOME` | dsh 配置根，缺省 `~/.dsh` |
| `DSH_GIT_BASH` | 显式指定 bash.exe，优先于自动探测 |
| `DSH_GITBASH_MODULE_ROOT` | 显式指定 dsh 运行时的 `node_modules`（自动探测失败时用） |
| `DSH_GITBASH_SANDBOX=1` | 改用沙箱执行器（MSYS2 下会 error 5） |

## 启动横幅（用来确认插件生效）

```
[dsh-bash-gitbash] bash = C:\Program Files\Git\bin\bash.exe（无沙箱执行器）
[dsh-bash-gitbash] 工具改写已装：pwsh -> bash
[dsh-bash-gitbash] 持久终端改写已装：pwsh PTY -> Git Bash PTY
[dsh-bash-gitbash] 正在注册的工具 pwsh 已改写为 bash      # 每个会话/预设挂载打一次
[dsh-bash-gitbash] 持久终端后端（…pwsh.exe）已换成 Git Bash  # 极简模式挂载持久终端时
```
