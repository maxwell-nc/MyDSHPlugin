/**
 * dsh-model-name 的自测：规范化 + 徽章切分。
 *
 * 锁住的规则（用户点名的四条）：
 *   DeepSeek-V4-Flash-0731-TokenPlan → 基础名 DeepSeek-V4-Flash + 徽章 0731-TokenPlan
 *   GLM-5.3                          → GLM-5.3（无徽章）
 *   Qwen3.8-27B-TokenPlan            → 基础名 Qwen3.8-27B + 徽章 TokenPlan
 *   GLM-5.3-Flash-Free               → 基础名 GLM-5.3-Flash + 徽章 Free
 *
 * 跑法：node test/model-name.test.mjs（或在本目录 pnpm test）
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = readFileSync(join(import.meta.dirname, '..', 'lib', 'client.js'), 'utf8')

/** 浏览器模块格式：接住 __ModuleLoader__.load 的注册项，再按 require 取模块。 */
let entry = null
globalThis.window = {
	__ModuleLoader__: {
		load(registration) {
			entry = registration
		}
	}
}
// eslint-disable-next-line no-new-func -- 客户端半边是按浏览器模块格式写的一整个文件
new Function(SOURCE)()
assert.ok(entry !== null, 'client.js 没有按 __ModuleLoader__ 契约注册')
assert.equal(entry.id, 'dsh-model-name')

const lib = entry.factory(() => {
	throw new Error('dsh-model-name 不应 require 其它模块')
})
const { displayName, displayParts, splitBadge, normalize, registerTag } = lib

/** 名称的显示形与徽章切分一起断言。 */
function expectParts(id, base, badge) {
	const parts = displayParts(id)
	assert.deepEqual(parts, { base, badge }, `${id} → ${base} + 徽章 ${badge || '(无)'}`)
	// 纯显示层：规范化本身不拆徽章（拆是 displayParts/splitBadge 的事）。
	assert.equal(displayName(id), badge ? base + '-' + badge : base, `${id} 的 displayName 不变`)
}

// ── 用户点名的四条 ──
expectParts('cf/DeepSeek-V4-Flash-0731-TokenPlan', 'DeepSeek-V4-Flash', '0731-TokenPlan')
expectParts('ctai_my/glm-5.3', 'GLM-5.3', '')
expectParts('cf/Qwen3.8-27B-TokenPlan', 'Qwen3.8-27B', 'TokenPlan')
expectParts('opencodezen/glm-5.3-flash-free', 'GLM-5.3-Flash', 'Free')

// ── 同规则下的其它实际模型 id（供应商标识剥掉，只留短名） ──
expectParts('cf/DeepSeek-V4-Flash-0817-DL', 'DeepSeek-V4-Flash', '0817-DL')
expectParts('ctai_my/deepseek-v4.1-flash-1017', 'DeepSeek-V4.1-Flash', '1017')
expectParts('cf/GLM-5.2-TokenPlan', 'GLM-5.2', 'TokenPlan')
expectParts('opencodezen/mimo-v2.6-flash-free', 'MiMo-V2.6-Flash', 'Free')
expectParts('cline/xiaomi/mimo-v2.6-flash', 'MiMo-V2.6-Flash', '')
expectParts('ctai_my/glm-5.3-flash', 'GLM-5.3-Flash', '')

// ── 边界：整名都是标记时不切（否则会剩一个空的基础名） ──
expectParts('openrouter/openrouter/free', 'Free', '')
assert.deepEqual(splitBadge('Free'), { base: 'Free', badge: '' })
assert.deepEqual(splitBadge('0731-TokenPlan'), { base: '0731', badge: 'TokenPlan' })
assert.deepEqual(splitBadge(''), { base: '', badge: '' })

// ── 标记词也进规范化词典（小写输入 → 规范大小写） ──
assert.equal(normalize('glm-5.2-tokenplan'), 'GLM-5.2-TokenPlan')
assert.equal(normalize('deepseek-v4-flash-0817-dl'), 'DeepSeek-V4-Flash-0817-DL')

// ── 可扩展：运行时加徽章词，不用改代码 ──
// splitBadge 只切不改写（传进去的是什么大小写，切出来就是什么）；displayParts 会先规范化。
registerTag('max', 'MAX')
assert.deepEqual(splitBadge('GLM-5.3-max'), { base: 'GLM-5.3', badge: 'max' })
assert.deepEqual(displayParts('ctai_my/glm-5.3-max'), { base: 'GLM-5.3', badge: 'MAX' })

console.log('全部通过')
