# dsh-image-reader —— 给纯文本模型加一双「借来的眼睛」

当前模型（按**模型声明**判断）不支持图片输入时，自动给会话注入 `read_image_details`
工具。模型把「图片 + 需要了解的信息」交给这个工具，插件把图片转发给设置面板指定的
**多模态视觉模型**，再把视觉模型的回答原样带回来。

典型场景：默认模型 `ctai_my/glm-5.3`（text-only）收到一张登录截图，要找「提交」
按钮的坐标 —— 它调用：

```
read_image_details(
  image: "D:/shots/login.png",
  question: "「提交」按钮中心的像素坐标是多少？"
)
```

插件用配置好的视觉模型（比如 `opencodezen/space-bunny-free`，声明了
`input: [text, image]`）解读图片，回到 glm-5.3 手里的就是：
*"提交」按钮中心在 1280x720 请求图的 (512, 344)"* —— 任务继续。

## 工作原理

```
┌────────────┐  贴图被宿主投影成占位文本        ┌─────────────────┐
│ 纯文本模型  │ ──── read_image_details ─────▶ │ dsh-image-reader │
│ (glm-5.3)  │                               │  (host 半边)      │
└────────────┘ ◀── 答案(render 文本) ─────── └────────┬────────┘
                                                    │ saveImage →
                                                    │ llm.stream(image+question)
                                                    ▼
                                            ┌────────────────┐
                                            │ 多模态视觉模型   │
                                            │ (设置面板里选)  │
                                            └────────────────┘
```

* **可见性自动跟随**：每步请求前由 `system-prompt/assemble` waterfall 判断当前会话
  路由到的模型（`modelSelection` 投影 pending → 上次请求头 → agent options → 默认
  模型，与宿主同一优先级）—— 按声明不支持看图就显示工具；模型自己能看图就把它从
  这一步的工具列表里摘掉。切模型实时生效，不用重启。
  * `visibility = always` 可以强制常驻，`never` 可以隐藏（等于关功能），`auto` 是默认。
* **配置热生效**：设置写的都是 volatile 字段，经 settings 服务落在本条目的 profile
  patch 里；工具执行与可见性判断每次现读，不依赖 apply 时的快照。
* **视觉用量计入 dsh-usage**：每次视觉桥接拿到 usage 后，经宿主事件 `dsh-usage/report`
  上报（`{provider, model, usage}`）。视觉请求是**直接 `ctx.llm.stream()`、不经 agent
  loop**，会话里没有 assistant/message 结算事件，usage 插件常规读日志统计不到；主动
  上报后它由 dsh-usage 的 recordExternal() 归到视觉模型名下。上报尽力而为：没有 usage
  就不报，宿主没装 dsh-usage 时 `ctx.emit` 无副作用。

## 图片的四种传法

| 写法 | 说明 |
| --- | --- |
| `D:/shots/a.png`、`screenshots/b.png` | 本地/工作区路径，相对路径按会话 cwd 解析 |
| `https://…/pic.jpg` | http(s) URL（30s 超时，大小按附件限额） |
| `data:image/png;base64,…` | 完整 data:URL |
| `attachment:sha256:ab12cd34` | 从占位文本 `[image omitted …; attachment sha256:ab12cd34]` 里抄摘要，找回会话里**已经被省略的那张图**直接复用 |

来源无论哪种都会先魔数嗅探真实格式（png/jpeg/webp/gif），再经
`attachments.saveImage()` 归一落库成持久附件引用，视觉请求里手机会看到缩放后的
request 图——所以给视觉模型的系统提示要求坐标按 request 尺寸回答，工具结果里
同时带原图尺寸以便换算。

## 设置面板（设置 → 图像解读）

* **视觉模型**：下拉列出所有**声明支持图片输入**的模型；选「自动」= 第一个满足
  条件的。手写的 llm-pi-ai 路由模型（如 `ctai_my/glm-5.3` 的 `merge` 路由）要先
  用「模型多模态开关」插件勾上「图片」，才会进候选。
* **工具显示**：auto / always / never。
* **maxTokens**（默认 32768）与**超时**（默认 180s）：视觉请求参数。

## 文件

```
image-reader.mjs    host 半边：工具注册、每步可见性过滤、视觉桥接、设置 API
lib/client.js       Web 客户端半边：设置 → 图像解读 页面
cordis.patch.yml    profile 补丁片段（条目 id: dsh-image-reader = settings ns）
locale/{zh,en}.json 插件清单的描述文案
```

## 安装

工作区其余插件同款：把 `dsh-image-reader` 以 `link:` 挂进 desktop profile 的
`package.json`（dependencies + `dsh.profile.bundles`），跑一次 `pnpm install`，
然后**重启 DeepSeek Harness Desktop**。

> 「重启」不是客套：dsh-app-boot 的 profile-resolution-bootstrap 在开机时把
> profile 的每个 `link:` 依赖的**解析路由**固化成内存表，运行中新增的链接
> 目录在宿主进程里解析不到宿主安装树（`@deepseek-ai/*` 裸说明符 →
> MODULE_NOT_FOUND → "failed to import"）。dshm 一族的老插件没这问题，因为
> 它们都是开机时就在表里。运行中想验证装没装好：设置 → 插件 里看
> `dsh-image-reader` 是否 active，或看 service.log 里有没有
> `[dsh-image-reader] 就绪` 的横幅。

