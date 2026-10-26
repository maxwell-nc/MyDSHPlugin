window.__ModuleLoader__.load({
	id: "dsh-thinking-strength",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var reactDom = require("react-dom");

		//#region dsh-thinking-strength/client.css
		const css =
			".dts-seat{display:inline-flex;align-items:center;gap:8px;height:26px}" +
			".dts-mbtn{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1,#d6dbe3);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#ffffff);color:var(--dsw-alias-label-secondary,#5b6478);font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}" +
			".dts-mbtn:hover{border-color:var(--dsw-alias-border-l2,#c2c9d6)}" +
			".dts-mbtn:disabled{opacity:.5;cursor:default}" +
			".dts-caret{font-size:10px;color:#aab2c0;width:12px;text-align:center;display:inline-block}" +
			".dts-list{position:fixed;z-index:1200;width:300px;max-height:340px;overflow:auto;background:#ffffff;border:1px solid var(--dsw-alias-border-l1,#e8ecf2);border-radius:20px;box-shadow:0 6px 20px rgba(20,25,40,.10),0 1px 4px rgba(20,25,40,.05);padding:8px;color:var(--dsw-alias-label-primary,#20242c);scrollbar-width:none;-ms-overflow-style:none}" +
			".dts-list::-webkit-scrollbar{display:none}" +
			".dts-group-head{display:flex;align-items:center;gap:10px;padding:10px 8px 8px 12px;font-size:13px;color:var(--dsw-alias-label-secondary,#5b6478);font-weight:700;white-space:nowrap}" +
			".dts-group-head::after{content:\"\";flex:1;height:1px;background:var(--dsw-alias-border-l1,#e4e8ef)}" +
			".dts-model-row{display:block;width:100%;text-align:left;padding:12px 12px;border:none;border-radius:10px;background:transparent;color:#20242c;font-size:13px;line-height:1;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
			".dts-model-row:hover{background:#f2f5fb}" +
			".dts-model-row.dts-active{color:#4176E6;font-weight:600}" +
			".dts-model-row:disabled{opacity:.5;cursor:default}" +
			".dts-empty{padding:10px 8px;font-size:12px;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dts-slider{display:inline-flex;align-items:center;gap:6px}" +
			".dts-track{position:relative;display:flex;align-items:center;justify-content:space-between;padding:2px;width:96px;height:22px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#edf0f5);border:1px solid var(--dsw-alias-border-l1,#d6dbe3);cursor:pointer;touch-action:none;box-sizing:border-box;transition:none}" +
			".dts-track.dts-disabled{cursor:default}" +
			".dts-dot{width:16px;height:16px;border-radius:50%;background:#e6eaf0;box-sizing:border-box;transition:none}" +
			".dts-dot.dts-hover{background:#aeb6c6}" +
			".dts-dot.dts-on{background:#4176E6}" +
			".dts-dot.dts-on.dts-hover{background:#5b8ef5}" +
			".dts-tier{font-size:11px;color:var(--dsw-alias-label-secondary,#5b6478);min-width:22px;text-align:center}" +
			".dts-err{color:var(--dsw-alias-state-error-primary,#e5484d);font-size:11px;line-height:1}" +
			".dts-check{display:inline-flex;align-items:center;gap:6px;height:26px;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary,#5b6478);cursor:pointer}" +
			".dts-check.dts-check-on{color:var(--dsw-alias-state-business-primary,#3d7eff)}" +
			".dts-check input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-state-business-primary,#3d7eff);cursor:pointer}";
		const tagId = "dsh-thinking-strength/client.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-thinking-strength";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region dsh-thinking-strength/client/index.js
		const h = react.createElement;
		const container = document.body;
		const API_STATE = "/api/dsh-thinking-strength.state";
		const API_SET = "/api/dsh-thinking-strength.set";
		const API_ENSURE = "/api/dsh-thinking-strength.ensure";

		/** 5 档滑块：默认 / 低 / 中 / 高 / 最大。wire 为 undefined 表示「模型默认档，不显式发送」。 */
		const TIERS = [
			{ label: "默认", wire: undefined },
			{ label: "低", wire: "low" },
			{ label: "中", wire: "medium" },
			{ label: "高", wire: "high" },
			{ label: "最大", wire: "max" }
		];
		const LIST_WIDTH = 300;
		const LIST_HEIGHT = 340;
		/** 本页已确保过完整 5 档声明的模型（provider\0model）：避免每次点击都重写配置。 */
		const ensuredKeys = new Set();

		/** 只保留斜杠后的短名：opencode/glm-5.3 → glm-5.3。 */
		function shortName(id) {
			if (!id) return "";
			const parts = String(id).split(/[/\\]/u);
			return parts[parts.length - 1];
		}

		/** 列表按原始名称 a–z 排序（组名、模型名都用）。 */
		function byName(a, b) {
			return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
		}

		/** 用最后一个 `/` 或 `\` 切出「二级供应商前缀」和基础名。无分隔符时 prefix 为 null。 */
		function splitPrefix(text) {
			if (!text) return { prefix: null, base: "" };
			const s = String(text);
			const idx = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
			if (idx < 0) return { prefix: null, base: s };
			return { prefix: s.slice(0, idx), base: s.slice(idx + 1) };
		}

		/** 首字母小写 → 大写（仅显示）；已大写/非字母开头保持不变。 */
		function cap(s) {
			return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
		}

		/** 供应商标题里的每个 ` · ` 片段各自首字母大写。 */
		function capLabel(s) {
			return String(s).split(" · ").map(cap).join(" · ");
		}

		/**
		 * 模型选择座（自绘，替换内置按钮）。
		 *
		 * 输入来自 `modelDirectories`（与 /model 弹窗同一份共享目录数据）：
		 *   - `directory.store`：当前选择 + 按 provider 分组的模型目录；
		 *   - `load()`：确保目录已加载；
		 *   - `select(selection)`：提交 { provider, model, reasoningEffort }。
		 *
		 * 渲染两个相邻控件：
		 *   - 左侧「选模型」按钮：只显示斜杠后的短名，单击打开复用的模型列表（直达选择）；
		 *   - 右侧 5 档思考强度滑块：默认 / 低 / 中 / 高 / 最大。
		 * 选非默认档前会先调 `/ensure` 把当前模型声明补全成 5 档（含 medium）。
		 */
		function ThinkingModelSeat(props) {
			const { locked, available, directory, load, select } = props;
			const state = react.useSyncExternalStore(
				(fn) => directory.subscribe(fn),
				() => directory.getSnapshot()
			);
			const [open, setOpen] = react.useState(false);
			const [pos, setPos] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [error, setError] = react.useState(null);
			const [hover, setHover] = react.useState(null);
			const [dragging, setDragging] = react.useState(false);
			const btnRef = react.useRef(null);
			const listRef = react.useRef(null);
			const trackRef = react.useRef(null);

			const current = state?.current ?? null;
			const groups = state?.groups ?? [];
			const pending = state?.pending ?? null;

			const modelMeta = react.useMemo(() => {
				if (!current) return null;
				for (const group of groups) {
					for (const model of group.models) {
						if (group.id === current.provider && model.id === current.model) return model;
					}
				}
				return null;
			}, [groups, current]);

			// 首次挂载确保目录加载，按钮标签随之出现。
			react.useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

			const tierIndex = react.useMemo(() => {
				if (!current) return 0;
				const effort = current.reasoningEffort;
				if (!effort) return 0;
				if (effort === modelMeta?.reasoning?.defaultEffort) return 0;
				const at = TIERS.findIndex((tier) => tier.wire !== undefined && tier.wire === effort);
				return at > 0 ? at : 0;
			}, [current, modelMeta]);

			const place = react.useCallback(() => {
				const rect = btnRef.current === null ? null : btnRef.current.getBoundingClientRect();
				if (rect === null) return;
				let left = rect.left;
				if (left + LIST_WIDTH > window.innerWidth - 12) left = Math.max(12, window.innerWidth - LIST_WIDTH - 12);
				let top = rect.top - LIST_HEIGHT - 8;
				if (top < 12) top = rect.bottom + 8;
				setPos({ left: left, top: top });
			}, []);

			react.useEffect(() => {
				if (!open) return;
				const onDown = (event) => {
					if (btnRef.current !== null && btnRef.current.contains(event.target)) return;
					if (listRef.current !== null && listRef.current.contains(event.target)) return;
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

			const toggleOpen = () => {
				if (locked || !available) return;
				if (open) { setOpen(false); return; }
				load();
				place();
				setOpen(true);
			};

			const pick = (providerId, model) => {
				setOpen(false);
				// 点到当前已在用的模型：只收起来，不必重复提交一次选择。
				if (current !== null && current.provider === providerId && current.model === model.id) return;
				const defaultEffort = model?.reasoning?.defaultEffort;
				select({
					provider: providerId,
					model: model.id,
					...(defaultEffort === undefined ? {} : { reasoningEffort: defaultEffort })
				});
			};

			const setTier = (index) => {
				if (!current || busy) return;
				const tier = TIERS[index];
				if (tier === undefined) return;
				setBusy(true);
				setError(null);
				const apply = () => {
					select({
						provider: current.provider,
						model: current.model,
						...(tier.wire === undefined ? {} : { reasoningEffort: tier.wire })
					})
						.then((result) => {
							if (result && !result.ok) setError((result.error && result.error.message) || "设置失败");
							setBusy(false);
						})
						.catch((err) => { setError(String((err && err.message) || err)); setBusy(false); });
				};
				// 「默认」档不需要声明；其余档先确保模型声明了 5 档（含 medium）再设档。
				if (index === 0) { apply(); return; }
				// 同一模型本页已确保过完整 5 档，就直接设档，跳过 /ensure —— 否则每次点击都会
				// 走 configEditor 写入 + Loader 热重载，造成切换延迟 / 卡顿。
				const key = current.provider + "\u0000" + current.model;
				if (ensuredKeys.has(key)) { apply(); return; }
				fetch(API_ENSURE, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ provider: current.provider, model: current.model })
				})
					.then((r) => r.json())
					.then((data) => {
						if (data && data.ok) { ensuredKeys.add(key); apply(); }
						else setError((data && data.error) || "声明档位失败");
						setBusy(false);
					})
					.catch(() => { setError("声明档位失败"); setBusy(false); });
			};

			const label = current ? shortName(current.model) : "选择模型";
			const title = current
				? current.model + (modelMeta !== null ? " · " + (modelMeta.reasoning ? "支持思考" : "无思考能力") : "")
				: "单击选择模型";

			const trackDisabled = locked || !available || busy || current === null;
			const tierFromPointer = (clientX) => {
				const el = trackRef.current;
				if (el === null) return tierIndex;
				const rect = el.getBoundingClientRect();
				// 点距处的内边距(border 1 + padding 2)对应可交互的内容区，5 个球正好铺满，
				// 用内容区宽度均分 4 格即可让「点最后一个球 → 最后一档」对准。
				const inset = 3;
				const contentW = rect.width - inset * 2;
				if (contentW <= 0) return tierIndex;
				const ratio = (clientX - (rect.left + inset)) / contentW;
				return Math.max(0, Math.min(TIERS.length - 1, Math.round(ratio * (TIERS.length - 1))));
			};
			const onTrackPointerDown = (e) => {
				if (trackDisabled) return;
				e.preventDefault();
				if (typeof e.currentTarget.setPointerCapture === "function") e.currentTarget.setPointerCapture(e.pointerId);
				setDragging(true);
				setHover(tierFromPointer(e.clientX));
			};
			const onTrackPointerMove = (e) => {
				if (trackDisabled) { setHover(null); return; }
				setHover(tierFromPointer(e.clientX));
			};
			const onTrackPointerLeave = () => {
				if (!dragging) setHover(null);
			};
			const onTrackPointerUp = (e) => {
				if (!dragging) return;
				e.preventDefault();
				setDragging(false);
				setTier(hover !== null ? hover : tierFromPointer(e.clientX));
				setHover(null);
			};
			const onTrackKeyDown = (e) => {
				if (trackDisabled) return;
				if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setTier(Math.max(0, tierIndex - 1)); }
				else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setTier(Math.min(TIERS.length - 1, tierIndex + 1)); }
			};

			const rows = [];
			const sortedGroups = [...groups].sort((a, b) => byName(a.name, b.name));
			for (const group of sortedGroups) {
				// 用模型 id 里最后一个 `/` 或 `\` 的前缀分桶，前缀并进一级标题：`merge · cf`。
				const buckets = new Map();
				for (const model of group.models) {
					const { prefix } = splitPrefix(model.id);
					if (!buckets.has(prefix)) buckets.set(prefix, []);
					buckets.get(prefix).push(model);
				}
				const bucketKeys = [...buckets.keys()].sort((a, b) => {
					if (a === null) return -1;
					if (b === null) return 1;
					return byName(a, b);
				});
				for (const prefix of bucketKeys) {
					const models = buckets.get(prefix).sort((a, b) => byName(a.name, b.name));
					const heading = prefix === null ? group.name : group.name + " · " + prefix;
					rows.push(h("div", { key: "g:" + group.id + "/" + (prefix ?? ""), className: "dts-group-head" }, capLabel(heading)));
					for (const model of models) {
						const active = current !== null && current.provider === group.id && current.model === model.id;
						rows.push(h("button", {
							key: group.id + "/" + model.id,
							type: "button",
							className: "dts-model-row" + (active ? " dts-active" : ""),
							disabled: pending !== null && !active,
							onClick: () => pick(group.id, model)
						}, cap(prefix === null ? (model.name || model.id) : splitPrefix(model.id).base)));
					}
				}
			}

			return h("div", { className: "dts-seat" }, [
				h("button", {
					key: "btn",
					ref: btnRef,
					type: "button",
					className: "dts-mbtn",
					title: title,
					disabled: locked || !available,
					"data-open": open ? "true" : undefined,
					onClick: toggleOpen
				}, [
					label,
					h("span", { key: "caret", className: "dts-caret" }, open ? "▲" : "▼")
				]),
				error
					? h("span", { key: "err", className: "dts-err", title: error }, "!")
					: null,
				h("div", { key: "slider", className: "dts-slider", title: TIERS.map((t) => t.label).join(" / ") }, [
					h("div", {
						key: "track",
						ref: trackRef,
						role: "slider",
						tabIndex: trackDisabled ? -1 : 0,
						"aria-label": "思考强度",
						"aria-valuemin": "0",
						"aria-valuemax": String(TIERS.length - 1),
						"aria-valuenow": String(tierIndex),
						className: "dts-track" + (trackDisabled ? " dts-disabled" : ""),
						onPointerDown: onTrackPointerDown,
						onPointerMove: onTrackPointerMove,
						onPointerLeave: onTrackPointerLeave,
						onPointerUp: onTrackPointerUp,
						onPointerCancel: onTrackPointerUp,
						onKeyDown: onTrackKeyDown,
						onBlur: () => setHover(null)
					}, TIERS.map((tier, i) => h("span", {
						key: i,
						className: "dts-dot"
						+ (i === tierIndex ? " dts-on" : "")
						+ (i === hover ? " dts-hover" : "")
					}))),
					h("span", { key: "tier", className: "dts-tier" }, TIERS[tierIndex].label)
				]),
				open
					? reactDom.createPortal(
						h("div", {
							ref: listRef,
							className: "dts-list",
							style: pos === null ? { visibility: "hidden", left: 0, top: 0 } : { left: pos.left + "px", top: pos.top + "px" }
						}, rows.length > 0 ? rows : h("div", { className: "dts-empty" }, "暂无可用模型")),
						container
					)
					: null
			]);
		}

		const inject = ["slots", "modelDirectories", "sessions"];

		/**
		 * 输入框右侧的「思考」勾选框：勾选状态 = 当前模型在 llm-pi-ai 配置里是否
		 * 声明了 reasoningEfforts。勾上 → 补全 5 档声明；取消 → 删除声明。
		 */
		function ThinkingStrengthCheckbox({ useProjection }) {
			const selection = useProjection("modelSelection");
			const projected = selection?.next ?? selection?.lastUsed ?? null;
			const [fallback, setFallback] = react.useState(null);
			const current = projected ?? fallback;

			const [has, setHas] = react.useState(false);
			const [busy, setBusy] = react.useState(false);
			const [loading, setLoading] = react.useState(false);
			const [error, setError] = react.useState(null);

			const requestKey = projected ? projected.provider + "\u0000" + projected.model : "\u0000default";

			react.useEffect(() => {
				let cancelled = false;
				setLoading(true);
				setError(null);
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
						? " · 已声明 reasoningEfforts（5 档开关）"
						: " · 未声明 reasoningEfforts · 勾选后写入 llm-pi-ai 配置");

			return h(
				"span",
				{ className: "dts-check" + (has ? " dts-check-on" : ""), title: title },
				h("span", null, "思考"),
				h("input", {
					type: "checkbox",
					checked: has,
					disabled: busy || loading,
					onChange: toggle
				})
			);
		}

		function apply(ctx) {
			const models = ctx.modelDirectories;
			const sessions = ctx.sessions;
			ctx.slots.inject("conversation.input.model", () =>
				ctx.slots.register(
					{
						name: "conversation.input.model",
						priority: -1,
						inject: (sessionId) => {
							const directory = models.directoryFor(sessionId);
							const available = sessions.subagentAddress(sessionId) === undefined;
							return {
								available: available,
								directory: directory.store,
								load: () => { if (available) directory.load().catch(() => { /* 错误落在 store 上 */ }); },
								select: (selection) => available ? directory.select(selection) : Promise.resolve(undefined)
							};
						}
					},
					ThinkingModelSeat
				)
			);
			ctx.slots.inject("conversation.input.right", () =>
				ctx.slots.register(
					{ name: "conversation.input.right", id: "thinking-strength", order: 20 },
					ThinkingStrengthCheckbox
				)
			);
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});