# 本地诊断接收端（开发期可选，发布时保留也无害）
#
# 插件（lib/client.js）启动时向 http://127.0.0.1:47821/dsh-plugin POST 一次 /ping 探测：
# 探测不到就本次运行静默 —— 因此**不开这个脚本，插件也照常工作**，不会有网络噪音。
#
# 用法：
#   node tools/diag-sink.mjs
#   DIAG_PORT=47821 DIAG_LOG=./diag-sink.log node tools/diag-sink.mjs
import { createServer } from 'node:http'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const PORT = Number(process.env.DIAG_PORT ?? 47821)
const LOG = resolve(process.env.DIAG_LOG ?? 'diag-sink.log')

mkdirSync(dirname(LOG), { recursive: true })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '600',
}

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    res.end()
    return
  }
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > 200000) req.destroy()
  })
  req.on('end', () => {
    const line = `${new Date().toISOString()}\t${req.method}\t${req.url}\t${body.replace(/[\r\n]+/g, '\\n')}\n`
    try { appendFileSync(LOG, line) } catch (error) { console.error('append failed', error) }
    if (req.url !== '/ping') process.stdout.write(line)
    res.writeHead(200, { ...cors, 'Content-Type': 'text/plain' })
    res.end('ok')
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`diag sink listening on http://127.0.0.1:${PORT}/  -> ${LOG}`)
})
