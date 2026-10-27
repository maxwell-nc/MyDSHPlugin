window.__ModuleLoader__.load({
	id: "dsh-model-name",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/**
		 * 共享的「模型显示名规范化」库。
		 *
		 * 供 usage / thinking 等客户端插件 render 显示层时 require('dsh-model-name')
		 * 复用。**纯显示层**：只改要展示的 label，绝不改存储/匹配用的 model id
		 * （id 是配置和用量统计的锚点）。
		 *
		 * 模型：
		 *   displayName(原始名) = normalize(shortName(原始名))
		 *   normalize 按 `-` 切段，每段先查「规范化词典」，未命中再套「结构/大小写规则」，
		 *   最后用 `-` 拼回。这样既能精确映射（glm→GLM、mimo→MiMo），又能自动做结构
		 *   大小写（v3→V3、-flash→-Flash、r1→R1）。
		 *
		 * 扩展（先这些规则，后续方便添加）：
		 *   - 加词典项：  registerRule('dict', 'key', 'Display')        —— 大小写不敏感匹配
		 *   - 加正则替换：registerRule('regex', /\b(v)(\d)/i, '$1$2' 的大写版, 见示例)
		 *   规则可以用 `-` 切段做逐段匹配，避免误伤长名的中间部分。
		 */

		/** 规范化词典：小写键 → 规范显示形。命中即整段替换。 */
		const DICTIONARY = new Map([
			["deepseek", "DeepSeek"],
			["glm", "GLM"],
			["qwen", "Qwen"],
			["mimo", "MiMo"],
			["minimax", "MiniMax"],
			["flash", "Flash"]
		]);

		/** 逐段正则替换规则：段未被词典命中时依次尝试，[RegExp, 替换串]。 */
		const REGEX_RULES = [];

		/** 结构/大小写规则（作用于单个 `-` 段，未命中词典时兜底）。 */
		function normalizeCasing(seg) {
			let out = String(seg);
			// v<数字> → V<数字>（例：v3、v3.2 → V3、V3.2）
			out = out.replace(/^v(?=\d)/i, "V");
			// 段首字母小写 → 大写（例：flash → Flash；已大写/非字母开头保持不变）
			out = out.replace(/^[a-z]/, (c) => c.toUpperCase());
			return out;
		}

		/** 规范化单个 `-` 段。 */
		function normalizeSegment(seg) {
			const s = String(seg);
			const lower = s.toLowerCase();
			if (DICTIONARY.has(lower)) return DICTIONARY.get(lower);
			for (const [re, repl] of REGEX_RULES) {
				const next = s.replace(re, repl);
				if (next !== s) return next;
			}
			return normalizeCasing(s);
		}

		/** 按 `-` 切段、逐段规范化、再拼回。未命中的段只做大写兜底，不改结构。 */
		function normalize(name) {
			const s = String(name ?? "").trim();
			if (s.length === 0) return s;
			return s.split("-").map(normalizeSegment).join("-");
		}

		/**
		 * 运行时加规则，方便后续扩展而不用改这份代码。
		 * @param {"dict"|"regex"} type
		 * @param {string} [key] dict: 词典项小写键
		 * @param {string} [value] dict: 规范显示形
		 * @param {RegExp} [re] regex: 正则
		 * @param {string} [repl] regex: 替换串
		 */
		function registerRule(type, ...args) {
			if (type === "dict") {
				const [key, value] = args;
				if (key != null && value != null) DICTIONARY.set(String(key).toLowerCase(), String(value));
			} else if (type === "regex") {
				const [re, repl] = args;
				if (re instanceof RegExp || typeof re === "string") REGEX_RULES.push([re, repl]);
			}
			return normalize;
		}

		/** 只保留最后一个 `/` 或 `\` 之后的短名（去首尾空白）。opencode/glm-5.3 → glm-5.3。 */
		function shortName(id) {
			if (!id) return "";
			const parts = String(id).split(/[/\\]/u);
			return parts[parts.length - 1].trim();
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

		/** 一键显示名：先剥供应商前缀，再规范化。推荐外部插件用这个。 */
		function displayName(id) {
			return normalize(shortName(id));
		}

		/** 只读快照：当前词典条目（小写键 → 规范显示形）。 */
		function getDictionary() {
			return [...DICTIONARY.entries()];
		}

		exports.normalize = normalize;
		exports.displayName = displayName;
		exports.registerRule = registerRule;
		exports.shortName = shortName;
		exports.splitPrefix = splitPrefix;
		exports.cap = cap;
		exports.getDictionary = getDictionary;

		/**
		 * 浏览器插件行的空实现。
		 *
		 * boot 会把 boot 图里的每一行（也就是每个 client bundle）当作 cordis 插件挂载，
		 * unwrapExports 之后要求导出里带 apply，缺了就直接抛
		 * invalid plugin, expect function or object with an "apply" method。
		 * 本包只是共享库，所以挂一个空 apply 占位；真正的值仍由上面的具名导出提供
		 * （usage / thinking 通过 require('dsh-model-name') 取用）。
		 */
		function apply() {}

		exports.apply = apply;

		return module.exports;
	}
});