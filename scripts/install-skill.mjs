#!/usr/bin/env node
/**
 * 把本工具包安装成 DSH skill（供任意会话直接加载）。
 *
 * 用法：
 *   node scripts/install-skill.mjs                 # 装到 ~/.agents/skills/dsh-plugin-release
 *   node scripts/install-skill.mjs --target <目录>  # 装到指定位置
 *   node scripts/install-skill.mjs --force         # 已存在时覆盖（默认会提示并退出）
 *
 * 安装后的结构（自包含，可离线使用）：
 *   <target>/SKILL.md                  ← 入口（frontmatter: name/description）
 *   <target>/listings.json             ← 目录登记表（脚本读它）
 *   <target>/scripts/…                 ← 复查与提交脚本
 *   <target>/templates/…               ← 抄进新插件的骨架
 *   <target>/references/runbook.md     ← 完整手册
 *   <target>/references/texts.md       ← 提交文案模板
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null }
const SKILL_NAME = 'dsh-plugin-release'

const target = resolve(arg('target') ?? join(homedir(), '.agents', 'skills', SKILL_NAME))
const force = argv.includes('--force')

const skillMd = join(ROOT, 'skill', 'SKILL.md')
if (!existsSync(skillMd)) {
  console.error(`✗ 找不到 ${skillMd}（请在工具包根目录运行本脚本）`)
  process.exit(1)
}

if (existsSync(target) && !force) {
  console.log(`⚠️ 目标已存在：${target}`)
  console.log('  加 --force 覆盖，或 --target <目录> 换个位置。')
  process.exit(0)
}

console.log(`安装 skill → ${target}`)
if (existsSync(target) && force) rmSync(target, { recursive: true, force: true })
mkdirSync(join(target, 'references'), { recursive: true })

writeFileSync(join(target, 'SKILL.md'), readFileSync(skillMd, 'utf8'))
cpSync(join(ROOT, 'listings.json'), join(target, 'listings.json'))
cpSync(join(ROOT, 'scripts'), join(target, 'scripts'), { recursive: true })
cpSync(join(ROOT, 'templates'), join(target, 'templates'), { recursive: true })
cpSync(join(ROOT, 'RUNBOOK.md'), join(target, 'references', 'runbook.md'))
cpSync(join(ROOT, 'PR-TEXTS.md'), join(target, 'references', 'texts.md'))

console.log('✓ 已安装。内容：')
console.log('  SKILL.md · listings.json · scripts/ · templates/ · references/{runbook,texts}.md')
console.log('\n生效方式：skill 目录在会话启动时扫描 —— **新开一个会话**即可通过 skill 工具加载 `' + SKILL_NAME + '`。')
console.log('验证：在新会话里让我「加载 dsh-plugin-release 这个 skill」。')
