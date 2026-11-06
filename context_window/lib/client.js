window.__ModuleLoader__.load({
	id: "dsh-context-window",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var reactDom = require("react-dom");

		//#region dsh-context-window/client.css
		const css =
			".dcw-wrap{display:inline-flex;align-items:center;height:26px}" +
			".dcw-btn{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1,#d6dbe3);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#ffffff);color:var(--dsw-alias-label-secondary,#5b6478);font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}" +
			".dcw-btn:hover{border-color:var(--dsw-alias-border-l2,#c2c9d6)}" +
			".dcw-btn:disabled{opacity:.5;cursor:default}" +
			".dcw-sep{color:#c2c9d6;padding:0 1px}" +
			".dcw-caret{font-size:10px;color:#aab2c0;width:12px;text-align:center;display:inline-block}" +
			".dcw-err{color:var(--dsw-alias-state-error-primary,#e5484d);font-size:11px;line-height:1;padding-left:4px}" +
			".dcw-pop{position:fixed;z-index:1200;width:288px;background:#ffffff;border:1px solid var(--dsw-alias-border-l1,#e8ecf2);border-radius:16px;box-shadow:0 6px 20px rgba(20,25,40,.10),0 1px 4px rgba(20,25,40,.05);padding:10px 12px 12px;color:var(--dsw-alias-label-primary,#20242c)}" +
			".dcw-head{display:flex;align-items:baseline;gap:8px;padding:2px 0 6px;font-size:12px;color:var(--dsw-alias-label-secondary,#5b6478);white-space:nowrap}" +
			".dcw-head b{font-size:13px;color:var(--dsw-alias-label-primary,#20242c);font-weight:600}" +
			".dcw-head span{overflow:hidden;text-overflow:ellipsis}" +
			".dcw-sub{padding:0 0 6px;font-size:11px;line-height:1;color:#aab2c0}" +
			".dcw-chips{display:flex;flex-wrap:wrap;gap:6px}" +
			".dcw-chip{height:24px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1,#d6dbe3);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#5b6478);font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}" +
			".dcw-chip:hover{border-color:var(--dsw-alias-border-l2,#c2c9d6);color:var(--dsw-alias-label-primary,#20242c)}" +
			".dcw-chip:disabled{opacity:.5;cursor:default}" +
			".dcw-chip.dcw-chip-on{border-color:var(--dsw-alias-state-business-primary,#3d7eff);color:var(--dsw-alias-state-business-primary,#3d7eff);font-weight:600}" +
			".dcw-note{padding-top:8px;font-size:11px;line-height:1.3;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dcw-note.dcw-note-err{color:var(--dsw-alias-state-error-primary,#e5484d)}" +
			".dcw-hint{padding-top:2px;font-size:11px;line-height:1.35;color:#aab2c0}";
		const tagId = "dsh-context-window/client.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-context-window";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region dsh-context-window/client/index.js
		const h = react.createElement;
		const container = document.body;
		const API_STATE = "/api/dsh-context-window.state";
		const API_SET = "/api/dsh-context-window.set";
		const POP_WIDTH = 288;
		const POP_HEIGHT = 288;

		/** 取值来源的中文说明（显示在标题/提示里）。 */
		const SOURCE_TEXT = {
			declared: "模型已声明",
			catalog: "目录默认",
			fallback: "适配器默认"
		};

		/**
		 * 输入框右侧的「上下文 · 输出」档位按钮。
		 *
		 * 按钮上显示的是**当前生效值**（宿主把模型声明 / 目录 / provider 默认依次
		 * 套完的结果），点开后的两段档位表来自宿主读的 `tiers.json`；点某一档就把
		 * 该值写进 llm-pi-ai 配置里当前模型的条目，点「默认」则删除声明。
		 * 当前模型从 `useProjection("modelSelection")` 读，切换模型立即跟随；
		 * 新对话投影为空时由宿主 `/state` 用默认模型回填。
		 */
		function ContextWindowControl({ useProjection }) {
			const selection = useProjection("modelSelection");
			const projected = selection?.next ?? selection?.lastUsed ?? null;
			const [fallback, setFallback] = react.useState(null);
			const current = projected ?? fallback;

			const [state, setState] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [error, setError] = react.useState(null);
			const [notice, setNotice] = react.useState(null);
			const [open, setOpen] = react.useState(false);
			const [pos, setPos] = react.useState(null);

			const btnRef = react.useRef(null);
			const popRef = react.useRef(null);
			const requestKey = projected ? projected.provider + "\u0000" + projected.model : "\u0000default";

			react.useEffect(() => {
				let cancelled = false;
				setError(null);
				setNotice(null);
				const qs = projected
					? "provider=" + encodeURIComponent(projected.provider) + "&model=" + encodeURIComponent(projected.model)
					: "";
				fetch(API_STATE + (qs ? "?" + qs : ""), { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => {
						if (cancelled) return;
						if (d && d.ok && d.provider && d.model) {
							setFallback({ provider: d.provider, model: d.model });
							setState(d);
						} else {
							setState(null);
							setError((d && d.error) || "读取失败");
						}
					})
					.catch(() => { if (!cancelled) setError("读取失败"); });
				return () => { cancelled = true; };
			}, [requestKey]);

			const place = react.useCallback(() => {
				const rect = btnRef.current === null ? null : btnRef.current.getBoundingClientRect();
				if (rect === null) return;
				// 量不到就用估值；能量到（弹层已挂载 / 内容变高）就用真实高度。
				const height = popRef.current === null ? POP_HEIGHT : popRef.current.offsetHeight;
				let left = rect.left;
				if (left + POP_WIDTH > window.innerWidth - 12) left = Math.max(12, window.innerWidth - POP_WIDTH - 12);
				let top = rect.bottom + 8;
				if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 18);
				setPos({ left: left, top: top });
			}, []);

			react.useEffect(() => {
				if (!open) return;
				const onDown = (event) => {
					if (btnRef.current !== null && btnRef.current.contains(event.target)) return;
					if (popRef.current !== null && popRef.current.contains(event.target)) return;
					setOpen(false);
				};
				const onMove = () => place();
				document.addEventListener("mousedown", onDown);
				window.addEventListener("scroll", onMove, true);
				window.addEventListener("resize", onMove);
				return () => {
					document.removeEventListener("mousedown", onDown);
					window.removeEventListener("scroll", onMove, true);
					window.removeEventListener("resize", onMove);
				};
			}, [open, place]);

			// 弹层挂载后 / 内容变高后（读到 state）再摆一次，用的是真实高度。
			react.useEffect(() => {
				if (open) place();
			}, [open, place, state]);

			const apply = (changes, clearError = true) => {
				if (!current || busy) return;
				setBusy(true);
				if (clearError) setError(null);
				setNotice(null);
				fetch(API_SET, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ provider: current.provider, model: current.model, ...changes })
				})
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) {
							setState(d);
							setNotice(d.notice ?? null);
						} else {
							setError((d && d.error) || "设置失败");
						}
					})
					.catch(() => setError("设置失败"))
					.finally(() => setBusy(false));
			};

			if (!current || !current.provider || !current.model) return null;

			const context = state?.context;
			const output = state?.output;
			const label = state === null
				? "上下文"
				: context.label + " · " + output.label;
			const sourceOf = (capacity) => SOURCE_TEXT[capacity.source] ?? capacity.source;
			const title = error
				|| (state === null
					? current.model + " · 上下文 / 输出档位"
					: current.model
						+ " · 上下文 " + context.label + "（" + sourceOf(context) + "）"
						+ " · 输出 " + output.label + "（" + sourceOf(output) + "）");

			const row = (kind, capacity, tiers) => {
				const declaredKey = capacity.declared === undefined ? null : capacity.declared;
				const writable = state?.writable !== false;
				return h("div", { key: "row-" + kind }, [
					h("div", { key: "head", className: "dcw-head" }, [
						h("b", { key: "t" }, kind === "context" ? "上下文" : "输出"),
						h("span", { key: "v" }, "当前 " + capacity.label + " · " + sourceOf(capacity))
					]),
					h("div", { key: "chips", className: "dcw-chips" }, tiers.map((tier, i) => h("button", {
						key: kind + "-" + i,
						type: "button",
						className: "dcw-chip" + (tier.value === declaredKey ? " dcw-chip-on" : ""),
						disabled: busy || !writable,
						title: tier.value === null
							? "删除声明，回到" + sourceOf({ source: "fallback" }) + "（" + capacity.value + " tokens 之上由适配器决定）"
							: tier.value.toLocaleString("en-US") + " tokens",
						onClick: () => apply(kind === "context" ? { contextWindow: tier.value } : { maxTokens: tier.value })
					}, tier.label)))
				]);
			};

			/** 一次点到位的「上下文 + 输出」组合。 */
			const presetRow = (snapshot) => {
				const presets = snapshot.presets ?? [];
				if (presets.length === 0) return null;
				const writable = snapshot.writable !== false;
				const declaredContextKey = snapshot.context.declared === undefined ? null : snapshot.context.declared;
				const declaredOutputKey = snapshot.output.declared === undefined ? null : snapshot.output.declared;
				return h("div", { key: "presets" }, [
					h("div", { key: "sub", className: "dcw-sub" }, "快速组合"),
					h("div", { key: "chips", className: "dcw-chips" }, presets.map((preset, i) => h("button", {
						key: "preset-" + i,
						type: "button",
						className: "dcw-chip" + (preset.context === declaredContextKey && preset.maxTokens === declaredOutputKey ? " dcw-chip-on" : ""),
						disabled: busy || !writable,
						title: "上下文 " + (preset.context === null ? "默认" : preset.context.toLocaleString("en-US"))
							+ " · 输出 " + (preset.maxTokens === null ? "默认" : preset.maxTokens.toLocaleString("en-US")),
						onClick: () => apply({ contextWindow: preset.context, maxTokens: preset.maxTokens })
					}, preset.label))),
					h("div", { key: "gap", style: { height: "12px" } })
				]);
			};

			const popup = open
				? reactDom.createPortal(
					h("div", {
						ref: popRef,
						className: "dcw-pop",
						style: pos === null ? { visibility: "hidden", left: 0, top: 0 } : { left: pos.left + "px", top: pos.top + "px" }
					}, [
						state === null
							? h("div", { key: "empty", className: "dcw-note" }, error || "读取中…")
							: h("div", { key: "body" }, [
								presetRow(state),
								row("context", context, state.tiers.context),
								h("div", { key: "gap", style: { height: "10px" } }),
								row("output", output, state.tiers.output),
								state.writable === false
									? h("div", { key: "ro", className: "dcw-note dcw-note-err" }, "该模型不在 llm-pi-ai 配置里，无法写档位：" + (state.reason ?? "未知原因"))
									: null
							]),
						notice ? h("div", { key: "notice", className: "dcw-note" }, notice) : null,
						error && state !== null ? h("div", { key: "err", className: "dcw-note dcw-note-err" }, error) : null,
						h("div", { key: "hint", className: "dcw-hint" }, "档位表与「快速组合」都来自插件目录的 tiers.json；「默认」= 删除声明，回到适配器默认。")
					]),
					container
				)
				: null;

			return h("span", { className: "dcw-wrap" }, [
				h("button", {
					key: "btn",
					ref: btnRef,
					type: "button",
					className: "dcw-btn",
					title: title,
					disabled: busy,
					onClick: () => {
						if (open) { setOpen(false); return; }
						place();
						setOpen(true);
					}
				}, [
					label,
					h("span", { key: "caret", className: "dcw-caret" }, open ? "▲" : "▼")
				]),
				error ? h("span", { key: "err", className: "dcw-err", title: error }, "!") : null,
				popup
			]);
		}

		const inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("conversation.input.right", () =>
				ctx.slots.register(
					{ name: "conversation.input.right", id: "context-window", order: 21 },
					ContextWindowControl
				)
			);
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
