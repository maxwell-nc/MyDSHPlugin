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
			".dshu-legendRow{cursor:pointer}" +
			".dshu-legendRow:hover .dshu-legendName{color:var(--dsw-alias-label-primary,#1b2130)}" +
			".dshu-legendOther .dshu-legendName{color:var(--dsw-alias-label-primary,#1b2130)}" +
			".dshu-legendCell{padding:3px 0;vertical-align:middle}" +
			".dshu-legendName{display:block;padding:0 8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dshu-swatch{display:block;width:10px;height:10px;border-radius:3px}" +
			".dshu-legendNum{color:var(--dsw-alias-label-tertiary,#8a93a8);font-variant-numeric:tabular-nums;text-align:right;padding-left:8px;white-space:nowrap}" +
			".dshu-legendDim .dshu-legendName{color:var(--dsw-alias-label-tertiary,#8a93a8);font-weight:400}" +
			".dshu-legendDim .dshu-swatch{opacity:.35}" +
			".dshu-legendDim .dshu-legendNum{color:var(--dsw-alias-label-tertiary,#8a93a8)}" +
			".dshu-legendSel .dshu-legendName{font-weight:600;color:var(--dsw-alias-label-primary,#1b2130)}" +
			".dshu-foldBtn{color:var(--dsw-alias-state-business-primary,#3d7eff);white-space:nowrap}" +
			".dshu-foldName{color:var(--dsw-alias-label-tertiary,#8a93a8)}" +
			".dshu-filter{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:8px}" +
			".dshu-filterInfo{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a93a8)}" +
			".dshu-chart{position:relative;width:100%;height:200px;margin-top:14px}" +
			".dshu-line{width:100%;height:200px;display:block;overflow:visible}" +
			".dshu-lineGrid{stroke:rgba(22,32,58,.08);stroke-width:1;vector-effect:non-scaling-stroke}" +
			".dshu-lineAxis{stroke:rgba(22,32,58,.22);stroke-width:1;vector-effect:non-scaling-stroke}" +
			".dshu-lineBase{stroke-width:2;stroke-linecap:round}" +
			".dshu-lineDot{stroke:#fff;stroke-width:1;vector-effect:non-scaling-stroke}" +
			".dshu-lineDay{font-size:10px;fill:var(--dsw-alias-label-tertiary,#8a93a8);font-family:inherit;font-variant-numeric:tabular-nums}" +
			".dshu-lineOverlay{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none}" +
			".dshu-lineCol{position:absolute;top:0;bottom:0;pointer-events:auto;cursor:default;border-radius:6px}" +
			".dshu-lineCol:hover{background:rgba(22,32,58,.05)}" +
			".dshu-dayEmpty{opacity:.5}" +
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
			".dshu-warn{color:#b45309}" +
			".dshu-ops{display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-top:14px}" +
			".dshu-switch{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}" +
			".dshu-switch input{position:absolute;opacity:0;pointer-events:none}" +
			".dshu-track{position:relative;width:34px;height:18px;border-radius:999px;background:rgba(22,32,58,.18);transition:background .15s ease;flex:none}" +
			".dshu-track::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s ease}" +
			".dshu-switch input:checked + .dshu-track{background:var(--dsw-alias-state-business-primary,#3d7eff)}" +
			".dshu-switch input:checked + .dshu-track::after{transform:translateX(16px)}" +
			".dshu-switch input:focus-visible + .dshu-track{outline:2px solid var(--dsw-alias-state-business-primary,#3d7eff);outline-offset:2px}" +
			".dshu-switchLabel{font-size:12px;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dshu-range{display:flex;align-items:center;gap:7px;flex-wrap:wrap}" +
			".dshu-date{height:26px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.18));border-radius:7px;background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,#1b2130);font:inherit;font-size:12px;outline:none;font-variant-numeric:tabular-nums}" +
			".dshu-date:focus{border-color:var(--dsw-alias-state-business-primary,#3d7eff)}" +
			".dshu-rangeSep{color:var(--dsw-alias-label-tertiary,#8a93a8);font-size:12px}" +
			".dshu-rangeNote{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a93a8);font-variant-numeric:tabular-nums}";
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
		/** 历史可选范围上限（天）；宿主返回的 `window` 字段优先。 */
		const MAX_DAYS = 60;
		/** 日期范围选择：最少选多少天（含首尾两天）。 */
		const MIN_RANGE_DAYS = 2;
		/** 本地存储键：是否隐藏模型名的 `/`、`\` 前缀（只影响展示，不落账）。 */
		const PREFIX_STORAGE_KEY = "dsh-usage:hidePrefix";
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

		/** 某个日期键加上 `delta` 天（`YYYY-MM-DD` → `YYYY-MM-DD`）。 */
		function addDaysKey(key, delta) {
			const day = new Date(key + "T00:00:00");
			day.setDate(day.getDate() + delta);
			return dateKey(day);
		}

		/**
		 * 隐藏模型名的 `/`、`\` 前缀：取最后一个分隔符之后的一段（去首尾空白）。
		 * `opencode/glm-5.3` → `glm-5.3`；`provider / 默认模型` → `默认模型`。
		 * 没有分隔符就原样返回。
		 */
		function stripModelPrefix(name) {
			const s = String(name ?? "");
			const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
			if (i < 0) return s;
			const tail = s.slice(i + 1).trim();
			return tail.length > 0 ? tail : s;
		}

		/** 首字母小写 → 大写（仅显示）；已大写/非字母开头保持不变。 */
		function cap(s) {
			return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
		}

		/**
		 * 在选定的日期序列里重新聚合「天 × 模型」视图。
		 *
		 * `hidePrefix` 为真时：先剥掉模型名的前缀（`/\` 之后那一段），再按
		 * **忽略大小写** 合并同名用量（`opencode/glm-5.3` 与 `GLM-5.3` 并到一行）。
		 * 为假时按原始模型名原样分组，不做任何合并。日期跨度、合并逻辑都集中在这，
		 * 所以开关与日期范围选择共用同一套数据加工。
		 *
		 * @param keys - 要展示的日期键数组（含首尾）。
		 * @param recorded - 日期键 → 当天原始天数行（含 `models`）。
		 * @returns {days, models, total} days=models 用归一化后的模型名当键。
		 */
		function buildView(keys, recorded, hidePrefix) {
			const totals = new Map();
			const days = keys.map((date) => {
				const day = recorded.get(date);
				const row = { date, total: 0, models: {} };
				if (!day) return row;
				for (const raw of Object.keys(day.models || {})) {
					const bucket = day.models[raw];
					if (!bucket || !(bucket.tokens > 0)) continue;
					const label = hidePrefix ? cap(stripModelPrefix(raw)) : raw;
					const key = (hidePrefix ? label.toLowerCase() : label) || label;
					const target = (row.models[key] =
						row.models[key] || { tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 });
					target.tokens += bucket.tokens || 0;
					target.input += bucket.input || 0;
					target.output += bucket.output || 0;
					target.cacheRead += bucket.cacheRead || 0;
					target.cacheWrite += bucket.cacheWrite || 0;
					target.calls += bucket.calls || 0;
					row.total += bucket.tokens || 0;
					const agg = totals.get(key) || { label, tokens: 0 };
					agg.tokens += bucket.tokens || 0;
					totals.set(key, agg);
				}
				return row;
			});
			const models = [...totals.entries()]
				.filter(([, model]) => model.tokens > 0)
				.sort(
					(a, b) => b[1].tokens - a[1].tokens || (a[1].label < b[1].label ? -1 : a[1].label > b[1].label ? 1 : 0)
				)
				.map(([key, model]) => ({ id: key, label: model.label, tokens: model.tokens }));
			const total = models.reduce((sum, model) => sum + model.tokens, 0);
			return { days, models, total };
		}

		/** 生成 start 到 end（含）之间的全部日期键。 */
		function keysInRange(start, end) {
			const keys = [];
			for (let key = start; key <= end; key = addDaysKey(key, 1)) keys.push(key);
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

		/**
		 * 复用的悬浮弹窗：显示「日期 + 合计 + 当日前 N 个模型的对比清单」。
		 *
		 * 位置由宿主/图表在 `tip.x / tip.y`（悬浮目标的中心点）给入。默认走 CSS 的
		 * `translate(-50%, -100%)` 以目标点为中心、弹在目标上方。**悬浮到最后一天（或
		 * 贴边）时，居中会让气泡一半伸出视口右边、模型名被裁掉** —— 所以这里先渲染一
		 * 帧按默认居中摆好，再用 `useLayoutEffect` 量出真实宽高，把 left/top 钳回视口内
		 * （`transform:none` 直接写坐标），既保持贴点又永远不越界。
		 */
		function UsageTip({ tip }) {
			// box = { left, top }（相对视口的绝对坐标，已钳制、不走 translate）
			const [box, setBox] = react.useState(null);
			const ref = react.useRef(null);

			react.useLayoutEffect(() => {
				if (tip === null) {
					setBox(null);
					return;
				}
				const el = ref.current;
				if (!el) return;
				const width = el.offsetWidth;
				const height = el.offsetHeight;
				const margin = 8;
				// 默认居中在 tip.x、浮在 tip.y 上方 10px —— 与 CSS translate(-50%,-100%) 同口径
				let left = tip.x - width / 2;
				let top = tip.y - height - 10;
				// 水平钳回视口内；垂直只兜底不小于 margin（上方空间不够也不至于顶出屏幕顶）
				left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
				top = Math.max(margin, top);
				setBox({ left, top });
			}, [tip]);

			if (tip === null) return null;
			return react_dom.createPortal(
				h(
					"div",
					{
						ref,
						className: "dshu-tip",
						style: box ? { left: box.left, top: box.top, transform: "none" } : { left: tip.x, top: tip.y }
					},
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
										h("span", { className: "dshu-tipName", title: row.id }, row.label || row.id),
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

		/**
		 * 折线图：一个模型一条线、一天一个点，**线不断**（每条线都铺满整条横轴）。
		 *
		 * **没有用量的部分统一灰色**：没有用量的天照样落点、照样连线，但这些点一律按 0
		 * 画成**灰色**的线和点；只要有一端有用量就用模型自己的颜色（底边升上去/降下来
		 * 的斜边也算彩色）。灰线是**贯穿整条横轴的一条**、灰点按天去重，所以底部永远只有一条灰线
		 * 和一排灰点，不会被「最后画的那个模型」染成它的颜色 —— 用户看到的「底部一条
		 * 橙色线」就是这么来的；也不会在筛选成单个模型后，因为中间几天没有「贴底段」
		 * 而断成「深灰—极浅灰—深灰」。
		 *
		 * `models` 是要画的线（默认全部，筛选时只画选中的）；`tipModels` 是气包里列出的
		 * 模型，调用处传的就是同一条 `models` —— **筛选后气包跟着筛选走**（只列选中的
		 * 模型，抬头「合计」也是这几个之和）。
		 */
		function UsageChart({ days, models, tipModels, colors }) {
			const [tip, setTip] = react.useState(null);
			// 画布（viewBox 固定比例，SVG 自适应宽度）+ 边距
			const W = 640;
			const H = 200;
			const PAD_L = 8;
			const PAD_R = 8;
			const PAD_T = 12;
			const PAD_B = 26;
			const plotW = W - PAD_L - PAD_R;
			const plotH = H - PAD_T - PAD_B;
			const n = days.length;
			const stepX = n > 1 ? plotW / (n - 1) : 0;
			// Y 轴上限：所有模型所有天的最大用量（至少 1，避免除零）
			const maxVal = Math.max(
				1,
				...days.flatMap((day) => models.map((model) => day.models[model.id]?.tokens ?? 0))
			);
			const xOf = (index) => (n > 1 ? PAD_L + stepX * index : PAD_L + plotW / 2);
			const yOf = (value) => PAD_T + plotH - (value / maxVal) * plotH;

			const show = (event, day) => {
				const rect = event.currentTarget.getBoundingClientRect();
				const rows = (tipModels ?? models)
					.map((model) => ({
						key: model.id,
						id: model.label,
						tokens: day.models[model.id]?.tokens ?? 0,
						color: colors.get(model.id) ?? PALETTE[0]
					}))
					.filter((row) => row.tokens > 0)
					.sort((left, right) => right.tokens - left.tokens);
				setTip({
					x: rect.left + rect.width / 2,
					y: rect.top,
					date: day.date,
					// 抬头「合计」= 下面真列出来的这几个模型之和（筛选时就不是全天总量了），
					// 不然筛选后会出现「合计比下面几行加起来还大」的对不上账。
					total: rows.reduce((sum, row) => sum + row.tokens, 0),
					rows
				});
			};
			const hide = () => setTip(null);

			// 每条模型线都铺满整条横轴（没用量的天也画点、也连线），但 **0 值段一律用
			// 统一的灰色**（线 + 点都灰），只有真正抬得起来的段才用模型自己的颜色。
			// 为什么：以前 0 值段也用模型色画，几条线叠在底边上，最后画的那个模型
			// （常常是个用量很小的）就把整条基线染成它的颜色 —— 就是那条「底部橙色线」。
			// 用户要的是「底部统一灰色线和灰色点」，不是把这些线删掉。
			const GRAY = "#9aa3b5";
			/**
			 * 「贴底」= 当天**没有用量**。这些点统一按 0 画成灰色（灰线灰点）。
			 *
			 * 刻意**不做**「用量小于某个比例也算贴底」的阈值：阈值一开，小用量模型真实的
			 * 数据点会被悄悄染灰，等于图上把这个模型删了 —— 图例给了它色块、图上却找不到
			 * 那条线。现在只有真没用过的天才画灰的，用过的天一律保留模型自己的颜色，
			 * 哪怕只高出底边几个像素。底部那条灰线（见 grayLine）仍然贯穿整条横轴。
			 */
			const isFlat = (tokens) => tokens <= 0;
			const valuesOf = (model) => days.map((day) => day.models[model.id]?.tokens ?? 0);
			const series = models.map((model) => {
				const values = valuesOf(model);
				return {
					model,
					values,
					points: values.map((tokens, index) => ({
						x: xOf(index),
						y: yOf(isFlat(tokens) ? 0 : tokens),
						tokens
					})),
					color: colors.get(model.id) ?? PALETTE[0]
				};
			});

			/** 把一串下标并成连续区间（`[0,1,2,5]` → `[[0,3],[5,6]]`，右端开区间）。 */
			const runsOf = (indices) => {
				const runs = [];
				[...indices]
					.sort((left, right) => left - right)
					.forEach((index) => {
						const last = runs[runs.length - 1];
						if (last !== undefined && last[1] === index) last[1] = index + 1;
						else runs.push([index, index + 1]);
					});
				return runs;
			};

			// 灰色部分所有模型共用一套（同一个贴底点没必要按模型画 N 遍）：
			//   grayLine = 整条横轴那一条灰线；grayDays = 至少一条线贴底的那天（灰点）。
			// 灰线**整条轴都画**，不是只画「贴底段」：筛选成单个模型后，它有用量的那几天
			// 前后就没有贴底段了，线会在中间断成「深灰——极浅灰（坐标轴）——深灰」，
			// 看着就像「筛选后灰线没了」。整条画过去，底部永远是一条连续的统一灰线。
			const grayDays = new Set();
			series.forEach(({ values }) => {
				values.forEach((tokens, index) => {
					if (isFlat(tokens)) grayDays.add(index);
				});
			});
			const grayLine = { x1: PAD_L, y1: yOf(0), x2: W - PAD_R, y2: yOf(0) };
			const grayDots = [...grayDays].sort((left, right) => left - right).map((index) => ({ x: xOf(index), y: yOf(0) }));

			// 每条线的彩色部分：只要线段有一端抬得起来就算彩色（含从底边升上去、降下来的斜边）。
			const seriesRuns = series.map(({ model, values, points, color }) => {
				const colored = [];
				for (let index = 0; index < values.length - 1; index += 1) {
					if (!isFlat(values[index]) || !isFlat(values[index + 1])) colored.push(index);
				}
				return {
					model,
					color,
					lines: runsOf(colored).map(([from, to]) => points.slice(from, to + 1)),
					dots: points.filter((point) => !isFlat(point.tokens))
				};
			});

			const grid = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
				frac,
				y: yOf(frac * maxVal)
			}));

			return h(
				"div",
				null,
				h(
					"div",
					{ className: "dshu-chart" },
					h(
						"svg",
						{ className: "dshu-line", viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none" },
						grid.map((line) =>
							h("line", {
								key: String(line.frac),
								x1: PAD_L,
								y1: line.y,
								x2: W - PAD_R,
								y2: line.y,
								className: line.frac === 0 ? "dshu-lineAxis" : "dshu-lineGrid"
							})
						),
						// 先画灰的（0 值段 + 0 值点），再画彩色的：底边永远是一条统一的灰线，
						// 有用量的点/线段盖在它上面，不会被别的模型染成自己的颜色。
						h("line", {
							key: "grayAxis",
							x1: grayLine.x1,
							y1: grayLine.y1,
							x2: grayLine.x2,
							y2: grayLine.y2,
							className: "dshu-lineBase",
							stroke: GRAY,
							strokeWidth: 2,
							strokeLinecap: "round"
						}),
						grayDots.map((point, index) =>
							h("circle", {
								key: "gd" + index,
								cx: point.x,
								cy: point.y,
								r: 2.4,
								fill: GRAY,
								className: "dshu-lineDot"
							})
						),
						seriesRuns.map(({ model, color, lines, dots }) =>
							h(
								react.Fragment,
								{ key: model.id },
								lines.map((points, index) =>
									h("polyline", {
										key: "l" + index,
										points: points.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" "),
										fill: "none",
										stroke: color,
										strokeWidth: 2,
										strokeLinejoin: "round",
										strokeLinecap: "round"
									})
								),
								dots.map((point, index) =>
									h("circle", {
										key: "d" + index,
										cx: point.x,
										cy: point.y,
										r: 2.4,
										fill: color,
										className: "dshu-lineDot"
									})
								)
							)
						),
						days.map((day, index) =>
							h(
								"text",
								{ key: day.date, x: xOf(index), y: H - 8, className: "dshu-lineDay", textAnchor: "middle" },
								formatDay(day.date)
							)
						)
					),
					h(
						"div",
						{ className: "dshu-lineOverlay" },
						days.map((day, index) =>
							h("div", {
								key: day.date,
								className: "dshu-lineCol",
								style: {
									left: (xOf(index) - stepX / 2) / W * 100 + "%",
									width: Math.max((stepX / W) * 100, 1) + "%"
								},
								onMouseEnter: (event) => show(event, day),
								onMouseLeave: hide
							})
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
		function UsageSourcesList({ sources, hidePrefix }) {
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
				modelSetOf(row).add(hidePrefix ? cap(stripModelPrefix(entry.model)) : typeof entry.model === "string" ? entry.model : "");
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

		/** 中央主面板：头 + 开关/日期范围 + 总量 + 图例 + 柱状图 + 脚注。 */
		function UsagePage() {
			const { state, load } = useUsageData();
			const data = state.data;
			const today = data?.today || dateKey(new Date());
			const windowDays =
				typeof data?.window === "number" && data.window >= 1 ? data.window : MAX_DAYS;
			/** 可选日期的下界/上界：最近 `windowDays` 天（最多取到今天）。 */
			const maxDate = today;
			const minDate = addDaysKey(maxDate, -(windowDays - 1));

			// 开关：是否隐藏模型名的 `/`、`\` 前缀并合并同名（忽略大小写）用量。
			const [hidePrefix, setHidePrefix] = react.useState(() => {
				try {
					return window.localStorage.getItem(PREFIX_STORAGE_KEY) === "1";
				} catch {
					return false;
				}
			});
			const togglePrefix = (checked) => {
				setHidePrefix(checked);
				try {
					window.localStorage.setItem(PREFIX_STORAGE_KEY, checked ? "1" : "0");
				} catch { /* 私有模式等写不进去就算了 */ }
			};

			// 日期范围：start/end（含首尾）。默认「当月」：本月 1 号到今天。
			// 因为默认值每次渲染都从 `today` 现算，跨天（第二天）自然跟着滚到新日期；
			// 只有用户手动选过区间（range 非 null）才固定住，重置按钮回默认。
			const [range, setRange] = react.useState(null);
			const rangeDefault = {
				start: maxDate.slice(0, 7) + "-01",
				end: maxDate
			};
			const active = range ?? rangeDefault;

			// 保证合法性：bound 在 [minDate, maxDate]；跨距至少 MIN_RANGE_DAYS 天。
			const clampStart = (raw) => {
				const maxStart = addDaysKey(active.end, -(MIN_RANGE_DAYS - 1));
				let next = raw < minDate ? minDate : raw > maxStart ? maxStart : raw;
				if (next < minDate) next = minDate;
				return next;
			};
			const clampEnd = (raw) => {
				const minEnd = addDaysKey(active.start, MIN_RANGE_DAYS - 1);
				let next = raw > maxDate ? maxDate : raw < minEnd ? minEnd : raw;
				if (next > maxDate) next = maxDate;
				return next;
			};
			const onStartChange = (value) => setRange({ start: clampStart(value), end: active.end });
			const onEndChange = (value) => setRange({ start: active.start, end: clampEnd(value) });
			const resetRange = () => setRange(null);

			const recorded = new Map((data?.days ?? []).map((day) => [day.date, day]));
			const keys = keysInRange(active.start, active.end);
			const view = buildView(keys, recorded, hidePrefix);
			const models = view.models;
			const days = view.days;
			const total = view.total;
			const totalAmount = measure(total);
			const file = data?.file;
			const colors = colorTable(models);
			/** 图例默认显示前几名；第 TOP_N + 1 名起折叠进「其他」（折线图不受影响，全画）。 */
			const TOP_N = 5;
			// 图例首列（色块）的固定宽度：所有行都留出同样宽度的位置，名字才不会因为
			// 「有的行有色块（其他行没有）」而错开。
			const LEAD_WIDTH = 10;
			const [legendTip, setLegendTip] = react.useState(null);
			/** 是否展开「其他」折叠的模型明细（只在确有折叠模型时才有意义）。 */
			const [othersOpen, setOthersOpen] = react.useState(false);
			/** 模型筛选：空的表示全显；非空时只显示这些模型，其余名字变灰。 */
			const [selected, setSelected] = react.useState(() => new Set());
			const legendRowsFor = () =>
				models
					.map((model) => ({ id: model.id, label: model.label, tokens: model.tokens ?? 0 }))
					.filter((row) => row.tokens > 0)
					.sort((left, right) => right.tokens - left.tokens)
					.map((row) => ({ ...row, color: colors.get(row.id) ?? PALETTE[0] }));

			const showLegend = (event, rows) => {
				const rect = event.currentTarget.getBoundingClientRect();
				setLegendTip({
					x: rect.left + rect.width / 2,
					y: rect.top,
					date: "所选区间用量",
					total,
					rows
				});
			};
			const hideLegend = () => setLegendTip(null);
			const allRows = legendRowsFor();
			const top5 = allRows.slice(0, TOP_N);
			const rest = allRows.slice(TOP_N);

			// 筛选状态
			const hasFilter = selected.size > 0;
			const toggleSelect = (id) =>
				setSelected((prev) => {
					const next = new Set(prev);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return next;
				});
			const clearSelect = () => setSelected(new Set());
			/**
			 * 图表画哪些模型：默认**全部**（图例里折叠进「其他」的小用量模型也画 —— 它们
			 * 的线大部分是底边那条统一灰线，不抢眼）；有筛选时只画选中的。
			 */
			const chartModels = hasFilter ? models.filter((model) => selected.has(model.id)) : models;

			/**
			 * 图例行 = 前 TOP_N 名 + 「其他」一行；展开时把折叠的模型追加在「其他」**下面**，
			 * 以纯文本列出（名字 + 用量，不带色块、不带占比），见下面的 folded 分支。
			 */
			const legendItems = [];
			top5.forEach((row) => legendItems.push({ ...row, folded: false }));
			const hasOthers = rest.length > 0;
			if (hasOthers) {
				// id 用不会跟真实模型名撞车的内部键（真实模型就叫「其他」也不影响）。
				legendItems.push({
					id: "__other",
					label: "其他",
					tokens: rest.reduce((sum, row) => sum + row.tokens, 0),
					folded: false,
					isOther: true
				});
				if (othersOpen) {
					rest.forEach((row) => legendItems.push({ ...row, folded: true }));
				}
			}

			// 操作行：前缀开关 + 日期范围选择
			const opsRow = h(
				"div",
				{ className: "dshu-ops" },
				h(
					"label",
					{ className: "dshu-switch" },
					h("input", {
						type: "checkbox",
						checked: hidePrefix,
						onChange: (event) => togglePrefix(event.target.checked)
					}),
					h("span", { className: "dshu-track" }),
					h("span", { className: "dshu-switchLabel" }, "隐藏模型前缀（例如 opencode/glm-5.3 → glm-5.3，并合并同名）")
				),
				h(
					"div",
					{ className: "dshu-range" },
					h("input", {
						type: "date",
						className: "dshu-date",
						value: active.start,
						min: minDate,
						max: maxDate,
						onChange: (event) => onStartChange(event.target.value)
					}),
					h("span", { className: "dshu-rangeSep" }, "至"),
					h("input", {
						type: "date",
						className: "dshu-date",
						value: active.end,
						min: minDate,
						max: maxDate,
						onChange: (event) => onEndChange(event.target.value)
					}),
					h("span", { className: "dshu-rangeNote" }, "共 " + keys.length + " 天 · 至少 " + MIN_RANGE_DAYS + " 天"),
					h(
						"button",
						{ type: "button", className: "dshu-btn", onClick: resetRange },
						"重置"
					)
				)
			);

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
					opsRow,
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
								"所选区间还没有用量。",
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
										legendItems.map((row) => {
											const isOther = row.isOther === true;
											const folded = row.folded === true;
											const dim = !isOther && hasFilter && !selected.has(row.id);
											const sel = !isOther && hasFilter && selected.has(row.id);
											const cls =
												"dshu-legendRow" +
												(isOther ? " dshu-legendOther" : "") +
												(dim ? " dshu-legendDim" : "") +
												(sel ? " dshu-legendSel" : "");
											return h(
												"tr",
												{
													className: cls,
													key: row.id + (folded ? "-f" : ""),
													title: isOther
														? othersOpen
															? "收起折叠的模型"
															: "展开全部模型"
														: dim
															? "点击显示该模型"
															: sel
																? "点击取消筛选"
																: "点击筛选该模型（支持多选）",
													onMouseEnter: (event) => {
														if (isOther) showLegend(event, allRows);
													},
													onClick: () => {
														if (isOther) setOthersOpen((v) => !v);
														else toggleSelect(row.id);
													}
												},
												// 首列只有色块（给名字腾出对齐的起点）。折叠行**也带自己的色块**：
												// 它们同样画在图上，没有色块就认不出哪条线是哪个模型。
												// 只有「其他」不给 —— 它是折叠分组，没有单一颜色。
												h(
													"td",
													{ className: "dshu-legendCell", style: { width: LEAD_WIDTH } },
													isOther ? null : h("span", { className: "dshu-swatch", style: { background: row.color } })
												),
												h(
													"td",
													{ className: "dshu-legendCell" },
													h(
														"span",
														{
															className: "dshu-legendName" + (folded ? " dshu-foldName" : ""),
															title: row.label || row.id
														},
														row.label || row.id
													)
												),
												h("td", { className: "dshu-legendCell dshu-legendNum", style: { width: 72 } }, formatAmount(row.tokens)),
												// 最右一列：模型行是占比；「其他」行放**文字**形式的展开/收起
												// （不要箭头，需求就是文字）；折叠行什么都不放（纯文本明细）。
												h(
													"td",
													{ className: "dshu-legendCell dshu-legendNum", style: { width: 48 } },
													isOther
														? h("span", { className: "dshu-foldBtn" }, othersOpen ? "收起" : "展开")
														: folded
															? ""
															: formatShare(row.tokens, total)
												)
											);
										})
									),
									h(UsageTip, { tip: legendTip })
								),
								hasFilter
									? h(
											"div",
											{ className: "dshu-filter" },
											h("span", { className: "dshu-filterInfo" }, "已筛选 " + selected.size + " 个模型（点击名字增减，灰掉的未选中）"),
											h("button", { type: "button", className: "dshu-btn", onClick: clearSelect }, "重置筛选")
										)
									: null,
								h(UsageChart, { days, models: chartModels, tipModels: chartModels, colors })
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
					h(UsageSourcesList, { sources: data?.sources ?? [], hidePrefix })
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