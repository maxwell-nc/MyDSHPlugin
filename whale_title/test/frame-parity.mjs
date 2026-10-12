/**
 * frame-parity.mjs —— 鲸鱼帧算法回归：JS 实现 vs 旧版 Python 原实现逐一比对。
 *
 * 用法：
 *   1. python test/frame_parity.py        # 生成 Python 基准（需要旧项目源码）
 *   2. node  test/frame-parity.mjs         # 生成 JS 结果并与基准 diff
 *
 * 也可以单独跑 `node test/frame-parity.mjs --dump`，把 64 帧打到屏幕上人工验收。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const PY_BASELINE = join(here, 'frames_py.txt')
const JS_OUTPUT = join(here, 'frames_js.txt')

/** 从 lib/client.js 原文里切出常量区 + frameOf 并求值 —— 保证测的就是发货的那份代码。 */
function loadFrameOf() {
  const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')
  const start = source.indexOf('var WIDTH = 12;')
  if (start < 0) throw new Error('常量区未找到')
  const fn = source.indexOf('function frameOf(tick) {', start)
  if (fn < 0) throw new Error('frameOf 未找到')
  let depth = 0
  let end = -1
  for (let i = fn; i < source.length; i++) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  const factory = new Function(`${source.slice(start, end)}; return frameOf;`)
  return factory()
}

const frameOf = loadFrameOf()
const TICKS = 64
const lines = []
for (let tick = 0; tick < TICKS; tick++) lines.push(frameOf(tick))

if (process.argv.includes('--dump')) {
  for (const [i, line] of lines.entries()) console.log(String(i).padStart(3), line)
}

if (process.argv.includes('--baseline')) {
  // 官方基准不存在就直接生成（本机有 python 时）
  if (!existsSync(PY_BASELINE)) {
    execFileSync('python', [join(here, 'frame_parity.py')], { stdio: 'inherit' })
  }
}

writeFileSync(JS_OUTPUT, lines.join('\n') + '\n', 'utf8')

if (!existsSync(PY_BASELINE)) {
  console.log('[frame-parity] 没有 python 基准，只输出 JS 结果：', JS_OUTPUT)
  process.exit(0)
}

const baseline = readFileSync(PY_BASELINE, 'utf8').split('\n').filter((line) => line.length > 0)
let mismatch = 0
for (let tick = 0; tick < TICKS; tick++) {
  if (baseline[tick] !== lines[tick]) {
    mismatch += 1
    if (mismatch <= 8) {
      console.error(`帧 ${tick} 不一致:\n  py: ${baseline[tick]}\n  js: ${lines[tick]}`)
    }
  }
}
if (mismatch > 0) {
  console.error(`[frame-parity] ${mismatch}/${TICKS} 帧不一致`)
  process.exit(1)
}
console.log(`[frame-parity] ${TICKS}/${TICKS} 帧与旧版完全一致 ✓`)
