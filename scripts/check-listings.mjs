#!/usr/bin/env node
/**
 * 复查插件在各目录的收录状态。
 *
 * 用法：
 *   node scripts/check-listings.mjs --owner zhao-guang-ai --repo dsh-quote-annotate-pro --pkg dsh-quote-annotate-pro
 *   node scripts/check-listings.mjs ... --proxy      # 站点被墙时走 127.0.0.1:7890
 *   node scripts/check-listings.mjs ... --json       # 只输出 JSON（便于喂给别的工具）
 *
 * 判据（重要）：
 *   - 有详情页的目录：/plugins/<owner>/<repo> 返回 200 且页面含包名/owner → 已收录；404 → 未收录
 *   - SPA 站点：抓它的**数据文件**（如 dsh.market 的 plugins-lite.json），不能抓 HTML
 *   - ⚠️ 搜索页 `?q=<包名>` 出现包名 ≠ 已收录（页面会回显查询词，属假阳性）
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeGh } from './lib/gh.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

// ---------- 参数 ----------
const argv = process.argv.slice(2)
const arg = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const flag = (name) => argv.includes(`--${name}`)
const owner = arg('owner')
const repo = arg('repo')
const pkg = arg('pkg', repo)
const dshVersion = arg('dsh-version', '')
if (!owner || !repo) {
  console.error('用法：node scripts/check-listings.mjs --owner <owner> --repo <repo> [--pkg <包名>] [--proxy] [--json]')
  process.exit(2)
}
if (flag('proxy')) {
  process.env.HTTPS_PROXY = 'http://127.0.0.1:7890'
  process.env.HTTP_PROXY = 'http://127.0.0.1:7890'
  process.env.NODE_USE_ENV_PROXY = '1'
}

const conf = JSON.parse(readFileSync(resolve(ROOT, 'listings.json'), 'utf8'))
const vars = { owner, repo, pkg, dshVersion, repoUrl: `https://github.com/${owner}/${repo}` }
const render = (s) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)

const GH = process.env.GH_BIN || 'gh'
const { available: ghAvailable, bin: ghBin, gh: ghCall } = makeGh({
  proxy: flag('proxy'),
  onRetry: (i, e) => process.stderr.write(`  (gh 第 ${i} 次失败，重试) ${String(e.message ?? e).split('\n')[0].slice(0, 70)}\n`),
})
const gh = (args, tries = 1) => {
  if (!ghAvailable) throw new Error('未找到 gh CLI（设 GH_BIN=<路径> 或安装 gh）')
  return ghCall(args)
}
if (!ghAvailable && !flag('json')) {
  console.log('⚠️ 未检测到 gh CLI：仅能复查基于网页/接口的目录；安装 gh 或设 GH_BIN=<路径> 可查 PR/Issue 状态。')
}

const http = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, signal: AbortSignal.timeout(30000), redirect: 'follow' })
  let body = ''
  try { body = await res.text() } catch { /* ignore */ }
  return { status: res.status, body }
}

const rows = []

// ---------- A 类：自动目录 ----------
for (const item of conf.auto) {
  const v = item.verify
  let listed = null
  let detail = ''
  try {
    if (v.type === 'detailPage') {
      const url = render(v.url)
      const { status, body } = await http(url)
      const hit = body.includes(pkg) || body.includes(`${owner}/${repo}`)
      listed = status === 200 && hit
      detail = `HTTP ${status}${hit ? ' 含名称' : ' 无名称'}`
    } else if (v.type === 'githubJson') {
      const raw = gh(['api', `repos/${v.repo}/contents/${v.path}?ref=${v.ref}`, '--header', 'Accept: application/vnd.github.raw'])
      listed = raw.includes(render(v.match))
      detail = `${(raw.length / 1048576).toFixed(1)}MB`
    } else if (v.type === 'apiSearch') {
      const { status, body } = await http(render(v.url))
      let value = null
      try { value = JSON.parse(body)[v.jsonPath ?? 'total'] } catch { /* ignore */ }
      listed = typeof value === 'number' ? value > 0 : null
      detail = `HTTP ${status} total=${value}`
    } else {
      detail = `未知 verify 类型 ${v.type}`
    }
  } catch (e) {
    detail = `查询失败: ${String(e.message ?? e).split('\n')[0].slice(0, 60)}`
  }
  rows.push({ kind: 'auto', id: item.id, name: item.name, status: listed === true ? '✅ 已收录' : listed === false ? '⏳ 未收录' : '❓ 未知', detail, cadence: item.cadence ?? '' })
}

// ---------- B 类：提交型（查是否已有我们开的 PR/Issue） ----------
for (const item of conf.submit) {
  const targetRepo = render(item.repo)
  const isSelf = targetRepo === `${owner}/${repo}`
  let status = '— 未提交'
  let detail = item.route === 'pr' ? `PR → ${targetRepo}` : `Issue → ${targetRepo}`
  try {
    const q = encodeURIComponent(`repo:${targetRepo} ${pkg}`)
    const out = gh(['api', `search/issues?q=${q}&per_page=5`, '--jq', '.items[] | "\\(.number)|\\(.state)|\\(.pull_request != null)|\\(.html_url)"'])
    const first = out.split('\n').filter(Boolean)[0]
    if (first) {
      const [num, state, isPr, url] = first.split('|')
      status = `${isPr === 'true' ? 'PR' : 'Issue'} #${num} ${state.toUpperCase()}`
      detail = url
    }
  } catch (e) {
    detail = `查询失败: ${String(e.message ?? e).split('\n')[0].slice(0, 50)}`
  }
  rows.push({ kind: item.route, id: item.id, name: item.name, status, detail, cadence: item.gate ?? '' })
}

// ---------- 输出 ----------
if (flag('json')) {
  console.log(JSON.stringify({ plugin: `${owner}/${repo}`, checkedAt: new Date().toISOString(), rows }, null, 2))
} else {
  console.log(`\n=== ${owner}/${repo} 的收录复查（${new Date().toLocaleString('zh-CN')}）===\n`)
  const pad = (s, n) => { let w = 0; for (const ch of String(s)) w += ch.charCodeAt(0) > 255 ? 2 : 1; return String(s) + ' '.repeat(Math.max(0, n - w)) }
  console.log(`${pad('目录', 30)} ${pad('状态', 16)} 说明`)
  console.log('-'.repeat(100))
  for (const r of rows) console.log(`${pad(r.name, 30)} ${pad(r.status, 16)} ${r.detail}`)
  const listed = rows.filter((r) => r.status.startsWith('✅')).length
  const pending = rows.filter((r) => /^(PR|Issue) #/.test(r.status)).length
  console.log(`\n小结：已收录 ${listed} 个 · 已提交待处理 ${pending} 个 · 其余 ${rows.length - listed - pending} 个`)
  console.log('提示：自动目录通常需要 1 天；查不到时先确认 topic 是否为 dsh-plugin，再用 --proxy 重试。')
}
