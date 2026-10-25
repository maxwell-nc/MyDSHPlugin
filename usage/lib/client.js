window.__ModuleLoader__.load({
	id: "dsh-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react_dom = require("react-dom");
		var react = require("react");
		//#region dsh-usage/client.css
		/**
		 * 样式走自己的 class 前缀（dshu-），颜色一律引用 dsh 主题的 `--dsw-*` 变量并带
		 * 浅色兜底值 —— 跟着主题走，也不会因为变量缺失变透明。
		 *
		 * 0.2.x 里这两个入口改挂侧边栏的面板行（sidebar.panellist），点开后在中央主
		 * 面板（main 的 keyed 槽）呈现，所以这里不再有浮层/遮罩/触发按钮，只剩页面卡片。
		 */
		const css =
			".dshu-page{box-sizing:border-box;width:100%;height:100%;overflow-y:auto;display:flex;justify-content:center;padding:32px 26px}" +
			".dshu-card{box-sizing:border-box;width:min(720px,100%);align-self:flex-start;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.12));border-radius:14px;padding:20px 22px;color:var(--dsw-alias-label-primary,#1b2130);font-family:'Segoe UI','Microsoft YaHei',system-ui,sans-serif;font-size:13px;line-height:1.6}" +
			".dshu-head{display:flex;align-items:center;gap:10px}" +
			".dshu-title{flex:1;font-size:16px;font-weight:600}" +
			".dshu-btn{height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.14));border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#5b6478);font:inherit;font-size:12px;line-height:1;cursor:pointer}" +
			".dshu-btn:hover{color:var(--dsw-alias-label-primary,#1b2130);border-color:rgba(22,32,58,.30)}" +
			".dshu-btn:disabled{opacity:.5;cursor:default}" +
			".dshu-sum{display:flex;align-items:baseline;gap:8px;margin-top:16px}" +
			".dshu-sumNum{font-size:26px;font-weight:600;font-variant-numeric:tabular-nums}" +
			".dshu-sumUnit{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a93a8)}" +
			".dshu-legend{width:100%;margin-top:10px;border-collapse:collapse;table-layout:fixed;font-size:12px;cursor:default}" +
			".dshu-legendRow{cursor:default}" +
			".dshu-legendRow:hover .dshu-legendName{color:var(--dsw-alias-label-primary,#1b2130)}" +
			".dshu-legendOther .dshu-legendName{color:var(--dsw-alias-label-primary,#1b2130);text-decoration:underline dotted;text-underline-offset:2px}" +
			".dshu-legendCell{padding:2px 0;vertical-align:middle}" +
			".dshu-legendName{display:block;padding-right:8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dshu-swatch{display:block;width:10px;height:10px;border-radius:3px}" +
			".dshu-legendNum{color:var(--dsw-alias-label-tertiary,#8a93a8);font-variant-numeric:tabular-nums;text-align:right;padding-left:8px;white-space:nowrap}" +
			".dshu-chart{display:flex;align-items:stretch;justify-content:center;gap:5px;height:196px;margin-top:14px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.10))}" +
			".dshu-col{flex:1 1 0;min-width:0;max-width:20px;display:flex;flex-direction:column;height:100%}" +
			".dshu-bar{flex:1;display:flex;flex-direction:column-reverse;min-height:0;border-radius:3px 3px 0 0;overflow:hidden}" +
			".dshu-seg{flex:none;width:100%;transition:filter .12s ease}" +
			".dshu-seg:hover{filter:brightness(.94)}" +
			".dshu-segEmpty{flex:none;width:100%;height:3px;border-radius:2px;background:rgba(22,32,58,.12)}" +
			".dshu-dayEmpty{opacity:.5}" +
			".dshu-dayLabel{margin-top:6px;height:14px;font-size:10px;line-height:14px;text-align:center;color:var(--dsw-alias-label-tertiary,#8a93a8);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden}" +
			".dshu-tip{position:fixed;z-index:9002;transform:translate(-50%,-100%);margin-top:-10px;padding:8px 11px;border-radius:10px;background:rgba(23,29,44,.95);color:#fff;font-size:12px;line-height:1.75;white-space:nowrap;box-shadow:0 10px 26px rgba(16,24,40,.30);pointer-events:none}" +
			".dshu-tipHead{display:flex;align-items:center;gap:8px;font-weight:600}" +
			".dshu-tipHeadTotal{margin-left:auto;font-weight:400;color:rgba(255,255,255,.62);font-variant-numeric:tabular-nums}" +
			".dshu-tipList{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:3px 10px;margin-top:6px}" +
			".dshu-tipName{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}" +
			".dshu-tipNum{font-weight:600;font-variant-numeric:tabular-nums;text-align:right}" +
			".dshu-tipPct{color:rgba(255,255,255,.62);font-variant-numeric:tabular-nums;text-align:right}" +
			".dshu-tipSwatch{flex:none;width:9px;height:9px;border-radius:2px}" +
			".dshu-tipDim{color:rgba(255,255,255,.62)}" +
			".dshu-empty{padding:40px 0;text-align:center;color:var(--dsw-alias-label-tertiary,#8a93a8);font-size:12px;line-height:1.9}" +
			".dshu-foot{margin-top:14px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.10));font-size:11px;color:var(--dsw-alias-label-caption,#98a0b3);line-height:1.75}" +
			".dshu-path{font-family:ui-monospace,Consolas,'Courier New',monospace;color:var(--dsw-alias-label-tertiary,#8a93a8);word-break:break-all}" +
			".dshu-icon{display:block}" +
			".dshu-badge{font-size:11px;line-height:1;color:var(--dsw-alias-label-tertiary,#8a93a8);font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none}" +
			".dshu-list{margin-top:16px}" +
			".dshu-listHead{display:flex;align-items:baseline;gap:8px;font-size:13px;font-weight:600}" +
			".dshu-listCount{margin-left:auto;font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary,#8a93a8)}" +
			".dshu-listBody{height:264px;margin-top:8px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.10));border-radius:10px}" +
			".dshu-lrow{box-sizing:border-box;display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.08));font-size:12px}" +
			".dshu-lrow:last-child{border-bottom:none}" +
			".dshu-lrow:hover{background:var(--dsw-alias-bg-layer-2,rgba(22,32,58,.05))}" +
			".dshu-lsrc{flex:none;padding:1px 8px;border-radius:6px;font-size:11px;line-height:1.6;color:#fff;white-space:nowrap}" +
			".dshu-ltitle{min-width:0;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-primary,#1b2130)}" +
			".dshu-ltitleDim{color:var(--dsw-alias-label-tertiary,#8a93a8)}" +
			".dshu-lmodel{flex:none;max-width:150px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dshu-lcount{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a93a8);font-variant-numeric:tabular-nums;white-space:nowrap}" +
			".dshu-ltime{flex:none;color:var(--dsw-alias-label-tertiary,#8a93a8);font-variant-numeric:tabular-nums}" +
			".dshu-ltok{flex:none;min-width:64px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums}" +
			".dshu-pag{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:8px}" +
			".dshu-pagInfo{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a93a8)}" +
			".dshu-warn{color:#b45309}";
		const tagId = "dsh-usage/client.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-usage";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region dsh-usage/client/index.js
		/** 宿主侧注册的读取接口（走 connection 的鉴权通道，同源 fetch 即可）。 */
		const API_PATH = "/api/usage.data";
		/** 模型配色：按「全期用量从多到少」分配，柱子与图例用同一份顺序。 */
		const PALETTE = [
			"#6cb6f5",
			"#6ecf9e",
			"#f2b96b",
			"#a892f0",
			"#f2949f",
			"#5fc9c3",
			"#b5d96b",
			"#f0a184",
			"#8fa8f2",
			"#d3a0e8"
		];
		/** 横轴天数兜底；宿主返回的 `window` 字段优先。 */
		const MAX_DAYS = 15;
		const WAN = 1e4;
		const YI = 1e8;
		const YI_CUTOFF = 9999.5 * WAN;
		/** 消耗来源的颜色徽标；未列出的来源（如「未知模型」之外的自定义来源）落到默认灰。 */
		const SRC_COLORS = { "对话": "#6cb6f5", "子代理": "#a892f0", "分支": "#f2949f", "解析图片": "#6ecf9e" };
		const h = react.createElement;

		function measure(tokens) {
			const value = Number(tokens) || 0;
			if (value >= YI_CUTOFF) return { value: value / YI, unit: "亿" };
			if (value >= WAN) return { value: value / WAN, unit: "万" };
			// 不够 1 万直接按原始 token 显示（unit 为空），避免出现「0 万 / 0.5 万」
			return { value, unit: "" };
		}

		function formatByUnit(value, unit) {
			const digits = unit === "亿" ? 2 : 0;
			return Number(value).toFixed(digits);
		}

		function formatAmount(tokens) {
			const amount = measure(tokens);
			return formatByUnit(amount.value, amount.unit) + (amount.unit ? " " + amount.unit : "");
		}

		function formatShare(part, whole) {
			if (!whole) return "0%";
			return Math.round((part / whole) * 100) + "%";
		}

		function formatSize(bytes) {
			const value = Number(bytes) || 0;
			if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
			if (value >= 1024) return (value / 1024).toFixed(1) + " KB";
			return value + " B";
		}

		function formatStamp(iso) {
			if (typeof iso !== "string" || iso.length === 0) return "";
			const parsed = new Date(iso);
			if (Number.isNaN(parsed.getTime())) return "";
			const pad = (value) => String(value).padStart(2, "0");
			const clock = pad(parsed.getHours()) + ":" + pad(parsed.getMinutes()) + ":" + pad(parsed.getSeconds());
			const now = new Date();
			const sameDay =
				parsed.getFullYear() === now.getFullYear() &&
				parsed.getMonth() === now.getMonth() &&
				parsed.getDate() === now.getDate();
			return sameDay ? clock : pad(parsed.getMonth() + 1) + "-" + pad(parsed.getDate()) + " " + clock;
		}

		function formatDay(date) {
			return typeof date === "string" && date.length === 10 ? date.slice(8) : String(date ?? "");
		}

		function dateKey(date) {
			const pad = (value) => String(value).padStart(2, "0");
			return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
		}

		function recentKeys(anchor, count) {
			const base = new Date(anchor + "T00:00:00");
			const keys = [];
			for (let back = count - 1; back >= 0; back -= 1) {
				const day = new Date(base);
				day.setDate(day.getDate() - back);
				keys.push(dateKey(day));
			}
			return keys;
		}

		function colorTable(models) {
			const colors = new Map();
			(models || []).forEach((model, index) => {
				colors.set(model.id, PALETTE[index % PALETTE.length]);
			});
			return colors;
		}

		/**
		 * 侧边栏面板行图标（用量柱状图）：**细线条 outline**、`currentColor`，和
		 * 「插件」「自动化任务」那两行的图标（1px stroke）同一套风格与颜色。
		 * 行按钮 / 标签 / 选中态由 ui-sidebar 的 PanelRow 统一渲染。
		 *
		 * 右侧还带「今日用量」角标（复用原 footer 行的 dshu-badge 文本）。PanelRow
		 * 本身不支持行尾追加元素，所以角标用 `position:absolute` 锚到行尾 —— 先把
		 * 所在行（button）设为 `position:relative` 当包含块，再在 icon 容器里放一个
		 * 绝对定位的角标（挂载时做一次、卸载时还原）。收成 56px 轨道时隐藏。
		 */
		function UsageIcon({ size }) {
			const edge = typeof size === "number" && size > 0 ? size : 16;
			const rootRef = react.useRef(null);
			const [wide, setWide] = react.useState(false);
			const [data, setData] = react.useState(null);

			// 轮询用量：角标显示「今天」的合计
			react.useEffect(() => {
				const ctrl = new AbortController();
				const load = () => {
					fetch(API_PATH, { signal: ctrl.signal, cache: "no-store" })
						.then((response) => (response.ok ? response.json() : Promise.reject(new Error("HTTP " + response.status))))
						.then((value) => {
							if (!ctrl.signal.aborted) setData(value);
						})
						.catch(() => { /* 静默：角标保持上一态 */ });
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

			const today = data?.today;
			const todayTokens = data?.days?.find((day) => day.date === today)?.total ?? 0;
			const badge = data === null ? "" : formatAmount(todayTokens);
			const outline = { stroke: "currentColor", fill: "none", strokeWidth: 1.2, strokeLinecap: "round" };

			return h(
				react.Fragment,
				null,
				h(
					"svg",
					{ ref: rootRef, className: "dshu-icon", width: edge, height: edge, viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false" },
					h("path", { d: "M3.2 12.8V8.2", ...outline }),
					h("path", { d: "M8 12.8V4.6", ...outline }),
					h("path", { d: "M12.8 12.8V9.4", ...outline }),
					h("path", { d: "M2 13.6H14", ...outline })
				),
				wide && badge.length > 0
					? h(
							"span",
							{
								className: "dshu-badge",
								"aria-hidden": "true",
								title: "今天",
								style: { position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)" }
							},
							badge
						)
					: null
			);
		}

		/** 复用的悬浮弹窗：显示「日期 + 合计 + 当日前 N 个模型的对比清单」。 */
		function UsageTip({ tip }) {
			if (tip === null) return null;
			return react_dom.createPortal(
				h(
					"div",
					{ className: "dshu-tip", style: { left: tip.x, top: tip.y } },
					h(
						"div",
						{ className: "dshu-tipHead" },
						tip.date,
						tip.total > 0
							? h("span", { className: "dshu-tipHeadTotal" }, "合计 " + formatAmount(tip.total))
							: null
					),
					tip.rows.length > 0
						? h(
								"div",
								{ className: "dshu-tipList" },
								tip.rows.map((row) =>
									h(
										react.Fragment,
										{ key: row.id },
										h("span", { className: "dshu-tipSwatch", style: { background: row.color } }),
										h("span", { className: "dshu-tipName", title: row.id }, row.id),
										h("span", { className: "dshu-tipNum" }, formatAmount(row.tokens)),
										h("span", { className: "dshu-tipPct" }, formatShare(row.tokens, tip.total))
									)
								)
							)
						: h("div", { className: "dshu-tipDim" }, "没有用量")
				),
				document.body
			);
		}

		/** 堆叠柱状图，逻辑沿用浮层版。 */
		function UsageChart({ days, models, colors }) {
			const [tip, setTip] = react.useState(null);
			const scale = Math.max(1, ...days.map((day) => day.total || 0));
			const show = (event, day) => {
				const rect = event.currentTarget.getBoundingClientRect();
				const rows = models
					.map((model) => ({ id: model.id, tokens: day.models[model.id]?.tokens ?? 0 }))
					.filter((row) => row.tokens > 0)
					.sort((left, right) => right.tokens - left.tokens)
					.map((row) => ({ ...row, color: colors.get(row.id) ?? PALETTE[0] }));
				setTip({
					x: rect.left + rect.width / 2,
					y: rect.top,
					date: day.date,
					total: day.total || 0,
					rows
				});
			};
			const hide = () => setTip(null);
			const bars = (day) => {
				if (!(day.total > 0)) {
					return h("div", { className: "dshu-segEmpty", title: day.date + "：没有用量" });
				}
				return models.map((model) => {
					const tokens = day.models[model.id]?.tokens ?? 0;
					if (tokens <= 0) return null;
					return h("div", {
						key: model.id,
						className: "dshu-seg",
						style: {
							height: Math.max(2, (tokens / scale) * 100) + "%",
							background: colors.get(model.id) ?? PALETTE[0]
						}
					});
				});
			};
			return h(
				"div",
				null,
				h(
					"div",
					{ className: "dshu-chart" },
					days.map((day) =>
						h(
							"div",
							{
								className: "dshu-col",
								key: day.date,
								onMouseEnter: (event) => show(event, day),
								onMouseLeave: hide
							},
							h("div", { className: "dshu-bar" }, bars(day)),
							h(
								"div",
								{
									className: "dshu-dayLabel" + (day.total > 0 ? "" : " dshu-dayEmpty"),
									title: day.date
								},
								formatDay(day.date)
							)
						)
					)
				),
				h(UsageTip, { tip })
			);
		}

		/**
		 * 柱状图下方的「最近消耗来源」明细列表。
		 *
		 * `sources` 已由宿主按「新到旧」排好（最多 MAX_SOURCES = 50 笔）。列表固定
		 * 一块高度（PAGE_HEIGHT），**每页按高度决定行数**（PAGE_HEIGHT / ROW_HEIGHT
		 * 向下取整）；超出一页就翻页：上一页 / 下一页 + 页码指示。
		 *
		 * 展示前先按「同一个对话」合并：带 `sessionId` 的会话内多笔并成一行（标题、
		 * 模型、时间取合并结果，消耗相加，行尾标 ×N 次）；没有 `sessionId` 的外来
		 * 上报（如解析图片）各自成行。列：类型 / 标题(如果有) / 模型 / 时间 / 消耗。
		 */
		function UsageSourcesList({ sources }) {
			const PAGE_HEIGHT = 264;
			const ROW_HEIGHT = 44;
			const raw = Array.isArray(sources) ? sources : [];
			// 合并：key = 会话 id（同一对话并一行）；外来上报没有会话 id → 各自成行。
			const merged = new Map();
			const modelSetOf = (row) => row._models || (row._models = new Set());
			raw.forEach((entry, index) => {
				const sessionId = typeof entry.sessionId === "string" ? entry.sessionId : "";
				const key = sessionId.length > 0 ? "s:" + sessionId : "x:" + index;
				const tokens = Number(entry.tokens) || 0;
				const time = typeof entry.time === "string" ? entry.time : "";
				let row = merged.get(key);
				if (row === undefined) {
					row = {
						key,
						sessionId,
						source: entry.source || "未知",
						title: typeof entry.title === "string" ? entry.title : "",
						tokens: 0,
						time: "",
						count: 0
					};
					merged.set(key, row);
				}
				row.tokens += tokens;
				row.count += 1;
				if (time > row.time) row.time = time; // 同一会话取最近一次时间
				modelSetOf(row).add(typeof entry.model === "string" ? entry.model : "");
				if (typeof entry.title === "string" && entry.title.length > 0) row.title = entry.title;
			});
			const list = [...merged.values()]
				.map((row) => {
					const models = [...modelSetOf(row)].filter(Boolean);
					return {
						key: row.key,
						sessionId: row.sessionId,
						source: row.source,
						title: row.title,
						models,
						tokens: row.tokens,
						time: row.time,
						count: row.count
					};
				})
				.sort((a, b) => (String(b.time) < String(a.time) ? -1 : String(b.time) > String(a.time) ? 1 : a.key < b.key ? -1 : 1));

			const pageSize = Math.max(1, Math.floor(PAGE_HEIGHT / ROW_HEIGHT));
			const pages = Math.max(1, Math.ceil(list.length / pageSize));
			const [page, setPage] = react.useState(0);
			const safePage = Math.min(page, pages - 1);
			const rows = list.slice(safePage * pageSize, (safePage + 1) * pageSize);
			const srcColor = (src) => SRC_COLORS[src] || "#9aa3b5";
			const rowKey = (row, index) => safePage + ":" + index + ":" + row.key;

			return h(
				"div",
				{ className: "dshu-list" },
				h(
					"div",
					{ className: "dshu-listHead" },
					"最近消耗来源",
					h("span", { className: "dshu-listCount" }, "共 " + raw.length + " 笔" + (list.length < raw.length ? " · 并成 " + list.length + " 行" : ""))
				),
				h(
					"div",
					{ className: "dshu-listBody" },
					list.length === 0
						? h("div", { className: "dshu-empty" }, "还没有来源记录。")
						: rows.map((row, index) =>
								h(
									"div",
									{ className: "dshu-lrow", key: rowKey(row, index) },
									h(
										"span",
										{ className: "dshu-lsrc", style: { background: srcColor(row.source) } },
										row.source
									),
									row.title.length > 0
										? h("span", { className: "dshu-ltitle", title: row.title }, row.title)
										: h("span", { className: "dshu-ltitle dshu-ltitleDim" }, "（无标题）"),
									h("span", { className: "dshu-lcount" }, row.count > 1 ? "×" + row.count : ""),
									h("span", { className: "dshu-lmodel", title: row.models.join("、") }, row.models.join("、") || "—"),
									h("span", { className: "dshu-ltime" }, formatStamp(row.time)),
									h(
										"span",
										{
											className: "dshu-ltok",
											title: String(Number(row.tokens) || 0) + " token"
										},
										formatAmount(row.tokens)
									)
								)
							)
				),
				pages > 1
					? h(
							"div",
							{ className: "dshu-pag" },
							h("button", { type: "button", className: "dshu-btn", disabled: safePage <= 0, onClick: () => setPage(safePage - 1) }, "上一页"),
							h("span", { className: "dshu-pagInfo" }, "第 " + (safePage + 1) + " / " + pages + " 页"),
							h("button", { type: "button", className: "dshu-btn", disabled: safePage >= pages - 1, onClick: () => setPage(safePage + 1) }, "下一页")
						)
					: null
			);
		}

		/** 面板数据：读快照 + 重读。 */
		function useUsageData() {
			const [state, setState] = react.useState({ phase: "loading", data: null, error: "" });
			const controller = react.useRef(null);

			const load = react.useCallback((silent) => {
				controller.current?.abort();
				const signal = new AbortController();
				controller.current = signal;
				if (!silent) setState((previous) => ({ ...previous, phase: previous.data ? "refreshing" : "loading" }));
				fetch(API_PATH, { signal: signal.signal, cache: "no-store" })
					.then((response) => {
						if (!response.ok) throw new Error("HTTP " + response.status);
						return response.json();
					})
					.then((data) => {
						if (!signal.signal.aborted) setState({ phase: "ready", data, error: "" });
					})
					.catch((error) => {
						if (signal.signal.aborted) return;
						setState((previous) => ({
							phase: "error",
							data: previous.data,
							error: String(error?.message ?? error)
						}));
					});
			}, []);

			react.useEffect(() => {
				load(true);
				return () => controller.current?.abort();
			}, [load]);

			return { state, load };
		}

		/** 中央主面板：头 + 总量 + 图例 + 柱状图 + 脚注。 */
		function UsagePage() {
			const { state, load } = useUsageData();
			const data = state.data;
			const models = data?.models ?? [];
			const total = data?.total ?? 0;
			const windowDays =
				typeof data?.window === "number" && data.window >= 1 ? data.window : MAX_DAYS;
			const recorded = new Map((data?.days ?? []).map((day) => [day.date, day]));
			const days = recentKeys(data?.today || dateKey(new Date()), windowDays).map(
				(date) => recorded.get(date) ?? { date, total: 0, models: {} }
			);
			const totalAmount = measure(total);
			const file = data?.file;
			const colors = colorTable(models);
			const TOP_N = 5;
			const [legendTip, setLegendTip] = react.useState(null);
			const legendRowsFor = () =>
				models
					.map((model) => ({ id: model.id, tokens: model.tokens ?? 0 }))
					.filter((row) => row.tokens > 0)
					.sort((left, right) => right.tokens - left.tokens)
					.map((row) => ({ ...row, color: colors.get(row.id) ?? PALETTE[0] }));

			const showLegend = (event, rows) => {
				const rect = event.currentTarget.getBoundingClientRect();
				setLegendTip({
					x: rect.left + rect.width / 2,
					y: rect.top,
					date: "全期用量",
					total,
					rows
				});
			};
			const hideLegend = () => setLegendTip(null);
			const allRows = legendRowsFor();
			const top5 = allRows.slice(0, TOP_N);
			const rest = allRows.slice(TOP_N);
			const legendRows =
				rest.length > 0
					? top5.concat([
							{
								id: "其他",
								tokens: rest.reduce((sum, row) => sum + row.tokens, 0),
								color: "#9aa3b5"
							}
						])
					: top5;
			const isOtherRow = (row) => row.id === "其他";

			return h(
				"div",
				{ className: "dshu-page" },
				h(
					"div",
					{ className: "dshu-card", "aria-label": "Token 用量" },
					h(
						"div",
						{ className: "dshu-head" },
						h("span", { className: "dshu-title" }, "Token 用量"),
						h("button", { type: "button", className: "dshu-btn", onClick: () => load(false) }, state.phase === "loading" ? "读取中…" : "刷新")
					),
					state.phase === "error"
						? h("div", { className: "dshu-sum" }, h("span", { className: "dshu-warn" }, "读取失败：" + state.error + "（显示的是上一次的结果）"))
						: null,
					h(
						"div",
						{ className: "dshu-sum" },
						h("span", { className: "dshu-sumNum" }, formatByUnit(totalAmount.value, totalAmount.unit)),
						h("span", { className: "dshu-sumUnit" }, (totalAmount.unit ? totalAmount.unit + " " : "") + "token 累计"),
						h("span", { className: "dshu-sumUnit" }, models.length > 0 ? "· " + models.length + " 个模型" : "")
					),
					total <= 0
						? h(
								"div",
								{ className: "dshu-empty" },
								"还没有采集到用量。",
								h("br", null),
								"插件只统计「安装之后」新发生的模型调用；发起一轮对话后这里就会有数据。"
							)
						: h(
								react.Fragment,
								null,
								h(
									"table",
									{
										className: "dshu-legend",
										onMouseLeave: hideLegend
									},
									h(
										"tbody",
										null,
										legendRows.map((row) =>
											h(
												"tr",
												{
													className: "dshu-legendRow" + (isOtherRow(row) ? " dshu-legendOther" : ""),
													key: row.id,
													onMouseEnter: (event) => {
														if (isOtherRow(row)) showLegend(event, allRows);
													}
												},
												h(
													"td",
													{ className: "dshu-legendCell", style: { width: 18 } },
													h("span", { className: "dshu-swatch", style: { background: row.color } })
												),
												h("td", { className: "dshu-legendCell" }, h("span", { className: "dshu-legendName", title: row.id }, row.id)),
												h("td", { className: "dshu-legendCell dshu-legendNum", style: { width: 72 } }, formatAmount(row.tokens)),
												h("td", { className: "dshu-legendCell dshu-legendNum", style: { width: 48 } }, formatShare(row.tokens, total))
											)
										)
									),
									h(UsageTip, { tip: legendTip })
								),
								h(UsageChart, { days, models, colors })
							),
					h(
						"div",
						{ className: "dshu-foot" },
						"数据文件：",
						file?.path ? h("span", { className: "dshu-path", title: file.path }, file.path) : "（还没生成）",
						file?.mtime
							? h(
									"span",
									{ className: "dshu-legendNum" },
									" · " + formatStamp(file.mtime) + " 写入 · " + formatSize(file.size)
								)
							: null
					),
					h(UsageSourcesList, { sources: data?.sources ?? [] })
				)
			);
		}

		/** 本插件需要的客户端服务：只有 slot 注册表。 */
		const inject = ["slots"];

		/**
		 * 把入口挂到侧边栏面板行，点开后在中央主面板呈现。
		 *
		 * `sidebar.panellist` 的行由 ui-sidebar 的 PanelRow 统一渲染（图标 + 标签 +
		 * 选中态），注册项只需提供与「插件」一致的纯图标；`main` 的 key 跟行 id 对齐。
		 */
		function apply(ctx) {
			ctx.slots.inject("main", () =>
				ctx.slots.register(
					{
						name: "main",
						key: "usage"
					},
					UsagePage
				)
			);
			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register(
					{
						name: "sidebar.panellist",
						id: "usage",
						order: 20,
						label: "Token 用量"
					},
					UsageIcon
				)
			);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});