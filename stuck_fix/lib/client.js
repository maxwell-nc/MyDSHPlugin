window.__ModuleLoader__.load({
id: "dsh-stuck-fix",
factory: () => {var module = { exports: {} };var exports = module.exports;/**
 * dsh-stuck-fix —— 桌面端"卡死"引信拆除器（Web 半边）
 * ================================================================
 *
 * 病根在桌面壳 preload（apps/desktop/src/preload-windows.ts 的 syncWindowsAppearance）：
 * 它用 MutationObserver 盯着 document.head 整棵子树（childList + subtree +
 * characterData），每变一次就同步 getComputedStyle(probe) 取色 —— 文档样式一脏，
 * 这一下就是整篇强制重排（实测 3.7k 节点 8~18ms，13k 节点 233ms，本机空闲态 0.34ms）。
 * 流式输出时 head 一秒变动几十次 → 主线程被"变更→重排→变更"的正反馈塞满 →
 * 页面不 yield：不重绘、鼠标不响应、心跳发不出 → 宿主 terminate 长连接 →
 * 界面显示"重新连接中"，实测能卡 26 分钟不恢复。
 *
 * 2026-11-11 用 V8 采样实测：卡死 100s 的窗口里 101,172ms / 101,188ms 采样全落在
 * 这个 send() 上。插件在**主世界**，preload 在**隔离世界**（contextIsolation: true，
 * 实测：页面里包一层 getComputedStyle 之后，往 head 打 10 次变更，一次都没经过它；
 * window.process / require / electron 在主世界也全是 undefined），所以改不到它的代码。
 *
 * 但 preload 自己挂了 pagehide 的收尾：observer.disconnect() + 探针移除 + 菜单销毁。
 * 主世界派发的 DOM 事件能到达隔离世界的监听器 —— 实测 dispatchEvent(new Event
 * ('pagehide')) 之后取色探针确实从 body 上消失了。于是本插件做一件事：
 *
 *   **盯着 head 的变动速率；一旦进入风暴，就替 preload 把这份收尾跑掉。**
 *
 * 代价（必须知情）：标题栏/系统按钮的取色停在最后一次正确的值上，不再随主题变化；
 * titlebar 的原生右键菜单被一并销毁。重新加载窗口（Ctrl+R）恢复原生行为 ——
 * 风暴再来，本插件会再拆一次。
 *
 * 阈值：正常流式输出时 head 变动主要来自鲸鱼标题动画，约 5.5 次/秒；这里取
 * 26 次/秒（或连续两拍 >=16 次/秒）才动手，留足余量，不会误伤。
 */
var TAG = "[dsh-stuck-fix]";

/** 采样节拍（毫秒）。一拍一个桶。 */
var BUCKET_MS = 500;
/** 单拍达到这个数（换算成每秒 = 值 x 2）立刻拆引信 —— 纯速率的天花板。 */
var TRIP_PER_BUCKET = 13;
/** 定时器晚到多少毫秒算"主线程已经被占住"（配合实测重排成本一起判）。 */
var LAG_MS = 120;
/**
 * 判定掉帧时，这一拍至少要有这么多次 head 变动。
 * 注意不能取大：13k 节点时一次取色就 200ms+，head 每秒只变两三次也足够把线程占死
 * （实测就是这样 —— 旧的"churn > 6 才算"把真风暴全漏掉了）。
 */
var LAG_MIN_CHURN = 1;
/** 现场测一次强制重排要多久；超过这个毫秒数就说明"变一次就整篇重算"已经成立。 */
var COST_MS = 40;
/** 装好后的热身期：首屏 Vite 预加载会一次性插很多 <link>，这段只记数不动手。 */
var WARMUP_MS = 5000;
/** 探针选择器：preload 插在 body 上的隐形取色 span。 */
var PROBE_SELECTOR = 'span[style*="--dsw-specific-sidebar-fill"]';

var state = {
        installed: false,
        tripped: false,
        phase: "idle",
        startedAt: 0,
        count: 0,
        lastTick: 0,
        history: [],
        observer: null,
        timer: null,
        probe: null
};

function log(message) {
        try { console.log(TAG + " " + message); } catch (error) { /* 日志失败无所谓 */ }
}

/** 是不是 Windows 桌面壳：preload 会给 <html> 打 data-windows-titlebar。 */
function isDesktopShell() {
        try {
                return document.documentElement !== null &&
                        document.documentElement !== undefined &&
                        document.documentElement.hasAttribute("data-windows-titlebar");
        } catch (error) {
                return false;
        }
}

/** 只在安装/兜底时调用一次 —— 这个选择器要全文档扫，不能每拍都跑。 */
function findProbe() {
        try {
                var found = document.body !== null && document.body !== undefined
                        ? document.body.querySelectorAll(PROBE_SELECTOR)
                        : [];
                return found.length > 0 ? found[found.length - 1] : null;
        } catch (error) {
                return null;
        }
}

/**
 * 拆引信：让 preload 自己跑收尾。
 *
 * 派发 pagehide 是首选 —— 它会 observer.disconnect()，标题栏保持最后一次正确颜色。
 * 实测 window 上的主世界 pagehide 监听器为 0，所以派发不会误伤应用自己的收尾逻辑。
 * 万一那个监听没接住（比如将来 preload 改了事件名），退化成把探针摘出文档：颜色会
 * 因为脱文档元素取不到样式而失真，但至少主线程活下来了 —— 两害相权。
 */
function neutralise(reason) {
        if (state.tripped) return;
        state.tripped = true;
        state.phase = "tripped";
        stopMonitor();
        log("head 变动风暴（" + reason + "），替 preload 跑收尾");
        try {
                window.dispatchEvent(new Event("pagehide"));
        } catch (error) {
                log("pagehide 派发失败：" + error);
        }
        setTimeout(function () {
                var probe = state.probe;
                if (probe !== null && probe !== undefined && probe.isConnected) {
                        try { probe.remove(); } catch (error) { /* 已经不在文档里了 */ }
                        log("pagehide 没拆掉探针，已直接移除（标题栏取色会失真，重新加载窗口恢复）");
                } else {
                        log("已拆：取色观察者已断开，标题栏停在最后一次正确的颜色；重新加载窗口可恢复原生行为");
                }
        }, 250);
}

function stopMonitor() {
        if (state.observer !== null && state.observer !== undefined) {
                try { state.observer.disconnect(); } catch (error) { /* 忽略 */ }
                state.observer = null;
        }
        if (state.timer !== null && state.timer !== undefined) {
                clearInterval(state.timer);
                state.timer = null;
        }
}

/**
 * 现在做一次"取色"要多久 —— 直接量 preload 每变一次要付的那笔钱。
 * 文档样式干净时约 0.3ms；脏的时候（风暴进行中）随节点数暴涨到 200ms 以上。
 */
function recalcCost() {
        var t0 = performance.now();
        try { void getComputedStyle(state.probe).backgroundColor; } catch (error) { return 0; }
        return performance.now() - t0;
}

function tick() {
        var now = Date.now();
        // 定时器自己晚到多久 —— 这就是"主线程还剩多少空档"的直接读数。
        // 风暴把线程占满时这个值会飙到几百毫秒，而正常空闲是 0~20ms。
        var lag = Math.max(0, now - (state.lastTick + BUCKET_MS));
        state.lastTick = now;
        var count = state.count;
        state.count = 0;
        state.history.push({ count: count, lag: lag });
        if (state.history.length > 8) state.history.shift();
        if (now - state.startedAt < WARMUP_MS) return;
        // 探针没了（被上游修掉 / 已被别人拆）：没什么可守的。只摸缓存引用 + isConnected。
        if (state.probe === null || state.probe === undefined || !state.probe.isConnected) {
                log("取色探针不在文档里了，停止监视");
                state.phase = "gone";
                stopMonitor();
                return;
        }
        var last = state.history[state.history.length - 1] || { count: 0, lag: 0 };
        var prev = state.history[state.history.length - 2] || { count: 0, lag: 0 };
        if (last.count >= TRIP_PER_BUCKET) {
                neutralise(last.count + " 次 / " + BUCKET_MS + "ms");
                return;
        }
        if (last.count >= LAG_MIN_CHURN && last.lag >= LAG_MS) {
                // 掉帧 + 确有 head 变动：再现场量一次重排要多久，确认是"变一次就整篇重算"，
                // 而不是别处的重活顺带把定时器拖晚了。
                var cost = recalcCost();
                last.cost = Math.round(cost);
                if (cost >= COST_MS)
                        neutralise("掉帧 " + last.lag + "ms + " + last.count + " 次变动 + 单次取色 " + Math.round(cost) + "ms");
        }
}

function install() {
        if (state.installed) return;
        state.installed = true;
        state.startedAt = Date.now();
        state.probe = findProbe();
        if (!isDesktopShell()) {
                state.phase = "web";
                return;
        }
        if (state.probe === null || state.probe === undefined) {
                state.phase = "no-probe";
                log("没找到 preload 的取色探针（可能已被上游修掉），保持空转");
                return;
        }
        state.phase = "watching";
        state.observer = new MutationObserver(function (records) {
                state.count += records.length;
        });
        try {
                state.observer.observe(document.head, { childList: true, subtree: true, characterData: true });
        } catch (error) {
                state.phase = "observe-failed";
                log("挂观察者失败：" + error);
                return;
        }
        state.lastTick = Date.now();
        state.timer = setInterval(tick, BUCKET_MS);
        log("已挂上（head 变动 >= " + TRIP_PER_BUCKET + " 次 / " + BUCKET_MS + "ms 就拆 preload 取色引信）");
}

function apply() {
        if (typeof document === "undefined") return;
        try {
                window.__DSH_STUCK_FIX__ = {
                        state: function () { return state; },
                        trip: function () { neutralise("手动"); },
                        disarm: function () { stopMonitor(); state.phase = "disarmed"; }
                };
        } catch (error) { /* 暴露调试口失败无所谓 */ }
        if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", install, { once: true });
                return;
        }
        install();
}

exports.inject = [];
exports.apply = apply;
return module.exports;
}
});