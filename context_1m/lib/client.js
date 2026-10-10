window.__ModuleLoader__.load({
	id: "dsh-context-1m",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");

		//#region dsh-context-1m/client.css
		// 与 dsh-thinking-strength / dsh-multimodal 的勾选框一致：gap/height/字号/对齐/颜色/勾选框尺寸完全相同
		const css =
			".dcm-check{display:inline-flex;align-items:center;gap:6px;height:26px;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary,#5b6478);cursor:pointer}" +
			".dcm-check.dcm-check-on{color:var(--dsw-alias-state-business-primary,#3d7eff)}" +
			".dcm-check input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-state-business-primary,#3d7eff);cursor:pointer}";
		const tagId = "dsh-context-1m/client.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-context-1m";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region dsh-context-1m/client/index.js
		const h = react.createElement;
		const API_STATE = "/api/dsh-context-1m.state";
		const API_SET = "/api/dsh-context-1m.set";

		/**
		 * 输入框里的「1M 上下文」勾选框（渲染在 `conversation.input.right`）。
		 *
		 * 勾选状态 = 当前模型在 llm-pi-ai 配置（profile 的 cordis.patch.yml）里
		 * 是否声明了 `contextWindow`。勾上 → 自动往配置里写入 `contextWindow: 1000000`
		 * （1M token 上下文窗口）；取消 → 删除该字段，模型回到原来的上下文
		 * （适配器自带值，或 provider 的 `defaultContextWindow`）。
		 * 上下文容量 / 自动压缩会按声明值计算。
		 *
		 * 当前模型从 `useProjection("modelSelection")` 读：`next` 是刚在模型
		 * 选择器里选中（可能还没发消息）的 {provider, model}，切换模型时勾选框
		 * 立即跟随。**新对话（投影为空）时跟多模态插件一样，回退到宿主的默认
		 * 模型**：不带参数请求 /state，宿主用 agentDefaultModel 兜底。每次切换
		 * 都回读文件，状态按模型各自独立。
		 */
		function Context1mCheckbox({ useProjection }) {
			const selection = useProjection("modelSelection");
			const projected = selection?.next ?? selection?.lastUsed ?? null;
			// 新对话投影为空时，由宿主 `/state`（无参数）回填默认模型
			const [fallback, setFallback] = react.useState(null);
			const current = projected ?? fallback;

			const [has, setHas] = react.useState(false);
			const [busy, setBusy] = react.useState(false);
			const [loading, setLoading] = react.useState(false);
			const [error, setError] = react.useState(null);

			// 请求键：只依赖「投影里的模型」或「空（新会话）」，避免回填默认模型后再触发一轮
			const requestKey = projected ? projected.provider + "\u0000" + projected.model : "\u0000default";

			react.useEffect(() => {
				let cancelled = false;
				setLoading(true);
				setError(null);
				// 投影存在按模型查；新会话投影为空 → 不带参数，宿主用默认模型兜底
				const qs = projected
					? "provider=" + encodeURIComponent(projected.provider) + "&model=" + encodeURIComponent(projected.model)
					: "";
				fetch(API_STATE + (qs ? "?" + qs : ""), { cache: "no-store" })
					.then((r) => r.json())
					.then((d) => {
						if (cancelled) return;
						if (d && d.ok && d.provider && d.model) {
							setFallback({ provider: d.provider, model: d.model });
							setHas(!!d.has);
						} else {
							setError((d && d.error) || "读取失败");
						}
					})
					.catch(() => { if (!cancelled) setError("读取失败"); })
					.finally(() => { if (!cancelled) setLoading(false); });
				return () => { cancelled = true; };
			}, [requestKey]);

			const toggle = () => {
				if (!current || busy || loading) return;
				setBusy(true);
				setError(null);
				const enabled = !has;
				fetch(API_SET, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ provider: current.provider, model: current.model, enabled })
				})
					.then((r) => r.json())
					.then((d) => {
						if (d && d.ok) setHas(!!d.enabled);
						else setError((d && d.error) || "设置失败");
					})
					.catch(() => setError("设置失败"))
					.finally(() => setBusy(false));
			};

			if (!current || !current.provider || !current.model) return null;

			const title =
				error ||
				current.model +
					(has
						? " · 已声明 contextWindow=1,000,000（1M 上下文）"
						: " · 未声明 1M 上下文 · 勾选后写入 llm-pi-ai 配置");

			// 与思考/多模态插件一致：文字靠左、勾选框靠右，颜色/字号/对齐照搬
			return h(
				"span",
				{ className: "dcm-check" + (has ? " dcm-check-on" : ""), title: title },
				h("span", null, "1M"),
				h("input", {
					type: "checkbox",
					checked: has,
					disabled: busy || loading,
					onChange: toggle
				})
			);
		}

		const inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("conversation.input.right", () =>
				ctx.slots.register(
					{ name: "conversation.input.right", id: "context-1m", order: 21 },
					Context1mCheckbox
				)
			);
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});