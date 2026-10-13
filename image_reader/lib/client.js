window.__ModuleLoader__.load({
	id: "dsh-image-reader",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		//#region dsh-image-reader/client.css
		/**
		 * 样式：一套 dsir- 前缀（dsh-image-reader），颜色全部引用 dsh 主题的
		 * --dsw-* 变量并带兜底值，明暗主题自动跟随；布局按「设置面板内容列」
		 * 约 560px 宽的尺寸做。结构与 dsh-session-manager 的 dshm-* 同族。
		 */
		const css =
			".dsir-root{display:flex;flex-direction:column;gap:12px;min-height:100%;font-family:inherit;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary,#1b2130)}" +
			".dsir-card{display:flex;flex-direction:column;gap:8px;padding:11px 13px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.12));border-radius:10px;background:var(--dsw-alias-fill-l1,rgba(22,32,58,.035))}" +
			".dsir-cardTitle{font-weight:600}" +
			".dsir-muted{color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dsir-fine{font-size:11.5px;color:var(--dsw-alias-label-tertiary,#8a93a8);line-height:1.8}" +
			".dsir-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}" +
			".dsir-label{flex:none;width:86px;font-size:12px;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dsir-select{flex:1;min-width:200px;max-width:420px;height:28px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.18));border-radius:7px;background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,#1b2130);font:inherit;font-size:12px;outline:none}" +
			".dsir-input{width:110px;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.18));border-radius:7px;background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,#1b2130);font:inherit;font-size:12px;outline:none;font-variant-numeric:tabular-nums}" +
			".dsir-input:focus,.dsir-select:focus{border-color:var(--dsw-alias-state-business-primary,#3d7eff)}" +
			".dsir-btn{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.18));border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#5b6478);font:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}" +
			".dsir-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1b2130);border-color:rgba(22,32,58,.35)}" +
			".dsir-btn:disabled{opacity:.45;cursor:default}" +
			".dsir-bad{color:var(--dsw-alias-state-error-primary,#e5484d)}" +
			".dsir-ok{color:var(--dsw-alias-state-success-primary,#34a853)}" + 
			".dsir-warn{color:var(--dsw-alias-state-warning-primary,#d97706)}" +
			".dsir-monospace{font-family:ui-monospace,Consolas,'Courier New',monospace}" +
			".dsir-code{font-family:ui-monospace,Consolas,'Courier New',monospace;font-size:11.5px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.12));border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-secondary,#5b6478);word-break:break-all;white-space:pre-wrap}";
		const tagId = "dsh-image-reader/client.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-image-reader";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region dsh-image-reader/client/index.js
		/**
		 * 设置页「图像解读」：给纯文本模型配一双借来的眼睛。
		 *
		 * 这页只做三件事（数据都从宿主半边的 connection 接口拿）：
		 *   1. 选「视觉模型」——候选列表由宿主按模型声明（inputModalities 含
		 *      image）筛出；也可以完全交给自动选择；
		 *   2. 调工具显示策略（auto / always / never）与请求参数（maxTokens、
		 *      超时）；
		 *   3. 展示「当前生效」的视觉模型与常见问题说明。
		 *
		 * host 接口（同源 fetch，走 connection 鉴权通道）：
		 *   GET  /api/dsh-image-reader.catalog  → {ok, configured, resolved,
		 *        visibility, maxTokens, timeoutMs, revision, candidates[]}
		 *   POST /api/dsh-image-reader.config   → 发 patch，回新 catalog；
		 *        409 = revision 冲突（别处改过，刷新后重试）
		 */
		const API_CATALOG = "/api/dsh-image-reader.catalog";
		const API_CONFIG = "/api/dsh-image-reader.config";
		const h = react.createElement;

		/** 超时的快捷档位（毫秒 SELECT）。 */
		const TIMEOUT_STEPS = [60000, 120000, 180000, 300000, 600000];

		function formatSeconds(ms) {
			if (!Number.isFinite(ms) || ms < 1000) return "—";
			const s = Math.round(ms / 1000);
			return s >= 60 ? Math.round((s / 60) * 10) / 10 + " 分钟" : s + " 秒";
		}

		/** 宿主返回的行对象 → 下拉框 value。
		 *  可别用 \u0000 之类的隐藏字符当拼接符：HTML 解析器会把 NUL 换成 U+FFFD，
		 *  取回来就 split 不开了。统一 encodeURIComponent 再用裸 "/" 连（编码后的
		 *  %2F 不会再撞分隔符）。 */
		const rowKey = (row) => encodeURIComponent(row.provider) + "/" + encodeURIComponent(row.model);

		function ImageReaderSection() {
			const [data, setData] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [note, setNote] = react.useState(null);

			const load = react.useCallback(async () => {
				setBusy(true);
				try {
					const response = await fetch(API_CATALOG, { cache: "no-store" });
					const payload = await response.json();
					if (payload.ok !== true) throw new Error(payload.error || "宿主接口返回失败");
					setData(payload);
					setError(null);
				} catch (e) {
					setError(String(e && e.message ? e.message : e));
				} finally {
					setBusy(false);
				}
			}, []);

			react.useEffect(() => {
				load();
			}, [load]);

			/** 现读 revision → 写 patch → 直接采纳返回的新 catalog。 */
			const save = react.useCallback(async (patch, successNote) => {
				setBusy(true);
				setNote(null);
				try {
					const response = await fetch(API_CONFIG, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(patch)
					});
					const payload = await response.json();
					if (response.status === 409) {
						setNote({ kind: "bad", text: "配置在别处被修改过，已为你刷新，请再试一次" });
						await load();
						return;
					}
					if (payload.ok !== true) throw new Error(payload.error || "写入失败");
					setData(payload);
					setError(null);
					setNote(typeof successNote === "string" ? { kind: "ok", text: successNote } : null);
				} catch (e) {
					setNote({ kind: "bad", text: "保存失败：" + String(e && e.message ? e.message : e) });
				} finally {
					setBusy(false);
				}
			}, [load]);

			const configuredKey = data !== null && data.configured !== null ? rowKey(data.configured) : "auto";
			const resolved = data !== null && data.resolved !== undefined ? data.resolved : undefined;
			const resolvedError = resolved != null && typeof resolved === "object" && resolved.error !== undefined ? resolved.error : null;

			const modelSelect =
				data === null
					? h("span", { className: "dsir-muted" }, "载入中…")
					: h(
							"select",
							{
								className: "dsir-select",
								value: configuredKey,
								disabled: busy,
								onChange: (e) => {
									if (e.target.value === "auto") {
										save({ provider: "", model: "" }, "已改为自动选择视觉模型");
									} else {
										const slash = e.target.value.indexOf("/");
										const provider = decodeURIComponent(e.target.value.slice(0, slash));
										const model = decodeURIComponent(e.target.value.slice(slash + 1));
										save({ provider, model }, "视觉模型已保存");
									}
								}
							},
							h("option", { value: "auto" }, "自动（第一个声明支持图片输入的模型）"),
							(Array.isArray(data.candidates) ? data.candidates : []).map((row) =>
								h("option", { value: rowKey(row), key: rowKey(row) }, row.provider + "/" + row.model + (row.name !== row.model ? "（" + row.name + "）" : ""))
							)
					  );

			const candidatesCount = data !== null && Array.isArray(data.candidates) ? data.candidates.length : 0;

			const visibilityRow = h(
				"div",
				{ className: "dsir-row" },
				h("span", { className: "dsir-label" }, "工具显示"),
				data === null
					? h("span", { className: "dsir-muted" }, "载入中…")
					: h(
							"select",
							{
								className: "dsir-select",
								style: { maxWidth: 320 },
								value: data.visibility,
								disabled: busy,
								onChange: (e) => {
									const labels = {
										auto: "工具将按当前模型的声明自动出现/隐藏",
										always: "工具对所有会话常驻显示",
										never: "工具已对模型隐藏"
									};
									save({ visibility: e.target.value }, labels[e.target.value]);
								}
							},
							h("option", { value: "auto" }, "自动（推荐）：当前模型不支持图片输入时才出现"),
							h("option", { value: "always" }, "总是显示"),
							h("option", { value: "never" }, "不显示（关闭功能）")
					  ),
				h(
					"span",
					{ className: "dsir-fine" },
					"依据是模型声明的 inputModalities；切到支持图片的模型后工具会自动从工具列表里消失。"
				)
			);

			const tokensRow = h(
				"div",
				{ className: "dsir-row" },
				h("span", { className: "dsir-label" }, "maxTokens"),
				h("input", {
					className: "dsir-input",
					type: "number",
					min: 256,
					max: 65536,
					step: 128,
					defaultValue: data !== null ? data.maxTokens : 32768,
					key: "tokens-" + (data !== null ? data.maxTokens : "x") + "-" + (data !== null ? data.revision : "x"),
					disabled: busy,
					onBlur: (e) => {
						const next = Math.max(256, Math.min(65536, Math.floor(Number(e.target.value) || 32768)));
						if (data !== null && next === data.maxTokens) return;
						save({ maxTokens: next }, null);
					}
				}),
				h("span", { className: "dsir-fine" }, "视觉模型单次回答的输出上限，截断会在结果里标注。")
			);

			const timeoutRow = h(
				"div",
				{ className: "dsir-row" },
				h("span", { className: "dsir-label" }, "超时"),
				data === null
					? h("span", { className: "dsir-muted" }, "载入中…")
					: h(
							"select",
							{
								className: "dsir-select",
								style: { maxWidth: 200 },
								value: TIMEOUT_STEPS.indexOf(data.timeoutMs) >= 0 ? String(data.timeoutMs) : "custom",
								disabled: busy,
								onChange: (e) => {
									if (e.target.value === "custom") return;
									save({ timeoutMs: Number(e.target.value) }, null);
								}
							},
							TIMEOUT_STEPS.map((ms) => h("option", { value: String(ms), key: ms }, formatSeconds(ms))),
							h("option", { value: "custom" }, "自定义：" + formatSeconds(data.timeoutMs))
					  ),
				h("span", { className: "dsir-fine" }, "视觉请求的整体超时；被用户中止也会一并生效。")
			);

			const resolvedCard = h(
				"div",
				{ className: "dsir-card" },
				h("div", { className: "dsir-cardTitle" }, "当前生效的视觉模型"),
				resolvedError !== null
					? h("div", { className: "dsir-bad" }, resolvedError)
					: resolved != null && typeof resolved.provider === "string" && typeof resolved.model === "string"
						? h(
								"div",
								{ className: "dsir-row" },
								h("span", { className: "dsir-monospace" }, resolved.provider + "/" + resolved.model),
								resolved.auto === true ? h("span", { className: "dsir-warn" }, "（自动选择）") : h("span", { className: "dsir-ok" }, "（手动指定）")
							)
						: h("span", { className: "dsir-muted" }, "载入中…"),
				h(
					"div",
					{ className: "dsir-fine" },
					"候选共 " + candidatesCount + " 个（宿主按「模型声明 inputModalities 含 image」筛出），下拉框里可换；手写的 llm-pi-ai 路由模型需要先用「模型多模态开关」(dsh-multimodal) 勾选「图片」后才会出现在候选里。"
				)
			);

			const usageCard = h(
				"div",
				{ className: "dsir-card" },
				h("div", { className: "dsir-cardTitle" }, "模型怎么用它"),
				h(
					"div",
					{ className: "dsir-fine" },
					"当前模型不支持看图时，工具 ",
					h("b", { className: "dsir-monospace" }, "read_image_details"),
					" 会出现：模型把「图片 + 想了解的问题」交给上面选的视觉模型，再把答案原样带回。图片支持四种写法：",
					h("br", null),
					"① 本地/工作区路径（相对路径按会话工作目录） ② http(s) URL ③ data:URL（base64） ④ attachment:sha256 摘要（找回会话里被省略的图）"
				),
				h("div", { className: "dsir-code" }, "read_image_details(image: \"D:/shots/login.png\", question: \"「提交」按钮中心的像素坐标是多少？\")")
			);

			const foot =
				error !== null
					? h("div", { className: "dsir-bad" }, "加载失败：" + error + "（宿主半边未启用？）")
					: note !== null
						? h("div", { className: note.kind === "ok" ? "dsir-ok" : "dsir-bad" }, note.text)
						: h("span", null);

			return h(
				"div",
				{ className: "dsir-root" },
				h(
					"div",
					{ className: "dsir-card" },
					h("div", { className: "dsir-cardTitle" }, "视觉模型（替身眼睛）"),
					h("div", { className: "dsir-row" }, h("span", { className: "dsir-label" }, "模型选择"), modelSelect),
					visibilityRow,
					tokensRow,
					timeoutRow,
					h("div", { className: "dsir-row" }, h("span", { className: "dsir-label" }), h("button", { type: "button", className: "dsir-btn", disabled: busy, onClick: load }, busy ? "处理中…" : "刷新"))
				),
				resolvedCard,
				usageCard,
				foot
			);
		}

		/** 客户端半边只依赖插槽注册表（settings.section 由设置壳声明）。 */
		const inject = ["slots"];

		/** 错误边界：本节点的渲染异常只降级成一张错误卡片——
		 *  绝不让异常沿 React 树冒泡炸掉整个设置壳（白屏的教训）。 */
		class SectionBoundary extends react.Component {
			constructor(props) {
				super(props);
				this.state = { failed: null };
			}
			static getDerivedStateFromError(error) {
				return { failed: String(error && error.message ? error.message : error) };
			}
			componentDidCatch(error) {
				// 控制台留痕，devtools 里能看到根因
				console.error("[image-reader] 设置节点渲染异常：", error);
			}
			render() {
				if (this.state.failed !== null) {
					return h(
						"div",
						{ className: "dsir-card" },
						h("div", { className: "dsir-cardTitle" }, "图像解读设置渲染出错"),
						h("div", { className: "dsir-bad" }, this.state.failed),
						h("div", { className: "dsir-fine" }, "其它设置页不受影响；刷新页面或插件修复后自动恢复。")
					);
				}
				return this.props.children;
			}
		}

		function apply(ctx) {
			ctx.slots.inject(
				"settings.section",
				() =>
					ctx.slots.register(
						{
							name: "settings.section",
							id: "image-reader",
							order: 26,
							label: "图像解读"
						},
						function BoundedImageReaderSection(props) {
							return h(SectionBoundary, null, h(ImageReaderSection, props));
						}
					)
			);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
