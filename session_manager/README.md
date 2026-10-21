# dsh-session-manager — 会话批量管理（真正的删除，不是归档）

dsh 官方的会话管理只有「归档」：`workspaceRegistry.archiveSession()` 只把会话 id
收进注册表的一个全局集合，**会话日志继续留在 `~/.dsh/sessions/<工作区>/<会话>/`
里占盘，永不释放**。这个组包补上「删除」：

* **设置页新增「会话管理」一节**（浏览器半边注册 `settings.section`，
  位于「Agent 预设」之后）；点开即是管理界面。
* **按工作区管理**：顶部下拉切换「全部工作区 / 未分组 / 某个工作区」，
  统计每个范围的会话数、总大小、归档/置顶/使用中的数量。
* **单条 / 批量删除**：行内「删除」按钮，或勾选后底部条上的「批量删除」。
* **一键清理**：预设 `30 / 15 / 7 天前` 三个快捷键（按「最后更新时间」圈定，
  用途说明在按钮 tooltip 里），点击后弹出确认框，显示精确数量。
* **一键删除已归档**：清理工具栏里「7 天前」隔壁的「已归档（N）」按钮，按当前
  范围（全部工作区 / 某工作区 / 未分组）圈定**所有「已归档」且未在使用中**的会话
  一把清掉；使用中的会被 host 自动跳过，不会误删。
* **删除整个工作区**：注销工作区登记 + 永久删除其名下全部会话日志
  （项目文件不动；有会话在运行时整体取消）。
* **打开会话文件保存目录**：每个工作区一行上的「打开会话目录」按钮
  （资源管理器/访达），页脚还能打开存储根目录。

「删除」做了什么（host 半边，全部走宿主官方 API + 落盘删除）：

1. 注册三处摘除：`workspaceRegistry.unpinSession`（置顶）→
   `unarchiveSession`（归档集合）→ 该工作区 `detachSession`（记账号）；
2. 删除会话日志目录：`<sessions 根>/<projectKey(cwd)>/<session-id>/`
   （含 `session.v*.jsonl[*]` 全部历史世代与锁文件）；空了的工作区目录顺带清掉；
3. 删除 projection cache：`<DSH_HOME>/storages/session_projcache/sessions/<id>.json`。

「使用中」的会话（本进程内存里有，或 `workspace/session-activity` waterfall
报告有 turn/job/定时任务/子代理在跑）会被自动跳过——硬删进行中的日志会撕裂
会话。

侧边栏同步分两条：工作区成员账目（sessionIds/置顶/归档）经注册表
`domain/changed` → workspace follow 流自动推给客户端；会话**行**默认只认
宿主的 `api-session/removed` 广播——宿主自己只为活会话的销毁发它，所以本
插件删除成功后会替宿主逐个 `ctx.emit("api-session/removed", id)`
（该事件在 api-remotes 转发白名单里），左侧列表即刻把僵尸行撤掉。


```
session_manager/
├── package.json        # 组合包身份：dsh.bundle.patch + dsh.client + engines + files
├── cordis.patch.yml    # 本组合包自己的 patch 层（只插 host 半边）
├── locale/zh.json      # 组合包列表里的中文标题 / 简介
├── locale/en.json      # 同上，英文
├── session-manager.mjs # host 半边：五条 /api/session-mgr.* 接口
└── lib/client.js       # 浏览器半边：设置页「会话管理」界面
```

## 接口

全部走 connection 的鉴权通道（同 web UI 同源 fetch，Host/Origin 围栏 + cookie
鉴权由 connection 层负责）：

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/api/session-mgr.overview` | GET | 全库清点：工作区 + 已存储会话（id/cwd/时间/大小/归档/置顶/使用中） |
| `/api/session-mgr.titles` | POST | `{ids}` → 批量补会话标题（`sessionQuery.readTitleSnapshots`，单次上限 200） |
| `/api/session-mgr.delete` | POST | `{ids}` → 批量真正删除，`{deleted, failed}` |
| `/api/session-mgr.delete-workspace` | POST | `{workspaceId}` → 删除整个工作区（登记 + 全部会话日志） |
| `/api/session-mgr.open-dir` | POST | `{kind:'root'\|'workspace', workspaceId?}` → 打开会话保存目录 |

## 关键实现点

* **路径定位**：优先用 jsonl 后端自己的 `sessionPersistence.locate({id,cwd})`
  （宿主算的路径永远对）；`projectKey`/`encodeSegment` 在本插件中留了逐字符
  一致的兜底拷贝（只在 locate 不可用 / 需要算工作区目录时用）。
* **注册表一律走官方 API，绝不动 `workspace.json`**：注册表是
  `workspaceRegistry` 内存持有的 storage domain，手改文件会被它写回覆盖。
* **顺序：先注册表、后文件**。中途崩溃只会留下孤儿文件（重删一次就干净），
  不会留下指向不存在会话的僵死 id。
* ** detachment 对全部工作区兜底重试**：`detachSession` 是幂等 no-op
  （写链 sentinel 直接中止，不产生落盘写），一次全试可以顺带清掉被
  cwd 过滤挡在视野外的 dormant 记账号。
* **降级**：`sessionQuery` / connection 缺席时插件事不崩，只是对应接口
  退化（无标题 / 无 HTTP 出口）；headless / tui profile 下插件纯待机。

## 装法

在 profile 目录下用**绝对路径**安装（与其他组包一致）：

```bash
plugin_manager install_bundle D:\Project\dsplugin\session_manager
# 或者直接用包管理器：
pnpm add D:\Project\dsplugin\session_manager
```

装完组合包**默认启用**（installer 会把 `dsh-session-manager` 加进 profile
`package.json` 的 `dsh.profile.bundles` 并应用本包 patch 层）。装完重载界面
（桌面端切一下页面 / 重启 App），设置 → 会话管理 即可使用。

- 版本要求：`engines.dsh = >=0.2.0-rc.2 <0.3.0`（不满足时 DSH 会把插件行强制停用）。
- 调试横幅：`DSH_SESSION_MANAGER_QUIET=1` 关闭启动日志。

## 已知边界

* 多 profile / 多机共享同一 `~/.dsh` 时，另一进程正打开的会话
  （不在本进程内存里）感知不到，删除后那边的页面下次读日志会失败——
  别同时开两个 dsh 实例做清理。
* 会话搜索索引（如日后启用 sqlite 查询后端）里的陈旧行要等宿主重建，
  不影响侧边栏与会话列表。
* 删除所引用的会话时**不**清理全局 attachments 仓库（`~/.dsh/attachments`，
  按内容寻址共享，没法按会话归属安全回收）。

## 测试

```bash
node test/host-logic.mjs     # host 半边端到端逻辑（桩服务 + 临时目录仿真布局，不碰真实 ~/.dsh）
node test/client-render.mjs  # 浏览器半边渲染冒烟（极简 React 桩跑 loading/error/ready 分支）
```

两个测试都不依赖网络与真实数据。`host-logic.mjs` 曾抓出过一个真 bug：
Node 的 `rm` 不带 `recursive` 对目录一律抛 EISDIR（不是 POSIX rmdir 语义），
导致空工作区目录永远收不走，最终改用 `rmdir`（ENOTEMPTY 天然防竞态）。

