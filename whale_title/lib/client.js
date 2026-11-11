window.__ModuleLoader__.load({
	id: "dsh-whale-title",
	factory: () => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/**
		 * dsh-whale-title 浏览器半边：鲸鱼绘制 + document.title 守卫 + 帧源接线。
		 *
		 * 帧源有两条，自动切换：
		 *   · SSE（/api/whale-title.stream）：宿主每 180ms 推一帧号， awakened by
		 *     网络事件，不受 Chromium 后台定时器节流影响 —— 窗口最小化动画也照走；
		 *   · 本地降级（EventSource 连不上/掐断时）：轮询快照接口 + 本地 180ms 计时，
		 *     属于「能画总比不画强」，后台标签页可能被节流拖慢。
		 *
		 * document.title 守卫是本半边唯一影响页面的东西，见 installGuard()；
		 * 没有注册任何 UI（slot）、不挂任何可视元素。
		 */

		/** 宿主半边注册的入口（走 connection 鉴权通道，同源即可）。 */
		var STREAM_PATH = "/api/whale-title.stream";
		var STATUS_PATH = "/api/whale-title.status";
		/** 与宿主 FRAME_MS 一致；快照接口的 frameMs 优先。 */
		var FRAME_MS = 180;
		var POLL_MS = 700;
		/** 看门狗周期与服务端事件超过这个毫秒数就判陈旧（> 空闲心跳 3.6s）。 */
		var STALE_MS = 6000;

		/* ----------------------------------------------------------------- */
		/* 鲸鱼帧：dsh_shell.py TaskbarJobWatcher._frame 的 JS 移植               */
		/* ----------------------------------------------------------------- */

		/**
		 * 12 字符宽的地带里：鲸鱼按三角波匀速左右往返；三层浪（内 ≈、中 ~、外 -）
		 * 从鲸鱼两侧一层层泛起又收回，相位错开 2 帧，形成「一层推一层」的涟漪。
		 * 帧号只在任务运行期间递增，停走不停帧。
		 */
		var WIDTH = 12;
		var CENTER = (WIDTH - 1) / 2;
		var AMP = WIDTH / 2 - 2;
		var LAYERS = [
			[1, 3, "≈", 0],
			[2, 4, "~", 2],
			[3, 5, "-", 4]
		];

		function frameOf(tick) {
			var t = (tick % 8) / 8;
			var tri = t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
			var pos = Math.round(CENTER + AMP * tri);
			if (pos < 1) pos = 1;
			else if (pos > WIDTH - 2) pos = WIDTH - 2;
			var chars = new Array(WIDTH);
			for (var i = 0; i < WIDTH; i++) chars[i] = "~";
			chars[pos] = "🐋";
			for (var l = 0; l < LAYERS.length; l++) {
				var lo = LAYERS[l][0], hi = LAYERS[l][1], ch = LAYERS[l][2], offset = LAYERS[l][3];
				var ph = ((tick + offset) % 16) / 16;
				var r = ph < 0.5 ? 2 * ph * hi : 2 * (1 - ph) * hi;
				var reach = hi;
				if (Math.floor(r) < reach) reach = Math.floor(r);
				for (var dist = lo; dist <= reach; dist++) {
					if (pos - dist >= 0) chars[pos - dist] = ch;
					if (pos + dist < WIDTH) chars[pos + dist] = ch;
				}
			}
			return chars.join("");
		}

		try {
			var reducedMotion =
				typeof window.matchMedia === "function" &&
				window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		} catch (error) {
			reducedMotion = false;
		}
		/**
		 * reduced-motion（Windows「动画效果」关闭）时不用静帧、也不停动画：
		 * 旧版压根没有这个降级，任务栏鲸鱼是「任务在跑」的功能性状态指示，
		 * 保留动画才是复刻。这里只把它记下来打个日志，方便排障时知道
		 * 系统偏好（如果哪天想恢复降级，改 showFrame 里的分支即可）。
		 */
		if (reducedMotion) {
			try { console.log("[dsh-whale-title] 系统偏好 prefers-reduced-motion: reduce，动画照常播放（复刻旧版行为）"); } catch (error) { /* 日志失败无所谓 */ }
		}

		/* ----------------------------------------------------------------- */
		/* document.title 守卫                                                 */
		/* ----------------------------------------------------------------- */

		/**
		 * 标题守卫：拦「写」，不拦「读」，不碰浏览器原生行为。
		 *
		 * 官方（dsh-client-ui-layout 的 effect）每次 `document.title = …`：
		 *   · 被记成 intended（「官方现在想让标题是什么」）；
		 *   · 空闲时直接放行 —— 官方行为一个字节都不受影响；
		 *   · 运行中吞掉不上屏（画布由帧事件写）。
		 * 任务结束时把最新 intended 用原生 setter 复写回去 —— 即使任务中途
		 * 切了会话/换了语言，恢复的也是官方**当前应显示**的字，不会滚回旧值。
		 *
		 * 实现是把 document 实例上的 `title` 影子化成一对访问器，原型链上
		 * 的原生访问器（getter/setter）在闭包里当隧道用：守卫模式下我们的帧
		 * 也走隧道里的 setter 直写，不会污染 intended。
		 */
		var doc = document;
		var guard = {
			installed: false,
			on: false,
			intended: "",
			setter: null
		};
		/** 守卫安装失败的退化模式：接管前的原始标题（每轮运行开始时记录）。 */
		var bareIntended = null;

		function installGuard() {
			if (guard.installed) return;
			try {
				var owner = doc;
				var desc = null;
				while (owner) {
					var found = Object.getOwnPropertyDescriptor(owner, "title");
					if (found && typeof found.get === "function" && typeof found.set === "function") {
						desc = found;
						break;
					}
					owner = Object.getPrototypeOf(owner);
				}
				if (!desc || !desc.configurable) return;
				var rawGet = desc.get;
				var rawSet = desc.set;
				guard.setter = function (text) { rawSet.call(doc, text); };
				guard.intended = String(rawGet.call(doc));
				Object.defineProperty(doc, "title", {
					configurable: true,
					enumerable: true,
					get: function () { return rawGet.call(doc); },
					set: function (value) {
						guard.intended = String(value);
						if (!guard.on) rawSet.call(doc, value);
					}
				});
				guard.installed = true;
			} catch (error) {
				console.error("[dsh-whale-title] document.title 守卫装不上，退化为直写模式：", error);
			}
		}

		function uninstallGuard() {
			if (!guard.installed) return;
			try {
				// 实例影子删除后，原型链上的原生访问器恢复原样；再把 intended
				// 落回真实标题，页面不留任何插件痕迹。
				delete doc.title;
				if (guard.setter) guard.setter(guard.intended);
			} catch (error) {
				console.error("[dsh-whale-title] 卸载标题守卫失败：", error);
			}
			guard.installed = false;
			guard.on = false;
		}

		/** 开始活动时调用：退化模式下先记住官方标题。 */
		function beginRun() {
			if (guard.on) return;
			if (!guard.installed && bareIntended === null) bareIntended = String(doc.title);
			guard.on = true;
		}

		/**
		 * 标题写入预算。
		 *
		 * 为什么要这个：改 <title> 不是"画个看不见的标题"，而是给 head 打脏标记 ——
		 * 这个应用的 CSS 里有 67 条 :has() 规则（html/head/body 上都有），Chrome 的
		 * :has() 失效判定是"把相关子树整体标脏"，于是每改一次标题都要整篇重算样式。
		 * 2026-11-11 实测（35k 节点）：改一次之后强制布局从 0.02ms 变成 287ms。
		 * 180ms 一帧 × 5.5 帧/秒 = 1.6 秒/秒，主线程直接被吃穿（帧率掉到 2fps）。
		 *
		 * 所以这里按"实测成本"自适应降频：一次写入最多占 1/8 的主线程预算，
		 * 其余留给页面自己。文档小的时候照旧 180ms 一帧，文档涨了就自动变慢。
		 */
		var budget = { lastAt: 0, lastText: null, cost: 0.3, sinceProbe: 0, interval: FRAME_MS };

		/** 量一次"写标题 + 随后整篇重算"的真实耗时；每 8 次写入量一次。 */
		function measureCost() {
			try {
				var t0 = performance.now();
				void document.body.offsetHeight;
				var cost = performance.now() - t0;
				if (cost >= 0 && cost < 8000) {
					budget.cost = budget.cost * 0.6 + cost * 0.4;
					budget.interval = Math.max(FRAME_MS, Math.min(5000, Math.round(budget.cost * 8)));
				}
			} catch (error) {
				// 量不到就按上一轮的节奏继续
			}
		}

		/** 画一帧。帧号来自帧源（SSE 或本地降级计时）。 */
		function showFrame(k) {
			// 只在"人在看"以外的时候画：最小化 / 被完全遮住 / 丢了焦点。
			// 这个动画的用途是切走以后在任务栏 / Alt-Tab 里确认任务还在跑；人正盯着界面看的时候
			// 画它纯属浪费主线程（一次写入 = 一次整篇样式重算，35k 节点实测 287ms）。
			if (doc.hidden !== true && document.hasFocus()) return;
			var text = frameOf(k);
			// 同一帧文本不重复写：重复写等于白白触发一次整篇重算
			if (text === budget.lastText) return;
			var now = performance.now();
			if (budget.lastAt !== 0 && now - budget.lastAt < budget.interval) return;
			beginRun();
			budget.lastAt = now;
			budget.lastText = text;
			try {
				if (guard.installed) guard.setter(text);
				else doc.title = text;
			} catch (error) {
				// 上一帧写失败通常是页面在销毁边缘；下一帧再试
			}
			if (budget.sinceProbe > 0) budget.sinceProbe--;
			else {
				budget.sinceProbe = 8;
				measureCost();
			}
		}

		/**
		 * 可见性切换：回到前台立刻把标题还给官方（鲸鱼帧只属于后台），
		 * 切到后台则清掉预算，让下一帧立刻画出来。
		 */
		function onPresenceChange() {
			if (doc.hidden !== true && document.hasFocus() && guard.on) {
				try { guard.setter(guard.intended); } catch (error) { /* 页面在销毁边缘 */ }
			}
			budget.lastAt = 0;
			budget.lastText = null;
		}

		/** 结束活动：标题恢复成官方当前意图。 */
		function endRun() {
			if (!guard.on) return;
			guard.on = false;
			// 下一轮开始的第一帧要能立刻画出来，别被上一轮的预算卡住
			budget.lastAt = 0;
			budget.lastText = null;
			try {
				if (guard.installed) guard.setter(guard.intended);
				else if (bareIntended !== null) doc.title = bareIntended;
			} catch (error) {
				console.error("[dsh-whale-title] 恢复标题失败：", error);
			}
			bareIntended = null;
		}

		/* ----------------------------------------------------------------- */
		/* 帧源：SSE 为主，本地降级为底                                          */
		/* ----------------------------------------------------------------- */

		var es = null;
		var lastServerAt = 0;
		var pollHandle = null;
		var tickHandle = null;
		var localTick = 0;
		var localRunning = false;

		function markServerAlive() {
			lastServerAt = Date.now();
		}

		function onServerFrame(event) {
			markServerAlive();
			var k = null;
			try {
				k = JSON.parse(event.data).k;
			} catch (error) {
				return;
			}
			if (typeof k === "number" && Number.isFinite(k)) showFrame(k);
		}

		function onServerState(event) {
			markServerAlive();
			var running = false;
			try {
				running = JSON.parse(event.data).r === 1;
			} catch (error) {
				return;
			}
			if (!running) endRun();
		}

		function connectStream() {
			if (typeof EventSource !== "function") return;
			try {
				es = new EventSource(STREAM_PATH);
			} catch (error) {
				es = null;
				return;
			}
			es.addEventListener("open", markServerAlive);
			es.addEventListener("fr", onServerFrame);
			es.addEventListener("st", onServerState);
			es.addEventListener("hb", markServerAlive);
			// onerror：EventSource 自己按 retry 节奏重连，这里不动作；
			// 长时间连不上由看门狗走本地降级。
		}

		function pollStatusOnce() {
			fetch(STATUS_PATH, { cache: "no-store" })
				.then(function (response) { return response.ok ? response.json() : null; })
				.then(function (data) {
					if (data == null) return;
					localRunning = !!data.running;
					if (localRunning) showFrame(++localTick);
					else endRun();
				})
				.catch(function () { /* 下一轮再说 */ });
		}

		function localFrameTick() {
			if (localRunning) showFrame(++localTick);
		}

		function startLocal() {
			if (pollHandle != null) return;
			pollHandle = window.setInterval(pollStatusOnce, POLL_MS);
			tickHandle = window.setInterval(localFrameTick, FRAME_MS);
			pollStatusOnce();
		}

		function stopLocal() {
			if (pollHandle != null) window.clearInterval(pollHandle);
			if (tickHandle != null) window.clearInterval(tickHandle);
			pollHandle = null;
			tickHandle = null;
			localRunning = false;
		}

		/**
		 * 看门狗：SSE 连不上/掐断得太久才上本地降级；SSE 活着（哪怕是空闲，
		 * 心跳 hb 每 3.6s 一次撑着新鲜度）就用它，停掉降级。
		 */
		function watchdog() {
			var dead = es == null || es.readyState === 2;
			var stale = Date.now() - lastServerAt > STALE_MS;
			if (dead || stale) startLocal();
			else stopLocal();
		}

		var watchdogHandle = null;

		function start() {
			installGuard();
			connectStream();
			// 可见性 + 焦点：两者任一"离开"就开始画，回到"看得见且有焦点"就还标题
			document.addEventListener("visibilitychange", onPresenceChange);
			window.addEventListener("blur", onPresenceChange);
			window.addEventListener("focus", onPresenceChange);
			if (watchdogHandle == null) {
				watchdogHandle = window.setInterval(watchdog, POLL_MS);
			}
		}

		function teardown() {
			if (es != null) {
				try { es.close(); } catch (error) { /* 已经死了 */ }
				es = null;
			}
			stopLocal();
			if (watchdogHandle != null) {
				window.clearInterval(watchdogHandle);
				watchdogHandle = null;
			}
			document.removeEventListener("visibilitychange", onPresenceChange);
			window.removeEventListener("blur", onPresenceChange);
			window.removeEventListener("focus", onPresenceChange);
			endRun();
			uninstallGuard();
		}

		/** 本插件需要的客户端服务：一个都没有（不占任何 slot、不走任何 timer 服务）。 */
		function apply(ctx) {
			start();
			if (ctx && typeof ctx.effect === "function") {
				ctx.effect(function () { return teardown; }, "dsh-whale-title: restore document title");
			}
		}

		exports.inject = [];
		exports.apply = apply;
		return module.exports;
	}
});
