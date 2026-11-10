/**
 * proxy-abort.mjs —— 局域网代理的「客户端中途断开」自检（不需要 dsh）。
 *
 * 覆盖：
 *   1. 正常转发：状态码、内容、上游响应头都原样回来；
 *   2. 客户端在响应回来之前断开：代理不能崩（宿主 Node 24 会把
 *      pipeline 的 ERR_STREAM_UNABLE_TO_PIPE 同步抛出去，没接住就是整个进程退出）；
 *   3. 客户端在流式响应中途断开：同样不能崩，且后续请求照常；
 *   4. 没带访问码：仍然出 401 拒绝页（保护断开的那层不能把正常拒绝也吞掉）。
 *
 * 运行：node test/proxy-abort.mjs
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import { createProxy } from '../lib/proxy.mjs'

const KEY = 'test-key'
let failed = null
process.on('uncaughtException', (error) => {
  failed = error
  console.log('FAIL: 未捕获异常逃出代理 ——', error.code ?? error.message)
  process.exit(1)
})

/** 拿一个空闲端口（先占再放，代理的 start() 不回报实际端口）。 */
async function freePort() {
  const probe = http.createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  return port
}

const upstream = http.createServer((req, res) => {
  if (req.url.startsWith('/?token=')) {
    res.writeHead(303, { location: '/', 'set-cookie': 'dsh-auth-test=1; Path=/' })
    res.end()
    return
  }
  if (req.url === '/plain') {
    res.writeHead(200, { 'content-type': 'text/plain', 'x-test': 'kept' })
    res.end('hello')
    return
  }
  if (req.url === '/slow-head') {
    // 先把响应扣住，制造「客户端先断开、响应后到」的窗口
    setTimeout(() => {
      if (res.destroyed) return
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('late')
    }, 250)
    return
  }
  res.writeHead(200, { 'content-type': 'text/plain' })
  const timer = setInterval(() => { if (!res.writableEnded) res.write('chunk\n') }, 30)
  res.on('close', () => clearInterval(timer))
})
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))

const proxyPort = await freePort()
const proxy = createProxy({
  upstreamPort: upstream.address().port,
  getAccessKey: () => KEY,
  getLaunchToken: () => 'launch-token',
  allowPublic: true,
  log: () => {}
})
await proxy.start(proxyPort, '127.0.0.1')
const auth = { cookie: 'dsh-lan-access=' + KEY }

/** 发一个请求，可选在中途 destroy。 */
function get(path, headers, abortAfterMs) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: proxyPort, path, headers })
    req.on('error', () => resolve({ aborted: true }))
    if (abortAfterMs !== undefined) {
      setTimeout(() => { req.destroy(); resolve({ aborted: true }) }, abortAfterMs)
      return
    }
    req.on('response', (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
  })
}

// 1. 正常转发
const plain = await get('/plain', auth)
assert.equal(plain.status, 200, '正常请求应 200')
assert.equal(plain.body, 'hello', '响应体应原样回来')
assert.equal(plain.headers['x-test'], 'kept', '上游响应头应保留')
console.log('PASS 1/4 正常转发')

// 2. 响应回来之前断开（曾经在这里 fatal）
await get('/slow-head', auth, 80)
await new Promise((r) => setTimeout(r, 500))
assert.equal(failed, null, '断开不应产生未捕获异常')
console.log('PASS 2/4 响应前断开不崩')

// 3. 流式响应中途断开
await get('/stream', auth, 120)
await new Promise((r) => setTimeout(r, 300))
const after = await get('/plain', auth)
assert.equal(after.status, 200, '断开之后代理应继续服务')
console.log('PASS 3/4 流中途断开不崩且继续服务')

// 4. 没带访问码仍然 401
const denied = await get('/plain', {})
assert.equal(denied.status, 401, '没有访问码应 401')
assert.match(denied.body, /需要访问码/, '应给出拒绝页')
console.log('PASS 4/4 未授权仍被拒绝')

await proxy.stop()
await new Promise((resolve) => upstream.close(resolve))
console.log('all proxy-abort checks passed')
