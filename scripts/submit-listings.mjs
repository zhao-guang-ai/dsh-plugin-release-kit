#!/usr/bin/env node
/**
 * 按 listings.json 自动提交插件到各目录（PR / Issue）。
 *
 * 用法：
 *   # 1) 先干跑（默认），逐条打印将要提交的内容，供人确认
 *   node scripts/submit-listings.mjs --owner <owner> --repo <repo> --desc-en "..." --desc-zh "..."
 *   # 2) 确认后真正执行
 *   node scripts/submit-listings.mjs ... --apply
 *   # 只提交某几个 / 包含默认跳过的
 *   node scripts/submit-listings.mjs ... --only awesome-dsh-plugin,hacksing --apply
 *   node scripts/submit-listings.mjs ... --include-skipped --apply
 *
 * 安全设计：
 *   - 默认干跑；必须显式 --apply 才写远端
 *   - 已存在我们开的 PR/Issue 时自动跳过（防重复提交）
 *   - 提交型目录是**以你名义的公开行为**：请先看干跑输出再 --apply
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { insertAtSectionEnd, makeGh, renderer } from './lib/gh.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}
const flag = (name) => argv.includes(`--${name}`)
const list = (name) => arg(name).split(',').map((s) => s.trim()).filter(Boolean)

const APPLY = flag('apply')
const PROXY = flag('proxy')
const owner = arg('owner')
const repo = arg('repo')
const pkg = arg('pkg', repo)
if (!owner || !repo) {
  console.error('用法：node scripts/submit-listings.mjs --owner <owner> --repo <repo> [--pkg <包名>] [--desc-en ..] [--desc-zh ..] [--only id1,id2] [--include-skipped] [--apply] [--proxy]')
  process.exit(2)
}

const conf = JSON.parse(readFileSync(resolve(ROOT, 'listings.json'), 'utf8'))
const vars = {
  owner,
  repo,
  pkg,
  repoUrl: `https://github.com/${owner}/${repo}`,
  descEn: arg('desc-en', ''),
  descZh: arg('desc-zh', ''),
  dshVersion: arg('dsh-version', ''),
  compat: arg('compat', ''),
}
const render = renderer(vars)

const { available: ghAvailable, bin: ghBin, gh } = makeGh({ proxy: PROXY, onRetry: (i, e) => process.stderr.write(`  (gh 重试 ${i}) ${String(e.message ?? e).split('\n')[0].slice(0, 60)}\n`) })
if (!ghAvailable) { console.error('✗ 未找到 gh CLI：安装 gh 或设 GH_BIN=<路径>'); process.exit(2) }

const tmp = mkdtempSync(join(tmpdir(), 'dsh-submit-'))
const me = gh(['api', 'user', '--jq', '.login']).trim()
console.log(`gh 用户：${me}   ${APPLY ? '【--apply：将写远端】' : '【干跑：不写远端】'}${PROXY ? '   [经代理]' : ''}`)

const only = list('only')
const skip = list('skip')
const includeSkipped = flag('include-skipped')

/** 该目录是否已经有我们开的 PR/Issue（防重复） */
function existing(targetRepo) {
  try {
    const q = encodeURIComponent(`repo:${targetRepo} ${pkg}`)
    const out = gh(['api', `search/issues?q=${q}&per_page=5`, '--jq', '.items[] | "\\(.state)|\\(.html_url)"'])
    const first = out.split('\n').filter(Boolean)[0]
    return first ? first.split('|') : null
  } catch { return null }
}

/** 在 fork 上准备分支并写入文件；返回 {branch, commits[]} */
function preparePrFiles(targetRepo, files) {
  const [upOwner, upRepo] = targetRepo.split('/')
  const forkRepo = `${me}/${upRepo}`
  const base = gh(['api', `repos/${targetRepo}`, '--jq', '.default_branch']).trim()
  const baseSha = JSON.parse(gh(['api', `repos/${targetRepo}/git/ref/heads/${base}`])).object.sha
  const branch = arg('branch', `add-${pkg}`)

  if (APPLY) {
    try { gh(['repo', 'fork', targetRepo, '--clone=false']) } catch { /* 已存在 */ }
    try {
      gh(['api', `repos/${forkRepo}/git/refs`, '--method', 'POST', '-f', `ref=refs/heads/${branch}`, '-f', `sha=${baseSha}`])
      console.log(`  分支已建：${forkRepo}:${branch}`)
    } catch (e) {
      const msg = String(e.message ?? e)
      if (/already exists|Reference already exists/i.test(msg)) console.log(`  分支已存在：${forkRepo}:${branch}（复用）`)
      else throw e
    }
  }

  const commits = []
  for (const f of files) {
    const payload = { message: `docs: add ${pkg} to ${f.path}`, content: Buffer.from(f.content, 'utf8').toString('base64'), branch }
    let exists = null
    try { exists = JSON.parse(gh(['api', `repos/${forkRepo}/contents/${f.path}?ref=${branch}`])).sha } catch { /* 新文件 */ }
    if (exists) payload.sha = exists
    if (APPLY) {
      const payloadFile = join(tmp, `payload-${f.path.replace(/[^a-z0-9]/gi, '_')}.json`)
      writeFileSync(payloadFile, JSON.stringify(payload))
      const res = JSON.parse(gh(['api', `repos/${forkRepo}/contents/${f.path}`, '--method', 'PUT', '--input', payloadFile]))
      commits.push(res.commit.sha.slice(0, 8))
      console.log(`  ${f.path} 已提交 ${res.commit.sha.slice(0, 8)}（${exists ? '更新' : '新建'}）`)
    } else {
      commits.push('(干跑)')
    }
  }
  return { forkRepo, forkOwner: me, base, branch, commits }
}

