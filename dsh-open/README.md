# dsh-open —— 用系统默认工具打开文件与文件夹

给 DSH 加一个**真正会走系统默认文件管理器**的打开按钮。当前是本机实测版：
这一版**只做界面按钮**（agent 工具以后再加）。

## 它解决的问题

宿主自带的「在文件夹中显示」在 Windows 上是硬编码的：

```ts
// dsh 源码 packages/util/native-command/src/path-opener.ts
if (manager === 'explorer') {                      // nativeFileManager() 在 win32 恒为 'explorer'
  await runExplorer(['/select,', explorerTarget(windowsPath)], signal, run)
}
```

Node 直接 `CreateProcess("explorer.exe", "/select,…")`，**不经过 shell 的动词表**。
而 Directory Opus 的 Explorer Replacement 只有两条接管路径：

| 机制 | 注册 / 进程 | 生效前提 |
|---|---|---|
| shell 动词 | `HKCU\Software\Classes\Folder\shell\(默认)=openindopus` → `dopusrt.exe /nodde /idlist,%I,%L` | 调用方走 **ShellExecute** |
| DDE | `dopusrt.exe /dde` | 调用方发 **DDE** 请求 |

Opus 官方文档 *Explorer replacement limitations* 写得很直白：

> A program that **specifically invokes Explorer** may not be able to be intercepted by Opus.

DSH 正是这种情况，所以那个按钮永远唤出资源管理器，跟装没装 Opus 无关。
唯一能劫持 CreateProcess 的手段是 IFEO
(`…Image File Execution Options\explorer.exe\Debugger`)，那会连登录 shell 一起劫持——不能用。

**结论：只能改调用方。** 本插件自己按「系统注册的默认文件管理器」来打开。

## 实测出来的 Opus 命令（Opus 13.21）

全部用 `dopusrt.exe /info "<out.xml>,paths"` 探针客观验证（不依赖肉眼）：

| 目的 | 命令 | 验证结果 |
|---|---|---|
| 在 Opus 中打开文件夹 | `dopusrt.exe /open "<folder>"` | ✅ 新 Lister 出现在 `paths` 列表 |
| **定位并选中文件**（打开父目录 + 选中） | `dopusrt.exe /open "<文件完整路径>"` | ✅ 目标 tab 出现且 `sel="1"` |
| 读所有标签页 | `dopusrt.exe /info "<out.xml>,paths"` | ✅ XML，含 `lister` / `tab` 句柄、`active_tab` |
| 读某标签页条目 | `dopusrt.exe /info "<out.xml>,list,<tab>"` | ✅ `<item id name path sel type />` |
| 读选中项 / 选中条目 | `…,listsel,<tab>` / `,select,<tab>,<id>` | ✅ |
| 置前 | `/info ,paths` 的 `lister="0x…"` **就是真 HWND**（类名 `dopus.lister`）→ `SetForegroundWindow` | ✅ 前台进程变为 `dopus` |

**证伪的写法**（别再用）：

| 命令 | 实际行为 |
|---|---|
| `dopus.exe "/select,<file>"` | ❌ 不识别，只弹一个默认 Lister（停在 Desktop） |
| `dopusrt.exe /cmd "Go <path>"`（含 `PATH=` / `NEWTAB` 变体） | ❌ 无任何效果 |
| `dopusrt.exe /info "<file>,paths"`（少个逗号） | ❌ 静默无输出，必须 `<outfile>,<command>` |

**置前必须自己做**：`/open` 不会把 Opus 拉到前台（Windows 前台锁：调用方不是前台进程）。
本插件用 `Microsoft.VisualBasic.Interaction::AppActivate` 补这一步（实测有效，且比
Add-Type 编译 P/Invoke 快得多）。

## 行为表

| 场景 | 默认管理器是 Opus | 其他情况 |
|---|---|---|
| 打开文件夹 / 目录 | `dopusrt /open "<dir>"` + 置前 | Windows：ShellExecute（`Start-Process`，路径经**环境变量**传递，规避引号转义）；macOS：`open`；Linux：`xdg-open` |
| 定位文件（选中） | `dopusrt /open "<file>"` + 置前 | Windows：`explorer.exe /select,`；macOS：`open -R`；Linux：`xdg-open <父目录>` |

探测不是「哪个 exe 存在」，而是读 shell 自己的注册
（`HKCU`/`HKLM` 的 `Software\Classes\Folder\shell` 默认动词 → 该动词的 command），
所以用户换了别的文件管理器也能跟上；结果缓存 10 秒。

## 界面入口

| Slot | 拿路径的方式 | 按钮做的事 |
|---|---|---|
| `conversation.session.header.utilities` | 标准 session props：`useSessions(s => s.byId[sessionId].cwd)` | 用默认文件管理器**打开当前会话的工作区目录**（紧凑图标按钮，文案在 tooltip） |
| `sidebar.right.tab.document.actions` | owner props `absolutePath` = 预览文件 | 在默认文件管理器中**定位并选中**该文件 |
| `sidebar.right.tab.files.actions` | owner props `absolutePath` = 工作区根目录 | 用默认文件管理器**打开**该目录 |

> 对话页头那个位置原本就有官方的 `open-in-app` 单元格（文件夹+箭头图标）。
> 本插件在旁边（order 20）加自己的单元格，**不覆盖**官方那个 —— 官方控件的
> 应用菜单等功能保持原样。本插件用自己的 id `dsh-open`。

按钮文案跟着探测结果走（"用 Directory Opus 打开" / "在 Directory Opus 中显示"），
探测不到就退化成"用系统默认工具打开"。失败时按钮转红、原因进 tooltip，8 秒后复位。

## Host / Client 接口

Host 半边（`dsh-open.mjs`）只在有 `connection` 服务时挂两条同源路由：

```
GET  /api/dsh-open.info  → { ok, platform, opener: { kind: 'opus'|'system', label } }
POST /api/dsh-open.act   → { path, mode: 'open'|'reveal' }
                         ← { ok, mode, path, kind: 'file'|'directory', opener, command, focused? }
```

校验：只接受绝对路径、长度 ≤ 4096、必须存在（否则返回明确原因）。
两条路由的关键逻辑都在 `perform()` 里——**将来的 agent 工具直接调它，不另写一套**。

## 安装

```bash
# 由插件管理器安装（profile: desktop）——target 传本插件在本地仓库中的绝对路径
plugin_manager install_bundle  target = <本仓库目录>/dsh-open
```

`cordis.patch.yml` 里 `name` 必须是裸包标识符 `dsh-open`（写路径会被
`bundleComponentManifests()` 跳过，组件就拿不到 DSH peer 兼容检查）。
浏览器半边由 `package.json` 的 `dsh.client` 字段自动发现，不需要在 patch 里声明。
