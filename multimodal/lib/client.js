window.__ModuleLoader__.load({
	id: "dsh-multimodal",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");

		//#region dsh-multimodal/client.css
		const css =
			".dsm-check{display:inline-flex;align-items:center;gap:6px;height:26px;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dsm-check.dsm-check-on{color:var(--dsw-alias-state-business-primary,#3d7eff)}" +
			".dsm-check input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-state-business-primary,#3d7eff);cursor:pointer}";
		const tagId = "dsh-multimodal/client.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-multimodal";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region dsh-multimodal/client/index.js
		const h = react.createElement;
		const API = "/api/model.multimodal";

		// 共享缓存：routes + 默认模型。勾选框重挂载（切换会话）时复用，避免重复请求、保持状态一致。
		const EMPTY = { routes: [], default: null };
		const G = (typeof window !== "undefined" && window.__dshMultimodal) || (typeof window !== "undefined" ? (window.__dshMultimodal = { subs: [] }) : { subs: [] });
		function setData(data) {
			G.data = { routes: (data && data.routes) || [], default: (data && data.default) || null };
			(G.subs || []).slice().forEach((cb) => { try { cb(); } catch { /* ignore */ } });
		}
		function subscribeData(cb) {
			G.subs = G.subs || [];
			G.subs.push(cb);
			return () => { const i = G.subs.indexOf(cb); if (i >= 0) G.subs.splice(i, 1); };
		}
		function useData() {
			return react.useSyncExternalStore(subscribeData, () => G.data || EMPTY, () => null);
		}
		async function refreshData() {
			try {
				const data = await (await fetch(API, { cache: "no-store" })).json();
				if (data && data.ok) setData(data);
			} catch { /* ignore */ }
		}
		async function toggleRoute(route, modelId, image) {
			try {
				const data = await (await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ route, modelId, image }) })).json();
				if (data && data.ok) setData(data);
				return !!(data && data.ok);
			} catch { return false; }
		}
		function flagOf(routes, route, modelId) {
			const r = (routes || []).find((x) => x.route === route);
			const m = r ? (r.models || []).find((x) => x.id === modelId) : null;
			return !!(m && m.image);
		}

		/**
		 * 输入框里的「多模态」勾选框（渲染在模型选择器左边，`conversation.input.right`）。
		 *
		 * 当前模型从 `useProjection("modelSelection")` 读：`next` 是刚在模型选择器里
		 * 选中（可能还没发消息）的 {provider, model}，所以切换模型时勾选框立即跟随。
		 * 勾选状态来自共享 routes 缓存（对应 settings.yaml 里该模型的 input），
		 * 勾/取消走 POST 写回 —— 因为状态按模型持久化，切换大模型后会自动带出该模型
		 * 自己的勾选结果（即「记住」）。
		 */
		function InputMultimodalToggle({ useProjection }) {
			const selection = useProjection("modelSelection");
			// 投影里有值（用户选过模型/发过请求）就用投影；新会话投影为空时退回默认模型
			const projected = selection?.next ?? selection?.lastUsed ?? null;
			const { routes, default: def } = useData();
			const current = projected ?? def ?? null;
			const [busy, setBusy] = react.useState(false);

			react.useEffect(() => {
				refreshData();
			}, []);

			if (!current || !current.provider || !current.model) return null;
			const image = flagOf(routes, current.provider, current.model);

			const toggle = () => {
				if (busy) return;
				setBusy(true);
				toggleRoute(current.provider, current.model, !image).finally(() => setBusy(false));
			};

			return h(
				"span",
				{
					className: "dsm-check" + (image ? " dsm-check-on" : ""),
					title: current.model + "：" + (image ? "已支持图片输入" : "纯文本")
				},
				h("span", null, "多模态"),
				h("input", { type: "checkbox", checked: image, disabled: busy, onChange: toggle })
			);
		}

		const inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("conversation.input.right", () =>
				ctx.slots.register(
					{ name: "conversation.input.right", id: "multimodal", order: 10 },
					InputMultimodalToggle
				)
			);
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