function submitPr(item) {
  const targetRepo = render(item.repo)
  const prior = existing(targetRepo)
  if (prior) { console.log(`  ⏭ 已有 ${prior[0]} 的提交：${prior[1]} —— 跳过`); return }

  // 组装文件
  const out = []
  const fileSpecs = item.files ?? [{ path: render(item.file), insert: item.insert, content: item.content ? render(item.content) : null, create: item.createFile }]
  const [upOwner, upRepo] = targetRepo.split('/')
  for (const spec of fileSpecs) {
    const path = render(spec.path)
    if (spec.content) { out.push({ path, content: spec.content }); continue }
    const upstream = gh(['api', `repos/${targetRepo}/contents/${path}?ref=HEAD`, '--header', 'Accept: application/vnd.github.raw'])
    const line = render(spec.insert?.line)
    const { text, at } = insertAtSectionEnd(upstream, spec.insert.section, line)
    out.push({ path, content: text, preview: `在「${spec.insert.section}」末尾（第 ${at + 1} 行）插入：${line}` })
  }

  console.log(`  PR → ${targetRepo}`)
  const title = render(item.prTitle ?? `docs: add ${pkg}`)
  const body = render(item.prBodyTemplate ?? `${pkg}: ${vars.repoUrl}`)
  console.log(`    标题：${title}`)
  for (const f of out) console.log(`    ${f.path}${f.preview ? '  ' + f.preview : '（新建）'}`)

  if (!APPLY) return
  const { forkOwner, base, branch } = preparePrFiles(targetRepo, out)
  const prFile = join(tmp, `pr-${item.id}.json`)
  writeFileSync(prFile, JSON.stringify({ title, head: `${forkOwner}:${branch}`, base, body }))
  const pr = JSON.parse(gh(['api', `repos/${targetRepo}/pulls`, '--method', 'POST', '--input', prFile]))
  console.log(`    ✅ ${pr.html_url}`)
}

function submitIssue(item) {
  const targetRepo = render(item.repo)
  const prior = existing(targetRepo)
  if (prior) { console.log(`  ⏭ 已有 ${prior[0]} 的提交：${prior[1]} —— 跳过`); return }
  const title = render(item.title)
  const body = render(item.bodyTemplate)
  console.log(`  Issue → ${targetRepo}`)
  console.log(`    标题：${title}`)
  console.log(`    正文首行：${body.split('\n')[0].slice(0, 90)}`)
  if (!APPLY) return
  const bodyFile = join(tmp, `issue-${item.id}.md`)
  writeFileSync(bodyFile, body)
  const url = gh(['issue', 'create', '--repo', targetRepo, '--title', title, '--body-file', bodyFile]).trim()
  console.log(`    ✅ ${url}`)
}

console.log('\n=== 逐条处理 ===')
for (const item of conf.submit) {
  if (only.length && !only.includes(item.id)) continue
  if (skip.includes(item.id)) continue
  if (item.skipByDefault && !includeSkipped) { console.log(`\n[${item.id}] ⏭ 默认跳过（${item.gate ?? '见 listings.json'}）；需要时加 --include-skipped`); continue }
  console.log(`\n[${item.id}] ${item.name}${item.gate ? `\n  说明：${item.gate}` : ''}`)
  try {
    if (item.route === 'pr') submitPr(item)
    else if (item.route === 'issue') submitIssue(item)
    else console.log(`  ⏭ 未知 route: ${item.route}`)
  } catch (e) {
    console.log(`  ❌ 失败：${String(e.message ?? e).split('\n').slice(-2).join(' / ').slice(0, 200)}`)
  }
}

console.log(`\n${APPLY ? '完成。' : '干跑结束：确认无误后加 --apply 真正提交。'}`)
console.log('提示：网页表单类目录（dsh.pub / dshplugin.dev / DSH Plugin Store）需人工填写，见 PR-TEXTS.md。')