CLI 里 `dsh plugin add link:D:/Project/dsplugin/image_reader` 也可以（首次
添加同样要重启一次才生效）。

## 实现笔记（对过宿主源码的事实）

* `llm.stream()` 的图片内容块是 `{type:'image', attachment: ImageAttachmentRef}`；
  pi-ai adapter 自己会 `readImageRequest()` 取 base64，插件只负责把图存成持久引用。
* 模型读到的工具输出是 `output.render()` 的文本块，视觉模型的答案 **完整**放在
  render 里（result.content），不走原始 value。
* 可见性挂在 agent.ctx 的 `system-prompt/assemble` waterfall 上（`installModelSelection`
  同款），失败时**保底显示**——判断挂了顶多多一次工具调用，不能让 agent 一步失败。
* `@deepseek-ai/*` 是宿主 shared package（desktop-runtime.json），插件模块里
  `import z from '@deepseek-ai/schemastery'` 等裸说明符由 profile-resolution-bootstrap
  路由到宿主安装树。**但每个被 import 的包名必须出现在本插件 package.json 的
  peerDependencies 里**（resolver.ts 的 routeLinked：对 linked 目录里的裸包请求，
  只有祖先 package.json 在 peerDependencies 里列了这个名字才拦到宿主条目，
  否则走 native 解析 → MODULE_NOT_FOUND → "failed to import"）。dshm 一族老
  插件没踩过这坑，因为它们全是零 import。本插件因此声明了 4 个 peer：
  cordis / schemastery / dsh-tools / dsh-llm（版本照宿主实测）。
* `defineTool` 的 `output.schema` 走**值 schema DSL**，不是标准 JSON Schema：
  `required` 是属性节点上的**布尔**（嵌套 object 节点自己也要 `required: true`），
  不存在 `required: ["a","b"]` 数组写法。写错了 `defineTool` 在 apply 时直接抛
  `JsonSchemaError: ... required must be true when present`。嵌套图片对象的
  正确写法照抄内置 read_image 的 `IMAGE_VALUE_SCHEMA`（dsh-tool-fs）。
* **改完宿主半边代码必须重启桌面版**：linked 插件目录（D:/Project/...）不在
  dsh-hmr 的 watch root 里（watch root 是 profile 目录，且 ignore `**/node_modules`），
  热替换够不着；宿主 Node 的 ESM 模块缓存一直持着旧代码，`set_plugin` 反复
  开关只会反复执行**旧模块**的 apply。重启 = 唯一可靠的加载方式。
* **客户端半边改动不用重启**：dsh-client-modules 按 stat 轮询盯每个客户端模块
  文件（含 linked 插件真实路径），变化即重读并经 SSE 推给 webview 热替换；
  白屏后保存修复文件，页面数秒内自愈（保险起见再 F5）。
* **settings.section 组件必须套错误边界**：设置壳没有分节错误隔离，任何
  section 组件的渲染异常（哪怕一个未定义标识符）都会**白屏整个设置页**。
  `node --check` 只查语法，抓不到 ReferenceError——幽灵变量（重构遗留的
  `resolvedKey`）只在特定渲染路径才评估：之前 GET 坏着、空数据路径恰好绕开
  它，GET 修好后首次踩雷白屏。本插件组件外已套 `SectionBoundary`
  （class componentDidCatch），节点异常只降级成卡片内错误提示。
* **渲染回归模拟器**：`Temp/dsh-src/dsh/render-test.mjs` 用桩 react（真渲染
  语义：函数组件=调用、类组件=new+render、hooks 带可写状态仓）把本组件在
  六种状态（载入中/成功/错误态/手动配置/防御路径/error 条）各渲染一遍；
  改 client.js 后跑一次，白屏级 bug 会在这里先炸出来。
* **connection.fetch 路由的 GET 也必须写 `requestBody: 'buffered'`**：bridge
  按「命中路由取 route.requestBody，缺省走流式」分派，流式分支会给 GET 挂上
  stream body，undici Request 构造器对 GET+body 直接抛 TypeError——handler
  崩溃、响应体一个字节都没写，前端表现为 `Unexpected end of JSON input`
  空响应（而不是报 404 'not found'，别被骗了）。dsh-multimodal 的
  「GET/POST 合一条路由 + requestBody:'buffered'」是安全写法。
* **宽容收割（tool-call 免疫）**：OpenCode zen 一类「代理网关背后的模型」
  间歇性带着服务端自家工具栈，响应里会混进 tool-call 块（实测 space-bunny-free
  时好时坏；同一路由纯 curl 干净、插件请求偶发 tool-call）。askVisionModel
  不再一票否决：文本非空就照常返回并附一行备注；只在「只有 tool-call、
  没有文本」时报网关异常，交给调用方重试或换候选模型。
