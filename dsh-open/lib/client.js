window.__ModuleLoader__.load({
	id: "dsh-open",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var h = react.createElement;

		/** 本插件的文案命名空间。 */
		var NS = "dsh-open";
		var API_INFO = "/api/dsh-open.info";
		var API_ACT = "/api/dsh-open.act";
		var CSS_ID = "dsh-open/client.css";

		/**
		 * 样式：24px 高的发丝胶囊按钮，尺寸与配色对齐宿主文档标题栏里那排
		 * 圆角小控件（.split 是 24px、11px 字、0.5px 边框）。
		 * 颜色一律走主题 token（经 client Theme.listTokens 核对过名字），
		 * 不写死颜色，明暗主题自动跟随。
		 */
		var CSS =
			".dsho-btn{display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;height:24px;flex:none;align-self:center;padding:3px 7px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:11px;line-height:16px;white-space:nowrap;cursor:pointer}" +
			".dsho-btn.dsho-sq{padding:0;width:24px;justify-content:center}" +
			".dsho-btn:hover:not(:disabled){border-color:var(--dsw-alias-label-secondary)}" +
			".dsho-btn:disabled{opacity:.5;cursor:default}" +
			".dsho-btn.dsho-bad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}" +
			".dsho-icon{display:block;flex:none}";

		var zh = {
			"action.openIn": "用 {name} 打开",
			"action.openPlain": "用系统默认工具打开",
			"action.revealIn": "在 {name} 中显示",
			"action.revealPlain": "在文件管理器中显示",
			"action.busy": "打开中…",
			"action.failed": "打开失败"
		};
		var en = {
			"action.openIn": "Open with {name}",
			"action.openPlain": "Open with the system default",
			"action.revealIn": "Show in {name}",
			"action.revealPlain": "Show in the file manager",
			"action.busy": "Opening…",
			"action.failed": "Open failed"
		};

		/** 默认文件管理器的探测结果只取一次，多个按钮共用同一个 promise。 */
		var openerPromise;
		function opener() {
			if (openerPromise === undefined) {
				openerPromise = fetch(API_INFO, { cache: "no-store" })
					.then(function (response) { return response.json(); })
					.then(function (payload) {
						return payload && payload.ok === true && payload.opener ? payload.opener : { kind: "system", label: "" };
					})
					.catch(function () { return { kind: "system", label: "" }; });
			}
			return openerPromise;
		}

		/** 订阅探测结果；拿不到就返回 null，按钮退化成通用文案。 */
		function useOpenerName() {
			var pair = react.useState(null);
			var name = pair[0], setName = pair[1];
			react.useEffect(function () {
				var alive = true;
				opener().then(function (value) { if (alive) setName(value.label || null); });
				return function () { alive = false; };
			}, []);
			return name;
		}

		/**
		 * 打开按钮：mode='open' 打开目标（文件夹 → 默认文件管理器），
		 * mode='reveal' 在默认文件管理器中定位并选中。
		 * 失败时按钮转红并把失败原因放进 tooltip，8 秒后自行复位。
		 */
		function OpenButton(props) {
			var mode = props.mode;
			var path = props.absolutePath;
			var t = props.t;
			var compact = props.compact === true;
			var name = useOpenerName();
			var statusPair = react.useState("idle");
			var status = statusPair[0], setStatus = statusPair[1];
			var errorPair = react.useState(null);
			var error = errorPair[0], setError = errorPair[1];

			var label = mode === "reveal"
				? (name === null ? t("action.revealPlain") : t("action.revealIn", { name: name }))
				: (name === null ? t("action.openPlain") : t("action.openIn", { name: name }));
			var tip = status === "failed" && error !== null
				? t("action.failed") + "：" + error
				: label;

			var onClick = react.useCallback(function () {
				if (typeof path !== "string" || path.length === 0) return;
				setStatus("busy");
				setError(null);
				fetch(API_ACT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ path: path, mode: mode })
				})
					.then(function (response) {
						return response.json().catch(function () { return null; }).then(function (payload) {
							if (payload === null || payload.ok !== true) {
								throw new Error(payload && payload.error ? payload.error : "HTTP " + response.status);
							}
							return payload;
						});
					})
					.then(function () { setStatus("idle"); })
					.catch(function (failure) {
						var message = String(failure && failure.message ? failure.message : failure);
						console.error("[dsh-open] 打开失败：", message);
						setStatus("failed");
						setError(message);
						window.setTimeout(function () {
							setStatus(function (current) { return current === "failed" ? "idle" : current; });
						}, 8000);
					});
			}, [path, mode]);

			// owner 还没拿到宿主路径时，这个 cell 不该出现任何东西。
			if (typeof path !== "string" || path.length === 0) return null;

			var glyph = mode === "reveal"
				? h("circle", { cx: 8, cy: 9, r: 2.2, fill: "none", stroke: "currentColor", strokeWidth: "1.3" })
				: h("path", {
					d: "M6.6 10.4 10.4 6.6m0 0H7.9m2.5 0v2.5",
					fill: "none", stroke: "currentColor", strokeWidth: "1.3",
					strokeLinecap: "round", strokeLinejoin: "round"
				});

			return h(
				"button",
				{
					type: "button",
					className: "dsho-btn" + (compact ? " dsho-sq" : "") + (status === "failed" ? " dsho-bad" : ""),
					title: tip,
					"aria-label": tip,
					disabled: status === "busy",
					onClick: onClick,
					"data-dsh-open": mode
				},
				h(
					"svg",
					{ className: "dsho-icon", viewBox: "0 0 16 16", width: 14, height: 14, "aria-hidden": "true" },
					h("path", {
						d: "M1.9 3.6c0-.7.56-1.26 1.26-1.26h2.62c.4 0 .78.19 1.02.51l.73.97h5.32c.7 0 1.26.56 1.26 1.26v7.02c0 .7-.56 1.26-1.26 1.26H3.16c-.7 0-1.26-.56-1.26-1.26V3.6Z",
						fill: "none", stroke: "currentColor", strokeWidth: "1.3"
					}),
					glyph
				),
				// 紧凑模式（对话页头那种一排小图标的地方）只留图标，文案进 tooltip。
				compact ? null : h("span", null, status === "busy" ? t("action.busy") : label)
			);
		}

		/** 文档预览标题栏：在默认文件管理器中定位并选中这个文件。 */
		function FileReveal(props) {
			return h(OpenButton, { absolutePath: props.absolutePath, mode: "reveal", t: props.t });
		}

		/** 文件树标题栏：用默认文件管理器打开这个工作区目录。 */
		function DirectoryOpen(props) {
			return h(OpenButton, { absolutePath: props.absolutePath, mode: "open", t: props.t });
		}

		/**
		 * 对话页头：用默认文件管理器打开当前会话的工作区目录。
		 * 这个 slot 不给 owner props，只注入标准 session props —— 官方那个「打开文件夹」
		 * 单元格就是这么取到目录的（`useSessions(s => s.byId[sessionId]?.cwd)`），
		 * 但它的 open 动作走宿主 `openWorkspacePath`，而宿主在 Windows 上硬编码
		 * explorer.exe，所以永远开资源管理器。这里改成走本插件的探测/分派。
		 */
		function SessionDirectoryOpen(props) {
			// 这个 slot 的 `useSessions` 由标准 session props 注入。真拿不到时不渲染，
			// 而不是调用一个 undefined 把整格炸掉；判断结果在多次渲染间稳定，
			// 所以下面那个组件里的 hook 调用次数始终一致（不违反 hooks 规则）。
			if (typeof props.useSessions !== "function") return null;
			return h(SessionDirectoryOpenReady, props);
		}

		/** 拿到标准 props 之后的实际渲染体。 */
		function SessionDirectoryOpenReady(props) {
			var cwd = props.useSessions(function (state) {
				var row = state.byId[props.sessionId];
				return row === undefined ? undefined : row.cwd;
			});
			if (typeof cwd !== "string" || cwd.length === 0) return null;
			return h(OpenButton, { absolutePath: cwd, mode: "open", compact: true, t: props.t });
		}

		/**
		 * 资源登记：ctx.effect 在本运行时里不保证存在（whale_title 同样做了存在性
		 * 判断），有就用它拿到卸载清理，没有就直接执行——绝不能因为一个可选 API
		 * 抛异常而让整个 apply 失败、按钮全都不出现。
		 */
		function useEffect(ctx, fn, label) {
			if (ctx && typeof ctx.effect === "function") {
				ctx.effect(fn, label);
				return;
			}
			fn();
		}

		function apply(ctx) {
			useEffect(ctx, function () {
				if (!ctx.locale || typeof ctx.locale.register !== "function") return function () {};
				return ctx.locale.register(NS, { zh: zh, en: en });
			}, "dsh-open: dictionaries");

			useEffect(ctx, function () {
				if (typeof document === "undefined") return function () {};
				if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") !== null) return function () {};
				var tag = document.createElement("style");
				tag.dataset.plugin = NS;
				tag.dataset.pluginCss = CSS_ID;
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return function () { tag.remove(); };
			}, "dsh-open: styles");

			ctx.slots.inject("sidebar.right.tab.document.actions", function () {
				return ctx.slots.register({
					name: "sidebar.right.tab.document.actions",
					id: "dsh-open",
					order: 20,
					locale: NS
				}, FileReveal);
			});

			ctx.slots.inject("conversation.session.header.utilities", function () {
				return ctx.slots.register({
					name: "conversation.session.header.utilities",
					id: "dsh-open",
					order: 20,
					locale: NS
				}, SessionDirectoryOpen);
			});

			ctx.slots.inject("sidebar.right.tab.files.actions", function () {
				return ctx.slots.register({
					name: "sidebar.right.tab.files.actions",
					id: "dsh-open",
					order: 20,
					locale: NS
				}, DirectoryOpen);
			});
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale"];
		return module.exports;
	}
});
