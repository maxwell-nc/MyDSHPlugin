window.__ModuleLoader__.load({
	id: "dsh-thinking-strength",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var reactDom = require("react-dom");
		/**
		 * 模型名规范化由 dsh-model-name 提供。它不在客户端的静态种子表里：干净 profile 里
		 * 没装它时 require 会直接抛（client-modules 未命中模块表就 throw），一旦抛在 factory
		 * 里，整个网页半边（模型座 / 滑块 / 记忆）会一起没掉，用户只看到「什么都没发生」。
		 * 所以这里兜一层：拿不到就退回等价的本地实现，只损失「名字更好看」，功能不受影响。
		 */
		var modelName = (function () {
			try {
				return require("dsh-model-name");
			} catch (err) {
				console.warn("[dsh-thinking-strength] 没有 dsh-model-name，改用本地兜底的模型名显示：" + String((err && err.message) || err));
				const shortName = (id) => {
					if (!id) return "";
					const parts = String(id).split(/[/\\]/u);
					return parts[parts.length - 1].trim();
				};
				const cap = (s) => (s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s);
				const splitPrefix = (text) => {
					if (!text) return { prefix: null, base: "" };
					const s = String(text);
					const idx = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
					if (idx < 0) return { prefix: null, base: s };
					return { prefix: s.slice(0, idx), base: s.slice(idx + 1) };
				};
				const normalize = (name) => {
					const s = String(name ?? "").trim();
					if (s.length === 0) return s;
					return s.split("-").map((seg) => cap(String(seg).replace(/^v(?=\d)/i, "V"))).join("-");
				};
				return {
					shortName: shortName,
					cap: cap,
					splitPrefix: splitPrefix,
					normalize: normalize,
					displayName: (id) => normalize(shortName(id))
				};
			}
		})();

		/**
		 * 徽章切分：把显示名末尾的「套餐 / 渠道 / 构建」标记从名字里切出来，单独画成徽章。
		 *
		 *   DeepSeek-V4-Flash-0731-TokenPlan → DeepSeek-V4-Flash + 徽章 0731-TokenPlan
		 *   Qwen3.8-27B-TokenPlan            → Qwen3.8-27B       + 徽章 TokenPlan
		 *   GLM-5.3-Flash-Free               → GLM-5.3-Flash     + 徽章 Free
		 *   GLM-5.3                          → GLM-5.3           （无徽章）
		 *
		 * 规则以共享 dsh-model-name 的 splitBadge 为准（与 usage 同一套，改一处两处都变）；
		 * 它没装或版本较旧时退回下面这份等价实现，只影响徽章画在哪，不影响功能。
		 * **纯显示层**：只改画出来的样子，模型 id 一个字都不动。
		 */
		const BADGE_WORDS = new Set(["tokenplan", "free", "trial", "beta", "preview", "demo", "dl"]);
		const BUILD_SEGMENT = /^\d{4}$/;
		/** 本地兜底的徽章切分（至少留一段基础名；整名都是标记时不切）。 */
		function localSplitBadge(text) {
			const s = String(text ?? "").trim();
			if (s.length === 0) return { base: "", badge: "" };
			const segments = s.split("-");
			let cut = segments.length;
			while (cut > 1) {
				const seg = segments[cut - 1];
				if (!BUILD_SEGMENT.test(seg) && !BADGE_WORDS.has(seg.toLowerCase())) break;
				cut -= 1;
			}
			if (cut === segments.length) return { base: s, badge: "" };
			return { base: segments.slice(0, cut).join("-"), badge: segments.slice(cut).join("-") };
		}
		/** 显示名的 `{ base, badge }`；共享库给出的形状不对（旧版本 / 测试桩）时用本地兜底。 */
		function nameParts(label) {
			const shared = typeof modelName.splitBadge === "function" ? modelName.splitBadge(label) : null;
			if (shared !== null && shared !== undefined && typeof shared.base === "string" && shared.base.length > 0) {
				return { base: shared.base, badge: typeof shared.badge === "string" ? shared.badge : "" };
			}
			return localSplitBadge(label);
		}

		//#region dsh-thinking-strength/client.css
		const css =
			".dts-seat{display:inline-flex;align-items:center;gap:8px;height:26px}" +
			".dts-mbtn{display:inline-flex;align-items:center;gap:4px;height:26px;max-width:320px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1,#d6dbe3);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#ffffff);color:var(--dsw-alias-label-secondary,#5b6478);font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}" +
			".dts-mbtn:hover{border-color:var(--dsw-alias-border-l2,#c2c9d6)}" +
			".dts-mbtn:disabled{opacity:.5;cursor:default}" +
			".dts-mname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".dts-tag{box-sizing:border-box;flex:none;display:inline-flex;align-items:center;max-width:140px;overflow:hidden;text-overflow:ellipsis;padding:1px 7px;border:1px solid #cfe2fb;border-radius:6px;background:#e8f1fe;color:#2f6fd0;font-size:12px;line-height:16px;font-weight:500;letter-spacing:.2px;white-space:nowrap}" +
			".dts-caret{font-size:10px;color:#aab2c0;width:12px;text-align:center;display:inline-block}" +
			".dts-list{position:fixed;z-index:1200;width:300px;max-height:340px;overflow:auto;background:#ffffff;border:1px solid var(--dsw-alias-border-l1,#e8ecf2);border-radius:20px;box-shadow:0 6px 20px rgba(20,25,40,.10),0 1px 4px rgba(20,25,40,.05);padding:8px;color:var(--dsw-alias-label-primary,#20242c);scrollbar-width:none;-ms-overflow-style:none}" +
			".dts-list::-webkit-scrollbar{display:none}" +
			".dts-group-head{display:flex;align-items:center;gap:10px;padding:10px 8px 8px 12px;font-size:13px;color:var(--dsw-alias-label-secondary,#5b6478);font-weight:700;white-space:nowrap}" +
			".dts-group-head::after{content:\"\";flex:1;height:1px;background:var(--dsw-alias-border-l1,#e4e8ef)}" +
			".dts-model-row{display:block;width:100%;text-align:left;padding:12px 12px;border:none;border-radius:10px;background:transparent;color:#20242c;font-size:13px;line-height:1;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
			".dts-model-row:hover{background:#f2f5fb}" +
			".dts-model-row.dts-active{color:#4176E6;font-weight:600}" +
			".dts-model-row:disabled{opacity:.5;cursor:default}" +
			".dts-row{display:flex;align-items:center;gap:10px;min-width:0}" +
			".dts-row-main{display:flex;align-items:center;gap:6px;flex:1;min-width:0}" +
			".dts-row-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
			".dts-star{flex:none;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:15px;line-height:1;color:#e6eaf1;cursor:pointer;opacity:0;border:none;background:none;padding:0;transition:none}" +
			".dts-star:hover{opacity:1;color:#c6cdd9}" +
			".dts-star.dts-star-on{opacity:1;color:#f4c531}" +
			".dts-star.dts-star-on:hover{color:#ffd75e}" +
			".dts-empty{padding:10px 8px;font-size:12px;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dts-slider{display:inline-flex;align-items:center;gap:6px}" +
			".dts-track{position:relative;display:flex;align-items:center;justify-content:space-between;padding:2px;width:96px;height:22px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#edf0f5);border:1px solid var(--dsw-alias-border-l1,#d6dbe3);cursor:pointer;touch-action:none;box-sizing:border-box;transition:none}" +
			".dts-track.dts-disabled{cursor:default}" +
			".dts-dot{width:16px;height:16px;border-radius:50%;background:#e6eaf0;box-sizing:border-box;transition:none}" +
			".dts-dot.dts-hover{background:#aeb6c6}" +
			".dts-dot.dts-on{background:#4176E6}" +
			".dts-dot.dts-on.dts-hover{background:#5b8ef5}" +
			".dts-tier{font-size:11px;color:var(--dsw-alias-label-secondary,#5b6478);min-width:22px;text-align:center}" +
			".dts-err{color:var(--dsw-alias-state-error-primary,#e5484d);font-size:11px;line-height:1}";
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
		/** 本地收藏（星标）模型，持久化键。 */
		const FAV_KEY = "dsh-thinking-strength:favs";
		/** 目录不可用时的兜底快照存储（避免 inject 异常把席位整个带崩）。快照必须稳定缓存。 */
		const noopSnapshot = { current: null, routable: null, groups: [], failures: [], status: "error", pending: null, error: null };
		const noopStore = {
			subscribe: () => () => {},
			getSnapshot: () => noopSnapshot
		};
		const noopLoad = () => {};
		const noopSelect = () => Promise.resolve(undefined);

		/** 列表按原始名称 a–z 排序（组名、模型名都用）。 */
		function byName(a, b) {
			return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
		}

		/** 供应商标题里的每个 ` · ` 片段各自首字母大写（复用共享 dsh-model-name 的 cap）。 */
		function capLabel(s) {
			return String(s).split(" · ").map(modelName.cap).join(" · ");
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
			const store = directory && typeof directory.subscribe === "function" ? directory : noopStore;
			const safeLoad = typeof load === "function" ? load : noopLoad;
			const safeSelect = typeof select === "function" ? select : noopSelect;
			const state = react.useSyncExternalStore(store.subscribe, store.getSnapshot);
			const [open, setOpen] = react.useState(false);
			const [pos, setPos] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [error, setError] = react.useState(null);
			const [hover, setHover] = react.useState(null);
			const [favs, setFavs] = react.useState(() => {
				try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); }
				catch { return new Set(); }
			});
			const toggleFav = (provider, model) => {
				setFavs((prev) => {
					const next = new Set(prev);
					const key = provider + "\u0000" + model;
					if (next.has(key)) next.delete(key); else next.add(key);
					try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch { /* 忽略 */ }
					return next;
				});
			};
			const [dragging, setDragging] = react.useState(false);
			const btnRef = react.useRef(null);
			const listRef = react.useRef(null);
			const trackRef = react.useRef(null);

			const current = state?.current ?? null;
			const groups = state?.groups ?? [];
			const pending = state?.pending ?? null;
			/** 目录 store 记下的最近一次失败（如另一个窗口持有会话写入权），内置席位是走 toast 的。 */
			const storeError = state?.error ?? null;

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
			react.useEffect(() => { try { safeLoad(); } catch { /* 忽略 */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
				// 优先在按钮下方展开，避免列表盖住按钮；下方放不下才翻到上方。
				// 上方展开时留足 18px，避开按钮/输入行的投影。
				let top = rect.bottom + 8;
				if (top + LIST_HEIGHT > window.innerHeight - 12) top = rect.top - LIST_HEIGHT - 18;
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
				try { safeLoad(); } catch { /* 忽略 */ }
				place();
				setOpen(true);
			};

			const pick = (providerId, model) => {
				setOpen(false);
				// 点到当前已在用的模型：只收起来，不必重复提交一次选择。
				if (current !== null && current.provider === providerId && current.model === model.id) return;
				const defaultEffort = model?.reasoning?.defaultEffort;
				setError(null);
				// select 失败不会抛，只回 { ok:false, error }（例如另一个窗口持有会话写入权、
				// 或模型不可用）；这里必须自己接住并显示，否则用户只看到「列表收起、模型没变」。
				Promise.resolve(safeSelect({
					provider: providerId,
					model: model.id,
					...(defaultEffort === undefined ? {} : { reasoningEffort: defaultEffort })
				}))
					.then((result) => {
						if (result && !result.ok) setError((result.error && result.error.message) || "切换模型失败");
					})
					.catch((err) => setError(String((err && err.message) || err)));
			};

			const setTier = (index) => {
				if (!current || busy) return;
				const tier = TIERS[index];
				if (tier === undefined) return;
				const key = current.provider + "\u0000" + current.model;
				setBusy(true);
				setError(null);
				const apply = () => {
					safeSelect({
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
				// 「默认」档 = 关闭思考：撤掉 reasoningEfforts 宣言（宿主顺带清掉该模型的档位记忆），
				// 并不发显式档位（wire 省略 → 走上游默认）。撤宣言后本页的 /ensure 缓存立即失效，
				// 否则下次点非默认档会跳过「补声明」直接被宿主拒掉。
				if (index === 0) {
					fetch(API_SET, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ provider: current.provider, model: current.model, enabled: false })
					})
						.then((r) => r.json())
						.then((data) => {
							if (data && data.ok) { ensuredKeys.delete(key); apply(); }
							else setError((data && data.error) || "关闭思考失败");
							setBusy(false);
						})
						.catch(() => { setError("关闭思考失败"); setBusy(false); });
					return;
				}
				// 非默认档：先确保模型声明了完整 5 档（含 medium）再设档。
				// 同一模型本页已确保过，就直接设档跳过 /ensure —— 否则每次点击都会走
				// configEditor 写入 + Loader 热重载，造成切换延迟 / 卡顿。
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

			// 按钮上的名字：基础名 + 徽章（徽章规则与列表、usage 共用同一套，只改呈现）。
			const currentName = current === null || current === undefined ? null : nameParts(modelName.displayName(current.model));
			const label = currentName === null ? "选择模型" : currentName.base;
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
					const { prefix } = modelName.splitPrefix(model.id);
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
						const label = modelName.normalize(prefix === null ? (model.name || model.id) : modelName.splitPrefix(model.id).base);
						// 名字末尾的套餐 / 渠道 / 构建标记（TokenPlan、Free、0731…）单独画成徽章，
						// 只影响呈现：点的还是同一个 model.id，收藏也仍按 id 记。
						const parts = nameParts(label);
						const fav = favs.has(group.id + "\u0000" + model.id);
						rows.push(h("button", {
							key: group.id + "/" + model.id,
							type: "button",
							className: "dts-model-row" + (active ? " dts-active" : ""),
							disabled: pending !== null && !active,
							onClick: () => pick(group.id, model)
						}, h("span", { className: "dts-row" }, [
							h("span", { className: "dts-row-main" }, [
								h("span", { className: "dts-row-label" }, parts.base),
								parts.badge.length > 0
									? h("span", { className: "dts-tag", title: parts.badge }, parts.badge)
									: null
							]),
							h("span", {
								role: "button",
								tabIndex: -1,
								title: (fav ? "取消收藏" : "收藏") + " " + label,
								className: "dts-star" + (fav ? " dts-star-on" : ""),
								onClick: (e) => { e.preventDefault(); e.stopPropagation(); toggleFav(group.id, model.id); }
							}, "★")
						])));
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
					h("span", { key: "name", className: "dts-mname" }, label),
					currentName !== null && currentName.badge.length > 0
						? h("span", { key: "tag", className: "dts-tag" }, currentName.badge)
						: null,
					h("span", { key: "caret", className: "dts-caret" }, open ? "▲" : "▼")
				]),
				(error || storeError)
					? h("span", { key: "err", className: "dts-err", title: error || storeError }, "!")
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

		const inject = ["slots", "modelDirectories", "sessions", "remote", "remote.session"];

		function apply(ctx) {
			// 与内置 ui-model-selection 保持一致：显式注入 remote / remote.session，
			// 否则从本插件上下文调 directoryFor 时嵌套服务 remote.session 走不到注入链，
			// 会抛 "cannot get property remote.session without inject"。
			ctx.inject(["slots", "modelDirectories", "sessions", "remote", "remote.session"], (scope) => {
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				const report = (tag, sessionId, detail) => {
					try {
						console.log("[dsh-thinking-strength] " + tag + " session=" + String(sessionId)
							+ " " + JSON.stringify(detail));
					} catch { /* 忽略日志错误 */ }
				};
				scope.slots.inject("conversation.input.model", () =>
					scope.slots.register(
						{
							name: "conversation.input.model",
							priority: -1,
							inject: (sessionId) => {
								let directory;
								let available = false;
								const detail = {
									modelsOk: !!models,
									sessionsOk: !!sessions,
									directoryFor: null,
									directoryForError: null,
									subagentAddress: null,
									subagentError: null
								};
								try {
									if (models && models.directoryFor) {
										directory = models.directoryFor(sessionId);
										detail.directoryFor = directory ? "ok" : "undefined";
									} else {
										detail.directoryFor = "no-service";
									}
								} catch (err) {
									detail.directoryForError = String((err && err.message) || err);
									directory = undefined;
								}
								try {
									const addr = sessions && sessions.subagentAddress
										? sessions.subagentAddress(sessionId)
										: "__undefined_service__";
									available = addr === undefined;
									detail.subagentAddress = addr === undefined ? "undefined" : JSON.stringify(addr);
								} catch (err) {
									detail.subagentError = String((err && err.message) || err);
									available = false;
								}
								report("inject", sessionId, detail);
								return {
									available: available,
									directory: (directory && directory.store) || undefined,
									load: () => { if (directory) directory.load().catch(() => { /* 错误落在 store 上 */ }); },
									select: (selection) => (available && directory) ? directory.select(selection) : Promise.resolve(undefined)
								};
							}
						},
						ThinkingModelSeat
					)
				);
			});
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});