/**
 * 共享工具：定位并调用 gh CLI（内置重试 + 可选代理）。
 * 供 check-listings.mjs / submit-listings.mjs 使用；也可单独 import。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 依次尝试：GH_BIN → PATH 上的 gh → 常见安装/免安装位置 */
export function resolveGh() {
  const candidates = []
  if (process.env.GH_BIN) candidates.push(process.env.GH_BIN)
  candidates.push('gh')
  const home = homedir()
  const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
  candidates.push(
    join(local, 'Programs', 'GitHub CLI', 'gh.exe'),
    'C:/Program Files/GitHub CLI/gh.exe',
    'C:/Program Files (x86)/GitHub CLI/gh.exe',
    // 免安装：解压在工作区里的常见位置
    'D:/DeepSeekWorkspace/tools/bin/gh.exe',
    join(process.cwd(), 'tools', 'bin', 'gh.exe'),
  )
  for (const c of candidates) {
    try {
      if (c !== 'gh' && !existsSync(c)) continue
      execFileSync(c, ['--version'], { stdio: 'ignore' })
      return c
    } catch { /* 试下一个 */ }
  }
  return null
}

/** 生成带重试的 gh 调用器；gh 缺失时每次调用都会抛出可读错误 */
export function makeGh({ proxy = false, tries = 3, onRetry = null } = {}) {
  const bin = resolveGh()
  if (!bin) {
    const err = new Error('未找到 gh CLI：请安装 gh，或设 GH_BIN=<gh 可执行文件路径>')
    return {
      available: false,
      bin: null,
      gh: () => { throw err },
    }
  }
  const env = { ...process.env }
  if (proxy) {
    env.HTTPS_PROXY = env.HTTPS_PROXY ?? 'http://127.0.0.1:7890'
    env.HTTP_PROXY = env.HTTP_PROXY ?? 'http://127.0.0.1:7890'
  }
  const gh = (args) => {
    let last
    for (let i = 1; i <= tries; i++) {
      try {
        return execFileSync(bin, args, { maxBuffer: 512 * 1024 * 1024, env }).toString('utf8')
      } catch (e) {
        last = e
        if (onRetry) onRetry(i, e)
      }
    }
    throw last
  }
  return { available: true, bin, gh }
}

/** 模板占位符替换：{owner} {repo} {pkg} {repoUrl} {descEn} {descZh} {dshVersion} … */
export function renderer(vars) {
  return (s) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))
}

/** 在 sectionHeading 章节末尾（下一个 `## ` 之前）插入一行，返回 {text, at} */
export function insertAtSectionEnd(text, sectionHeading, line) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.startsWith(sectionHeading))
  if (start < 0) throw new Error(`找不到章节: ${sectionHeading}`)
  let end = start + 1
  while (end < lines.length && !lines[end].startsWith('## ')) end++
  let at = end
  while (at > start + 1 && lines[at - 1].trim() === '') at--
  return { text: [...lines.slice(0, at), line, ...lines.slice(at)].join('\n'), at }
}
