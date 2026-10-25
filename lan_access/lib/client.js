window.__ModuleLoader__.load({
	id: "dsh-lan-access",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		//#region dsh-lan-access/client.css
		/**
		 * 样式走自己的 class 前缀（dshl-），颜色一律引用 dsh 主题的 `--dsw-*` 变量并带
		 * 浅色兜底值 —— 跟着主题走，变量缺失时也不会变透明。
		 *
		 * 0.2.x 里这两个入口改挂侧边栏的面板行（sidebar.panellist），点开后在中央主
		 * 面板（main 的 keyed 槽）呈现，所以这里不再有浮层/遮罩/触发按钮，只剩页面卡片。
		 */
		const css =
			".dshl-page{box-sizing:border-box;width:100%;min-height:100%;display:flex;justify-content:center;padding:32px 26px}" +
			".dshl-card{box-sizing:border-box;width:min(660px,100%);align-self:flex-start;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.12));border-radius:14px;padding:20px 22px;color:var(--dsw-alias-label-primary,#1b2130);font-family:'Segoe UI','Microsoft YaHei',system-ui,sans-serif;font-size:13px;line-height:1.6}" +
			".dshl-head{display:flex;align-items:center;gap:10px}" +
			".dshl-title{flex:1;font-size:16px;font-weight:600}" +
			".dshl-btn{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.14));border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#5b6478);font:inherit;font-size:12px;line-height:1;cursor:pointer}" +
			".dshl-btn:hover{color:var(--dsw-alias-label-primary,#1b2130);border-color:rgba(22,32,58,.30)}" +
			".dshl-btn:disabled{opacity:.5;cursor:default}" +
			".dshl-state{display:flex;align-items:center;gap:8px;margin-top:16px;font-size:12px;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dshl-state b{color:var(--dsw-alias-label-primary,#1b2130);font-weight:600}" +
			".dshl-hint{margin-top:12px;font-size:12px;line-height:1.9;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dshl-backdrop{position:fixed;inset:0;z-index:9000;background:transparent}" +
			".dshl-qrBox{display:flex;justify-content:center;margin-top:14px;padding:12px;border-radius:12px;background:#fff;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.12))}" +
			".dshl-qr{display:block;width:216px;height:216px}" +
			".dshl-url{margin-top:10px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-fill-l2,rgba(22,32,58,.05));font-family:ui-monospace,Consolas,'Courier New',monospace;font-size:11px;line-height:1.7;color:var(--dsw-alias-label-secondary,#5b6478);word-break:break-all;-webkit-user-select:text;user-select:text}" +
			".dshl-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}" +
			".dshl-primary{height:28px;padding:0 12px;border:0;border-radius:7px;background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff;font:inherit;font-size:12px;line-height:1;cursor:pointer}" +
			".dshl-primary:hover{filter:brightness(1.06)}" +
			".dshl-primary:disabled{opacity:.5;cursor:default;filter:none}" +
			".dshl-link{font-size:12px;color:var(--dsw-alias-brand-primary,#4d6bfe);text-decoration:none;align-self:center}" +
			".dshl-note{margin-top:14px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.10));font-size:11px;line-height:1.9;color:var(--dsw-alias-label-caption,#98a0b3)}" +
			".dshl-note b{color:var(--dsw-alias-label-tertiary,#8a93a8);font-weight:500}" +
			".dshl-warn{margin-top:12px;padding:8px 10px;border-radius:8px;background:rgba(180,83,9,.10);color:#b45309;font-size:12px;line-height:1.8}" +
			".dshl-alt{margin-top:4px;font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a93a8);word-break:break-all}" +
			".dshl-empty{padding:32px 0;text-align:center;color:var(--dsw-alias-label-tertiary,#8a93a8);font-size:12px;line-height:1.9}" +
			".dshl-icon{display:block}" +
			".dshl-rowstatus{pointer-events:none}" +
			".dshl-dot{flex:none;width:7px;height:7px;border-radius:50%;background:#9aa4b8}" +
			".dshl-dot.dshl-on{background:#119e6a}" +
			".dshl-dot.dshl-bad{background:#c2410c}";
		const tagId = "dsh-lan-access/client.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-lan-access";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region dsh-lan-access/client/index.js
		/** 宿主侧注册的三个接口（走 connection 的鉴权通道，同源 fetch 即可）。 */
		const INFO_PATH = "/api/lan_access.info";
		const SET_PATH = "/api/lan_access.set";
		const RESET_PATH = "/api/lan_access.reset";
		const h = react.createElement;

		/** 把宿主生成的 SVG 二维码转成 img 能用的 data URL。 */
		function qrDataUrl(svg) {
			if (typeof svg !== "string" || svg.length === 0) return "";
			return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
		}

		/**
		 * 侧边栏面板行图标（地球/网络）：**细线条 outline**、`currentColor`，和
		 * 「插件」「自动化任务」那两行的图标（1px stroke）同一套风格与颜色。
		 * 行按钮 / 标签 / 选中态由 ui-sidebar 的 PanelRow 统一渲染。
		 *
		 * 右侧还带一个「状态圆点」（复用原 footer 行的 dshl-dot：灰=关 / 绿=开 /
		 * 橙=想开没起来）。PanelRow 本身不支持行尾追加元素，所以圆点用
		 * `position:absolute` 锚到行尾 —— 先把所在行（button）设为 `position:relative`
		 * 当包含块，再在 icon 容器里放一个绝对定位的圆点（DOM 改动只在挂载时做一次、
		 * 卸载时还原，和插件早先给 footerActions 加 `flex-wrap` 是同一类做法）。
		 * 收成 56px 轨道时隐藏（和其他面板行一样只留图标）。
		 */
		function LanIcon({ size }) {
			const edge = typeof size === "number" && size > 0 ? size : 16;
			const rootRef = react.useRef(null);
			const [wide, setWide] = react.useState(false);
			const [data, setData] = react.useState(null);

			// 状态轮询：圆点的灰/绿/橙跟着宿主快照走
			react.useEffect(() => {
				const ctrl = new AbortController();
				const load = () => {
					fetch(INFO_PATH, { signal: ctrl.signal, cache: "no-store" })
						.then((response) => (response.ok ? response.json() : Promise.reject(new Error("HTTP " + response.status))))
						.then((value) => {
							if (!ctrl.signal.aborted) setData(value);
						})
						.catch(() => { /* 静默：圆点保持上一态 */ });
				};
				load();
				const timer = window.setInterval(load, 5000);
				return () => {
					window.clearInterval(timer);
					ctrl.abort();
				};
			}, []);

			// 找到所在的行（button），设 relative 当包含块，并探测是否展开态
			react.useEffect(() => {
				let row = rootRef.current?.parentElement;
				while (row && row !== null && row.tagName !== "BUTTON") row = row.parentElement;
				if (!row) return undefined;
				const previous = row.style.position;
				row.style.position = "relative";
				setWide(row.childElementCount >= 2);
				return () => {
					row.style.position = previous;
				};
			}, []);

			const running = data?.running === true;
			const enabled = data?.enabled === true;
			const tone = running ? "on" : enabled ? "bad" : "";
			const status = running ? "已开启" : enabled ? "开启失败" : "未开启";
			const outline = { stroke: "currentColor", fill: "none", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" };

			return h(
				react.Fragment,
				null,
				h(
					"svg",
					{ ref: rootRef, className: "dshl-icon", width: edge, height: edge, viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false" },
					h("circle", { cx: 8, cy: 8, r: 6.2, ...outline }),
					h("path", { d: "M1.8 8H14.2", ...outline }),
					h("path", { d: "M8 1.8V14.2", ...outline })
				),
				wide
					? h(
							"span",
							{
								className: "dshl-rowstatus",
								"aria-hidden": "true",
								style: { position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }
							},
							h("span", { className: "dshl-dot" + (tone.length > 0 ? " dshl-" + tone : ""), title: status })
						)
					: null
			);
		}

		/** 复制到剪贴板：局域网 http 下不是安全上下文，navigator.clipboard 可能没有，兜一个 execCommand。 */
		function copyText(text) {
			if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
				return navigator.clipboard.writeText(text).then(
					() => true,
					() => fallbackCopy(text)
				);
			}
			return Promise.resolve(fallbackCopy(text));
		}

		function fallbackCopy(text) {
			try {
				const area = document.createElement("textarea");
				area.value = text;
				area.setAttribute("readonly", "");
				area.style.position = "fixed";
				area.style.opacity = "0";
				document.body.appendChild(area);
				area.select();
				const ok = document.execCommand("copy");
				document.body.removeChild(area);
				return ok;
			} catch {
				return false;
			}
		}

		/** 面板数据：label + 读快照 + 重读 + 覆盖，向宿主接口取数。 */
		function useLanInfo() {
			const [state, setState] = react.useState({ phase: "loading", data: null, error: "" });
			const controller = react.useRef(null);

			const load = react.useCallback((silent) => {
				controller.current?.abort();
				const signal = new AbortController();
				controller.current = signal;
				if (!silent) setState((previous) => ({ ...previous, phase: previous.data ? "refreshing" : "loading" }));
				fetch(INFO_PATH, { signal: signal.signal, cache: "no-store" })
					.then((response) => {
						if (!response.ok) throw new Error("HTTP " + response.status);
						return response.json();
					})
					.then((data) => {
						if (!signal.signal.aborted) setState({ phase: "ready", data, error: "" });
					})
					.catch((error) => {
						if (signal.signal.aborted) return;
						setState((previous) => ({ phase: "error", data: previous.data, error: String(error?.message ?? error) }));
					});
			}, []);

			react.useEffect(() => {
				load(true);
				return () => controller.current?.abort();
			}, [load]);

			const setEnabled = react.useCallback((next) => {
				setState((previous) => ({ ...previous, phase: previous.data ? "refreshing" : "loading" }));
				fetch(SET_PATH, {
					method: "POST",
					cache: "no-store",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ enabled: next })
				})
					.then((response) => {
						if (!response.ok) throw new Error("HTTP " + response.status);
						return response.json();
					})
					.then((data) => setState({ phase: "ready", data, error: "" }))
					.catch((error) => setState((previous) => ({ phase: "error", data: previous.data, error: String(error?.message ?? error) })));
			}, []);

			const reset = react.useCallback(() => {
				fetch(RESET_PATH, { method: "POST", cache: "no-store" })
					.then((response) => {
						if (!response.ok) throw new Error("HTTP " + response.status);
						return response.json();
					})
					.then((data) => setState({ phase: "ready", data, error: "" }))
					.catch((error) => setState((previous) => ({ phase: "error", data: previous.data, error: String(error?.message ?? error) })));
			}, []);

			return { state, load, setEnabled, reset };
		}

		/**
		 * 中央主面板：状态 + 二维码 + 链接 + 操作 + 说明。
		 *
		 * 三种状态界面不一样：
		 *   running             → 二维码能用，给「复制 / 打开 / 重置」
		 *   enabled && !running → 代理没起来（多半端口被占），给「重试 / 关闭」
		 *   !enabled            → 默认态，给一段说明 + 「开启局域网访问」
		 *
		 * 宿主侧的 `enabled` 是**用户意图**、`running` 是**代理真的在监听**，两者会分叉
		 * （端口被占时 enabled=true 但 running=false）—— 所以二维码只看 running。
		 */
		function LanPage() {
			const { state, load, setEnabled, reset } = useLanInfo();
			const [copied, setCopied] = react.useState(false);
			const [confirming, setConfirming] = react.useState(false);
			const data = state.data;
			const url = data?.url ?? "";
			const enabled = data?.enabled === true;
			const running = data?.running === true;

			const copy = () => {
				copyText(url).then((ok) => {
					if (!ok) return;
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1600);
				});
			};

			const others = (data?.addresses ?? []).filter((entry) => entry.address !== data?.ip);
			const tone = running ? "on" : enabled ? "bad" : "";
			const status = running ? "已开启" : enabled ? "开启失败" : "未开启";

			const switchButton = (label, next) =>
				h(
					"button",
					{ type: "button", className: "dshl-primary", onClick: () => setEnabled(next) },
					label
				);

			return h(
				"div",
				{ className: "dshl-page" },
				h(
					"div",
					{ className: "dshl-card", "aria-label": "局域网访问" },
					h(
						"div",
						{ className: "dshl-head" },
						h("span", { className: "dshl-title" }, "局域网访问"),
						h("button", { type: "button", className: "dshl-btn", onClick: () => load(false) }, state.phase === "loading" ? "读取中…" : "刷新")
					),

					state.phase === "error"
						? h("div", { className: "dshl-warn" }, "读取失败：" + state.error + "（显示的是上一次的结果）")
						: null,

					data === null
						? h("div", { className: "dshl-empty" }, "正在读取…")
						: h(
								react.Fragment,
								null,
								h(
									"div",
									{ className: "dshl-state" },
									h("span", { className: "dshl-dot" + (tone.length > 0 ? " dshl-" + tone : "") }),
									h("b", null, status)
								),
								enabled && !running
									? h(
											"div",
											{ className: "dshl-warn" },
											"局域网代理没起来：" + (data.error || "未知原因"),
											h("br", null),
											"常见原因是 " + data.port + " 端口被别的程序占用。关掉占用的程序后点「重试」。"
										)
									: null,
								!enabled
									? h(
											"div",
											{ className: "dshl-hint" },
											"开启后，同一个局域网里的手机扫二维码就能直接打开网页版。",
											h("br", null),
											"链接是固定的：只要这台电脑的内网 IP 不变，链接和二维码就不变。",
											h("br", null),
											"默认关闭；开启后会记住，下次启动自动恢复。"
										)
									: null,
								enabled && url.length === 0
									? h("div", { className: "dshl-empty" }, "没有找到可用的内网地址。", h("br", null), "确认电脑已连上局域网（WiFi 或有线）后点「刷新」。")
									: null,
								h(
									"div",
									{ className: "dshl-actions" },
									enabled ? switchButton("关闭局域网访问", false) : switchButton("开启局域网访问", true),
									enabled && !running ? switchButton("重试", true) : null,
									running && url.length > 0
										? h(
												react.Fragment,
												null,
												h("button", { type: "button", className: "dshl-primary", onClick: copy }, copied ? "已复制" : "复制链接"),
												h("a", { className: "dshl-link", href: url, target: "_blank", rel: "noreferrer" }, "在浏览器打开")
											)
										: null,
									running && url.length > 0
										? confirming
											? h(
													react.Fragment,
													null,
													h(
														"button",
														{
															type: "button",
															className: "dshl-btn",
															onClick: () => {
																setConfirming(false);
																reset();
															}
														},
														"确定重置"
													),
													h("button", { type: "button", className: "dshl-btn", onClick: () => setConfirming(false) }, "取消")
												)
											: h("button", { type: "button", className: "dshl-btn", title: "换一个新访问码，已发出的旧链接立即失效", onClick: () => setConfirming(true) }, "重置访问码")
										: null
								),
								running && url.length > 0
									? h(
											react.Fragment,
											null,
											h(
												"div",
												{ className: "dshl-qrBox" },
												h("img", { className: "dshl-qr", src: qrDataUrl(data.qr), width: 216, height: 216, alt: "局域网访问二维码" })
											),
											h("div", { className: "dshl-url", title: url }, url)
										)
									: null,
								h(
									"div",
									{ className: "dshl-note" },
									"手机和电脑要在同一个局域网，用手机扫码或直接打开上面的链接。",
									h("br", null),
									h("b", null, "首次连不上？"),
									" 多半是 Windows 防火墙拦了入站：在「允许应用通过防火墙」里勾上本程序自带的 node.exe（私有网络）。",
									h("br", null),
									h("b", null, "注意："),
									" 这条链接等于本机的操作权限，局域网内拿到的人都能用；别外传，泄露了就点「重置访问码」。",
									" 不用的时候点「关闭局域网访问」，端口会立刻释放。",
									enabled && others.length > 0
										? h(
												"div",
												null,
												h("b", null, "其他网卡地址（换 IP 时可试）："),
												others.map((entry) =>
													h("div", { className: "dshl-alt", key: entry.address + entry.name }, entry.address + "  (" + entry.name + ")")
												)
											)
										: null
								)
							)
				)
			);
		}

		/** 本插件需要的客户端服务：只有 slot 注册表。 */
		const inject = ["slots"];

		/**
		 * 把入口挂到侧边栏面板行，点开后在中央主面板呈现。
		 *
		 * `sidebar.panellist` 的行由 ui-sidebar 的 PanelRow 统一渲染（图标 + 标签 +
		 * 选中态），注册项只需提供与「插件」一致的纯图标；`main` 的 key 跟行 id 对齐，
		 * 选中该行就渲染对应面板。
		 */
		function apply(ctx) {
			ctx.slots.inject("main", () =>
				ctx.slots.register(
					{
						name: "main",
						key: "lan-access"
					},
					LanPage
				)
			);
			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register(
					{
						name: "sidebar.panellist",
						id: "lan-access",
						order: 30,
						label: "局域网访问"
					},
					LanIcon
				)
			);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});