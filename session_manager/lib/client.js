window.__ModuleLoader__.load({
	id: "dsh-session-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var react_dom = require("react-dom");
		//#region dsh-session-manager/client.css
		/**
		 * 样式：一套 dshm- 前缀，颜色全部引用 dsh 主题的 --dsw-* 变量并带兜底值，
		 * 明暗主题自动跟随。布局按「设置面板内容列」约 560px 宽的尺寸做。
		 *
		 * 确认弹层 / toast 走 createPortal 挂 body + z-index 10999 起：设置面板
		 * 自身是 z-1000 的浮层体系，弹层得压在它上面，留在面板 DOM 里也可能被
		 * overflow 裁剪。
		 */
		const css =
			".dshm-root{display:flex;flex-direction:column;gap:10px;min-height:100%;font-family:inherit;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-primary,#1b2130)}" +
			".dshm-tool{display:flex;align-items:center;gap:8px;flex-wrap:wrap}" +
			".dshm-input{flex:1;min-width:140px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.18));border-radius:7px;background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,#1b2130);font:inherit;font-size:12px;outline:none}" +
			".dshm-input:focus{border-color:var(--dsw-alias-state-business-primary,#3d7eff)}" +
			".dshm-select{height:28px;max-width:220px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.18));border-radius:7px;background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-primary,#1b2130);font:inherit;font-size:12px}" +
			".dshm-btn{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.18));border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#5b6478);font:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}" +
			".dshm-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1b2130);border-color:rgba(22,32,58,.35)}" +
			".dshm-btn:disabled{opacity:.45;cursor:default}" +
			".dshm-btn-danger{color:var(--dsw-alias-state-error-primary,#e5484d);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 45%,transparent)}" +
			".dshm-btn-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 14%,transparent);color:var(--dsw-alias-state-error-primary,#e5484d);border-color:var(--dsw-alias-state-error-primary,#e5484d)}" +
			".dshm-btn-solid{border-color:transparent;background:var(--dsw-alias-state-error-primary,#e5484d);color:#fff}" +
			".dshm-btn-solid:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 82%,#000);color:#fff;border-color:transparent}" +
			".dshm-cleans{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary,#5b6478);font-size:12px}" +
			".dshm-stat{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a93a8)}" +
			".dshm-stat b{color:var(--dsw-alias-label-secondary,#5b6478);font-variant-numeric:tabular-nums;font-weight:600}" +
			".dshm-warn{color:var(--dsw-alias-state-warning-primary,#d97706)}" +
			".dshm-ws{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.12));border-radius:10px;background:var(--dsw-alias-fill-l1,rgba(22,32,58,.035))}" +
			".dshm-wsInfo{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}" +
			".dshm-wsTitle{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
			".dshm-wsPath{font-family:ui-monospace,Consolas,'Courier New',monospace;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a93a8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
			".dshm-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.12));border-radius:10px;max-height:52vh;min-height:120px;overflow-y:auto;overscroll-behavior:contain;background:var(--dsw-alias-bg-layer-2,#fff)}" +
			".dshm-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.08));background:var(--dsw-alias-bg-layer-2,#fff)}" +
			".dshm-row:last-child{border-bottom:none}" +
			".dshm-row:hover{background:var(--dsw-alias-fill-l1,rgba(22,32,58,.04))}" +
			".dshm-row-head{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-layer-2,#fff);font-size:12px;color:var(--dsw-alias-label-secondary,#5b6478);padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.12));box-shadow:0 6px 10px -8px rgba(16,24,40,.28)}" +
			".dshm-check{flex:none;width:14px;height:14px;accent-color:var(--dsw-alias-state-business-primary,#3d7eff);cursor:pointer;margin:0}" +
			".dshm-main{flex:1;min-width:0}" +
			".dshm-line1{display:flex;align-items:center;gap:6px;min-width:0}" +
			".dshm-title{font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}" +
			".dshm-title-off{color:var(--dsw-alias-label-tertiary,#8a93a8);font-weight:400}" +
			".dshm-tag{flex:none;font-size:10px;line-height:1;padding:2px 6px;border-radius:999px;white-space:nowrap;background:var(--dsw-alias-fill-l2,rgba(22,32,58,.08));color:var(--dsw-alias-label-tertiary,#8a93a8)}" +
			".dshm-tagLive{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#34a853) 15%,transparent);color:var(--dsw-alias-state-success-primary,#34a853)}" +
			".dshm-tagArch{background:var(--dsw-alias-fill-l2,rgba(22,32,58,.08));color:var(--dsw-alias-label-caption,#98a0b3)}" +
			".dshm-tagPin{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3d7eff) 14%,transparent);color:var(--dsw-alias-state-business-primary,#3d7eff)}" +
			".dshm-tagSub{background:color-mix(in srgb,#8a5cf6 14%,transparent);color:#8a5cf6}" +
			".dshm-tagFork{background:color-mix(in srgb,#f2949f 20%,transparent);color:#e05a72}" +
			".dshm-line2{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a93a8);font-variant-numeric:tabular-nums}" +
			".dshm-muted{font-family:ui-monospace,Consolas,'Courier New',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
			".dshm-side{flex:none;text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary,#8a93a8);font-size:11px;line-height:1.7;white-space:nowrap}" +
			".dshm-side b{display:block;color:var(--dsw-alias-label-secondary,#5b6478);font-weight:600;font-size:12px}" +
			".dshm-del{flex:none;height:22px;padding:0 8px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a93a8);font:inherit;font-size:11px;cursor:pointer}" +
			".dshm-del:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 12%,transparent);color:var(--dsw-alias-state-error-primary,#e5484d)}" +
			".dshm-del:disabled{opacity:.4;cursor:default}" +
			".dshm-batch{position:sticky;bottom:0;z-index:3;display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(22,32,58,.14));border-radius:10px;background:var(--dsw-specific-menu,#fff);backdrop-filter:var(--dsw-menu-backdrop-filter,none);box-shadow:var(--dsw-elevation-card,0 -2px 12px rgba(16,24,40,.08));font-size:12px;color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dshm-batch b{font-variant-numeric:tabular-nums}" +
			".dshm-spacer{flex:1}" +
			".dshm-empty{flex:1;display:flex;align-items:center;justify-content:center;padding:30px 10px;color:var(--dsw-alias-label-tertiary,#8a93a8);font-size:12px;text-align:center;line-height:2}" +
			".dshm-foot{font-size:11px;color:var(--dsw-alias-label-caption,#98a0b3);line-height:1.8;word-break:break-all}" +
			".dshm-path{font-family:ui-monospace,Consolas,'Courier New',monospace;color:var(--dsw-alias-label-tertiary,#8a93a8);word-break:break-all}" +
			".dshm-footBtn{padding:0;border:0;background:0 0;color:var(--dsw-alias-state-business-primary,#3d7eff);font:inherit;font-size:11px;cursor:pointer;text-decoration:underline dotted}" +
			/* 确认弹层（portal 到 body） */
			".dshm-mask{position:fixed;inset:0;z-index:10999;background:rgba(9,12,20,.45)}" +
			".dshm-modal{position:fixed;z-index:11000;left:50%;top:40%;transform:translate(-50%,-50%);width:min(430px,calc(100vw - 48px));box-sizing:border-box;padding:18px 18px 14px;border-radius:14px;background:var(--dsw-specific-menu,#fff);backdrop-filter:var(--dsw-menu-backdrop-filter,none);color:var(--dsw-alias-label-primary,#1b2130);font-size:13px;line-height:1.7;box-shadow:var(--dsw-elevation-prominent,0 18px 48px rgba(16,24,40,.25))}" +
			".dshm-modalTitle{font-size:14px;font-weight:600;margin-bottom:8px}" +
			".dshm-modalBody{color:var(--dsw-alias-label-secondary,#5b6478)}" +
			".dshm-modalBody b{color:var(--dsw-alias-state-error-primary,#e5484d)}" +
			".dshm-modalActions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}" +
			/* toast（portal 到 body） */
			".dshm-toast{position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:11001;max-width:min(520px,calc(100vw - 40px));padding:9px 14px;border-radius:10px;background:rgba(23,29,44,.95);color:#fff;font-size:12px;line-height:1.6;box-shadow:0 10px 26px rgba(16,24,40,.30);word-break:break-all}" +
			".dshm-toast b{color:#ffb4b4}";
		const tagId = "dsh-session-manager/client.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-manager";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region dsh-session-manager/client/index.js
		/** 宿主半边注册的接口（走 connection 鉴权通道，同源 fetch 即可）。 */
		const API_OVERVIEW = "/api/session-mgr.overview";
		const API_TITLES = "/api/session-mgr.titles";
		const API_DELETE = "/api/session-mgr.delete";
		const API_DELETE_WS = "/api/session-mgr.delete-workspace";
		const API_OPEN_DIR = "/api/session-mgr.open-dir";

		/** 标题分批大小（宿主单次上限 200，客户端一次 40 更平滑）。 */
		const TITLE_CHUNK = 40;
		/** 列表最多渲染行数（性能护栏；统计/清理仍基于全量）。 */
		const ROW_LIMIT = 300;
		/** 快捷清理预设（天）。 */
		const CLEAN_PRESETS = [30, 15, 7];
		const DAY_MS = 24 * 60 * 60 * 1000;
		const h = react.createElement;

		function formatSize(bytes) {
			const value = Number(bytes) || 0;
			if (value >= 1024 * 1024 * 1024) return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
			if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
			if (value >= 1024) return (value / 1024).toFixed(1) + " KB";
			return value + " B";
		}

		function formatStamp(ms) {
			if (!Number.isFinite(ms) || ms <= 0) return "—";
			const d = new Date(ms);
			const pad = (v) => String(v).padStart(2, "0");
			return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
		}

		/** 会话 id 的短可读形（「session-968e8627-…」→「968e8627…」）。 */
		function shortId(id) {
			return String(id).replace(/^session-/, "").slice(0, 8) + "…";
		}

		async function getJson(path) {
			const response = await fetch(path, { cache: "no-store" });
			if (!response.ok) {
				let detail = "";
				try {
					const payload = await response.json();
					if (payload && typeof payload.error === "string") detail = payload.error;
				} catch {
					// 非 JSON 响应
				}
				throw new Error(detail ? detail + "（HTTP " + response.status + "）" : "HTTP " + response.status);
			}
			return await response.json();
		}

		async function postJson(path, body) {
			const response = await fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
				cache: "no-store"
			});
			let payload = null;
			try {
				payload = await response.json();
			} catch {
				// 非 JSON 响应（比如网关 500 的纯文本）
			}
			if (!response.ok) {
				throw new Error((payload && payload.error) || "HTTP " + response.status);
			}
			return payload ?? {};
		}

		/** 安全 toast：内容只来自本插件自己拼的字符串，允许嵌 <b>。 */
		function toastNode(text) {
			return h("div", { className: "dshm-toast", dangerouslySetInnerHTML: { __html: text } });
		}

		/**
		 * 标题缓存：id → string | null | ""（"" = 已登记、正在加载）。
		 * 数据放 ref（重渲染由 rev 计数器驱动）；queue() 可重入，新调用作废旧批次。
		 */
		function useTitles() {
			const store = react.useRef({});
			const token = react.useRef(0);
			const [rev, setRev] = react.useState(0);
			const forget = react.useCallback((ids) => {
				for (const id of ids) delete store.current[id];
			}, []);
			const queue = react.useCallback((rows) => {
				token.current += 1;
				const myToken = token.current;
				const missing = [];
				for (const row of rows) {
					if (!(row.id in store.current)) {
						missing.push(row.id);
						store.current[row.id] = "";
					}
				}
				if (missing.length === 0) return;
				const chunks = [];
				for (let i = 0; i < missing.length; i += TITLE_CHUNK) chunks.push(missing.slice(i, i + TITLE_CHUNK));
				(async () => {
					for (const chunk of chunks) {
						if (token.current !== myToken) return;
						try {
							const payload = await postJson(API_TITLES, { ids: chunk });
							for (const item of payload.titles ?? []) {
								store.current[item.id] =
									typeof item.title === "string" && item.title.length > 0 ? item.title : null;
							}
						} catch {
							for (const id of chunk) store.current[id] = null;
						}
						setRev((v) => v + 1);
					}
				})();
			}, []);
			react.useEffect(() => () => {
				token.current += 1;
			}, []);
			return { store: store.current, rev, queue, forget };
		}

		/**
		 * 确认弹层（portal 到 body）。
		 * confirm = { kind, title, lines, confirmText, onConfirm }
		 */
		function ConfirmModal({ confirm, busy, onCancel }) {
			if (confirm === null) return null;
			return react_dom.createPortal(
				h(
					react.Fragment,
					null,
					h("div", { className: "dshm-mask", onClick: busy ? undefined : onCancel }),
					h(
						"div",
						{ className: "dshm-modal", role: "alertdialog", "aria-label": confirm.title },
						h("div", { className: "dshm-modalTitle" }, confirm.title),
						h(
							"div",
							{ className: "dshm-modalBody" },
							confirm.lines.map((line, i) => h("div", { key: i, dangerouslySetInnerHTML: { __html: line } }))
						),
						h(
							"div",
							{ className: "dshm-modalActions" },
							h("button", { type: "button", className: "dshm-btn", disabled: busy, onClick: onCancel }, "取消"),
							h(
								"button",
								{ type: "button", className: "dshm-btn dshm-btn-solid", disabled: busy, autoFocus: true, onClick: confirm.onConfirm },
								busy ? "执行中…" : confirm.confirmText
							)
						)
					)
				),
				document.body
			);
		}

		/**
		 * 设置页「会话管理」一节。挂在 settings.section 上，渲染进设置面板的内容列。
		 */
		function SessionManagerSection() {
			const [data, setData] = react.useState(null);
			const [phase, setPhase] = react.useState("loading"); // loading | ready | refreshing | error
			const [error, setError] = react.useState("");
			const [wsFilter, setWsFilter] = react.useState("all"); // 'all' | 'none' | <workspaceId>
			const [query, setQuery] = react.useState("");
			const [selected, setSelected] = react.useState(() => new Set());
			const [confirm, setConfirm] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [toast, setToast] = react.useState(null);
			const toastTimer = react.useRef(null);
			const titles = useTitles();

			const showToast = react.useCallback((text) => {
				if (toastTimer.current) window.clearTimeout(toastTimer.current);
				setToast(text);
				toastTimer.current = window.setTimeout(() => {
					setToast(null);
					toastTimer.current = null;
				}, 5000);
			}, []);

			react.useEffect(
				() => () => {
					if (toastTimer.current) window.clearTimeout(toastTimer.current);
				},
				[]
			);

			const load = react.useCallback(async () => {
				setPhase((prev) => (prev === "ready" ? "refreshing" : "loading"));
				try {
					const payload = await getJson(API_OVERVIEW);
					setData(payload);
					setError("");
					setPhase("ready");
				} catch (err) {
					setError(String(err?.message ?? err));
					setPhase("error");
				}
			}, []);

			react.useEffect(() => {
				load();
			}, [load]);

			/* ---------------- 派生视图（全部在 hooks 区内，早退 return 前完成） ---------------- */

			const workspaces = react.useMemo(() => data?.workspaces ?? [], [data]);
			const sessions = react.useMemo(() => data?.sessions ?? [], [data]);

			const scoped = react.useMemo(() => {
				const q = query.trim().toLowerCase();
				return sessions.filter((row) => {
					if (wsFilter === "none") {
						if (row.workspaceId !== null) return false;
					} else if (wsFilter !== "all" && row.workspaceId !== wsFilter) {
						return false;
					}
					if (q.length === 0) return true;
					const title = typeof titles.store[row.id] === "string" ? titles.store[row.id] : "";
					return (
						title.toLowerCase().includes(q) ||
						row.id.toLowerCase().includes(q) ||
						(row.cwd ?? "").toLowerCase().includes(q)
					);
				});
			}, [sessions, wsFilter, query, titles.rev]);

			const visible = react.useMemo(() => scoped.slice(0, ROW_LIMIT), [scoped]);
			const scopeBytes = react.useMemo(
				() => scoped.reduce((sum, row) => sum + (row.sizeBytes || 0), 0),
				[scoped]
			);
			const deletable = react.useMemo(() => scoped.filter((row) => !row.live), [scoped]);
			/** 已归档且未在使用中的会话（「一键删除已归档」的目标，随当前范围过滤）。 */
			const archivedDeletable = react.useMemo(
				() => deletable.filter((row) => row.archived),
				[deletable]
			);
			const checkable = react.useMemo(() => visible.filter((row) => !row.live), [visible]);
			const selectedRows = react.useMemo(
				() => scoped.filter((row) => selected.has(row.id) && !row.live),
				[scoped, selected]
			);
			const selectedBytes = react.useMemo(
				() => selectedRows.reduce((sum, row) => sum + (row.sizeBytes || 0), 0),
				[selectedRows]
			);
			const wsById = react.useMemo(() => {
				const map = new Map();
				for (const ws of workspaces) map.set(ws.id, ws);
				return map;
			}, [workspaces]);
			const allChecked = checkable.length > 0 && checkable.every((row) => selected.has(row.id));
			const currentWs = wsFilter !== "all" && wsFilter !== "none" ? wsById.get(wsFilter) ?? null : null;

			react.useEffect(() => {
				titles.queue(visible);
			}, [titles.queue, visible]);

			/* ---------------- 动作 ---------------- */

			const toggle = (id) => {
				setSelected((prev) => {
					const next = new Set(prev);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return next;
				});
			};

			/** 确认后执行批量删除（只发不在使用中的 id）。 */
			const runDeleteIds = async (ids) => {
				setBusy(true);
				try {
					const result = await postJson(API_DELETE, { ids });
					const deleted = result.deleted ?? [];
					const failed = result.failed ?? [];
					titles.forget(deleted);
					if (deleted.length > 0) {
						showToast(
							failed.length > 0
								? "已删除 <b>" + deleted.length + "</b> 个会话；" + failed.length + " 个未删：" + failed[0].reason
								: "已删除 <b>" + deleted.length + "</b> 个会话"
						);
					} else {
						showToast(failed.length > 0 ? "没有删除任何会话：" + failed[0].reason : "没有删除任何会话");
					}
					setSelected(new Set());
					setConfirm(null);
					await load();
				} catch (err) {
					showToast("删除失败：" + String(err?.message ?? err));
					setConfirm(null);
				} finally {
					setBusy(false);
				}
			};

			const confirmDeleteIds = (rawIds, scopeLabel) => {
				const ids = rawIds.filter((id) => {
					const row = sessions.find((r) => r.id === id);
					return row === undefined || !row.live;
				});
				if (ids.length === 0) return;
				const bytes = ids.reduce((sum, id) => {
					const row = sessions.find((r) => r.id === id);
					return sum + (row?.sizeBytes ?? 0);
				}, 0);
				setConfirm({
					kind: "sessions",
					title: "永久删除会话？",
					lines: [
						"将永久删除 <b>" + ids.length + "</b> 个会话，共约 " + formatSize(bytes) + "的会话日志。",
						"会话文件与侧边栏记录都会被真正清除，<u>不可恢复</u>。"
					],
					confirmText: "删除 " + ids.length + " 个会话" + (scopeLabel ? "（" + scopeLabel + "）" : ""),
					onConfirm: () => runDeleteIds(ids)
				});
			};

			const confirmDeleteWorkspace = (ws) => {
				if (ws === null) return;
				setConfirm({
					kind: "workspace",
					title: "删除整个工作区「" + (ws.title || ws.path) + "」？",
					lines: [
						"将注销该工作区，并<b>永久删除其 " + (ws.sessionCount || 0) + " 个会话</b>（约 " + formatSize(ws.sizeBytes || 0) + "）的日志。",
						"项目文件不受影响，操作不可恢复；若有会话正在运行，本次操作会整体取消。"
					],
					confirmText: "删除工作区",
					onConfirm: async () => {
						setBusy(true);
						try {
							const result = await postJson(API_DELETE_WS, { workspaceId: ws.id });
							if (result.ok) {
								showToast("工作区已删除（清理会话 <b>" + (result.deletedSessions ?? 0) + "</b> 个）");
								setWsFilter("all");
								setSelected(new Set());
								setConfirm(null);
								await load();
							} else {
								showToast("未删除：" + (result.reason ?? "未知原因"));
								setConfirm(null);
							}
						} catch (err) {
							showToast("删除失败：" + String(err?.message ?? err));
							setConfirm(null);
						} finally {
							setBusy(false);
						}
					}
				});
			};

			const openDir = (kind, workspaceId) => {
				postJson(API_OPEN_DIR, { kind, workspaceId })
					.then(() => showToast("已在系统文件管理器中打开"))
					.catch((err) => showToast("打开目录失败：" + String(err?.message ?? err)));
			};

			/* ---------------- 渲染 ---------------- */

			if (phase === "loading") {
				return h("div", { className: "dshm-root" }, h("div", { className: "dshm-empty" }, "正在清点会话库…"));
			}
			if (phase === "error") {
				return h(
					"div",
					{ className: "dshm-root" },
					h(
						"div",
						{ className: "dshm-empty" },
						"读取失败：" + error,
						h("br", null),
						h("button", { type: "button", className: "dshm-btn", onClick: load }, "重试")
					)
				);
			}

			const stat = h(
				"div",
				{ className: "dshm-stat" },
				h("span", null, "本范围 ", h("b", null, scoped.length), " 个会话 · ", formatSize(scopeBytes)),
				h("span", null, "全库 ", h("b", null, sessions.length), " 个 · ", formatSize(data?.totalBytes ?? 0)),
				(data?.archivedCount ?? 0) > 0 ? h("span", null, "已归档 ", h("b", null, data.archivedCount)) : null,
				(data?.pinnedCount ?? 0) > 0 ? h("span", null, "置顶 ", h("b", null, data.pinnedCount)) : null,
				(data?.liveCount ?? 0) > 0 ? h("span", { className: "dshm-warn" }, "使用中 ", h("b", null, data.liveCount)) : null
			);

			const cleans = h(
				"div",
				{ className: "dshm-cleans" },
				"一键清理本范围：",
				CLEAN_PRESETS.map((days) => {
					const cutoff = Date.now() - days * DAY_MS;
					const targets = deletable.filter((row) => row.updatedAt < cutoff);
					const scopeLabel =
						(wsFilter === "all" ? "全部工作区" : wsFilter === "none" ? "未分组" : currentWs?.title ?? "") + " · " + days + " 天前";
					return h(
						"button",
						{
							type: "button",
							key: days,
							className: "dshm-btn dshm-btn-danger",
							disabled: busy || targets.length === 0,
							title: "永久删除本范围内最后更新在 " + days + " 天前的会话（使用中的除外）",
							onClick: () => confirmDeleteIds(targets.map((row) => row.id), scopeLabel)
						},
						days + " 天前（" + targets.length + "）"
					);
				}),
				h(
					"button",
					{
						type: "button",
						className: "dshm-btn dshm-btn-danger",
						disabled: busy || archivedDeletable.length === 0,
						title: "永久删除本范围内所有「已归档」且未在使用中的会话",
						onClick: () => confirmDeleteIds(archivedDeletable.map((row) => row.id), "已归档")
					},
					"已归档（" + archivedDeletable.length + "）"
				)
			);

			const wsCard =
				currentWs === null
					? null
					: h(
							"div",
							{ className: "dshm-ws" },
							h(
								"div",
								{ className: "dshm-wsInfo" },
								h(
									"div",
									{ className: "dshm-wsTitle", title: currentWs.path },
									currentWs.title || currentWs.path,
									"（" + currentWs.sessionCount + " 个会话 · " + formatSize(currentWs.sizeBytes) + "）"
								),
								h("div", { className: "dshm-wsPath", title: currentWs.path }, currentWs.path)
							),
							h(
								"button",
								{ type: "button", className: "dshm-btn", onClick: () => openDir("workspace", currentWs.id) },
								"打开会话目录"
							),
							h(
								"button",
								{
									type: "button",
									className: "dshm-btn dshm-btn-danger",
									disabled: busy,
									onClick: () => confirmDeleteWorkspace(currentWs)
								},
								"删除整个工作区"
							)
					  );

			const listHead = h(
				"div",
				{ className: "dshm-row dshm-row-head" },
				h("input", {
					type: "checkbox",
					className: "dshm-check",
					checked: allChecked,
					disabled: checkable.length === 0,
					title: "全选本范围可删除的会话（使用中的除外）",
					onChange: () => {
						setSelected((prev) => {
							const next = new Set(prev);
							if (allChecked) {
								for (const row of checkable) next.delete(row.id);
							} else {
								for (const row of checkable) next.add(row.id);
							}
							return next;
						});
					}
				}),
				h("span", null, "全选（使用中的除外）"),
				h("div", { className: "dshm-spacer" }),
				h(
					"span",
					null,
					scoped.length > visible.length
						? "仅显示最近 " + visible.length + " / " + scoped.length + " 个（按更新时间）"
						: "按更新时间从新到旧"
				)
			);

			const listRows = visible.map((row) => {
				const title = titles.store[row.id];
				const workspace = row.workspaceId === null ? null : wsById.get(row.workspaceId);
				const checked = selected.has(row.id);
				const cwdTail = (row.cwd ?? "").length > 0 ? (row.cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "") : "";
				return h(
					"div",
					{ className: "dshm-row", key: row.id },
					h("input", {
						type: "checkbox",
						className: "dshm-check",
						checked: checked,
						disabled: row.live || busy,
						title: row.live ? "会话正在使用，关闭后才能删除" : undefined,
						onChange: () => toggle(row.id)
					}),
					h(
						"div",
						{ className: "dshm-main" },
						h(
							"div",
							{ className: "dshm-line1" },
							h(
								"span",
								{ className: "dshm-title" + (title === null ? " dshm-title-off" : ""), title: row.id },
								title === null ? "（无标题会话）" : title === "" ? "…" : title
							),
							row.live ? h("span", { className: "dshm-tag dshm-tagLive" }, "使用中") : null,
							row.archived ? h("span", { className: "dshm-tag dshm-tagArch" }, "已归档") : null,
							row.pinned ? h("span", { className: "dshm-tag dshm-tagPin" }, "置顶") : null,
							row.subagent ? h("span", { className: "dshm-tag dshm-tagSub" }, "子代理") : null,
							row.parent != null && !row.subagent ? h("span", { className: "dshm-tag dshm-tagFork" }, "分支") : null
						),
						h(
							"div",
							{ className: "dshm-line2" },
							h("span", { className: "dshm-muted", title: "创建于 " + formatStamp(row.createdAt) }, shortId(row.id)),
							h("span", { className: "dshm-muted" }, workspace === null ? "未分组" : workspace.title || workspace.path),
							cwdTail.length > 0
								? h("span", { className: "dshm-muted", title: row.cwd }, cwdTail)
								: null
						)
					),
					h(
						"span",
						{ className: "dshm-side" },
						h("b", null, formatSize(row.sizeBytes)),
						formatStamp(row.updatedAt)
					),
					h(
						"button",
						{
							type: "button",
							className: "dshm-del",
							disabled: busy || row.live,
							title: row.live ? "会话正在使用，关闭后才能删除" : "永久删除这个会话",
							onClick: () => confirmDeleteIds([row.id])
						},
						"删除"
					)
				);
			});

			const empty =
				visible.length === 0
					? h(
							"div",
							{ className: "dshm-empty" },
							query.length > 0 ? "没有匹配的会话。" : "这个范围内还没有会话。"
					  )
					: null;

			const batchBar =
				selected.size > 0
					? h(
							"div",
							{ className: "dshm-batch" },
							"已选 ",
							h("b", null, selectedRows.length),
							" 个会话 · ",
							formatSize(selectedBytes),
							selected.size !== selectedRows.length
								? "（使用中的 " + (selected.size - selectedRows.length) + " 个不计入）"
								: "",
							h("div", { className: "dshm-spacer" }),
							h(
								"button",
								{ type: "button", className: "dshm-btn", disabled: busy, onClick: () => setSelected(new Set()) },
								"清除选择"
							),
							h(
								"button",
								{
									type: "button",
									className: "dshm-btn dshm-btn-danger",
									disabled: busy || selectedRows.length === 0,
									onClick: () => confirmDeleteIds([...selected])
								},
								"批量删除"
							)
					  )
					: null;

			const foot = h(
				"div",
				{ className: "dshm-foot" },
				"会话日志保存在 ",
				h("span", { className: "dshm-path", title: data?.sessionRoot }, data?.sessionRoot ?? "—"),
				" · ",
				h("button", { type: "button", className: "dshm-footBtn", onClick: () => openDir("root") }, "打开存储根目录"),
				h("br", null),
				"这里的「删除」会同时清除会话日志文件与注册表记录（官方「归档」只隐藏、不释放磁盘）；正在使用中的会话会被自动跳过。删除后侧边栏会自动同步。"
			);

			return h(
				"div",
				{ className: "dshm-root" },
				h(
					"div",
					{ className: "dshm-tool" },
					h("input", {
						className: "dshm-input",
						placeholder: "搜索标题 / 会话 id / 路径",
						value: query,
						onChange: (e) => setQuery(e.target.value)
					}),
					h(
						"select",
						{
							className: "dshm-select",
							value: wsFilter,
							onChange: (e) => {
								setWsFilter(e.target.value);
								setSelected(new Set());
							}
						},
						h("option", { value: "all" }, "全部工作区（" + sessions.length + "）"),
						h(
							"option",
							{ value: "none" },
							"未分组（" + sessions.filter((r) => r.workspaceId === null).length + "）"
						),
						workspaces.map((ws) =>
							h("option", { value: ws.id, key: ws.id }, (ws.title || ws.path) + "（" + ws.sessionCount + "）")
						)
					),
					h(
						"button",
						{ type: "button", className: "dshm-btn", disabled: phase === "refreshing", onClick: load },
						phase === "refreshing" ? "刷新中…" : "刷新"
					)
				),
				stat,
				cleans,
				wsCard,
				h("div", { className: "dshm-list" }, listHead, listRows, empty),
				batchBar,
				foot,
				h(ConfirmModal, {
					confirm,
					busy,
					onCancel: () => {
						if (!busy) setConfirm(null);
					}
				}),
				toast !== null ? react_dom.createPortal(toastNode(toast), document.body) : null
			);
		}

		/** 本插件需要的客户端服务：只有 slot 注册表（settings.section 由设置壳声明，注入等它出现）。 */
		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject(
				"settings.section",
				() =>
					ctx.slots.register(
						{
							name: "settings.section",
							id: "session-manager",
							order: 25,
							label: "会话管理"
						},
						SessionManagerSection
					)
			);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
