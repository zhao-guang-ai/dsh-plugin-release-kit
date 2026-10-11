/**
 * 清单一致性自检（CI 用，无外部依赖）。
 * 校验：package.json 必需字段 → dsh.bundle.patch 存在 → patch 引用本包 → exports/main 指向真实文件
 *       → 若声明了 dsh.client，则校验客户端 bundle 的 `id` 与包名一致。
 * 用法：node tools/check-manifest.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fail = (msg) => { console.error(`✗ ${msg}`); process.exitCode = 1 }
const ok = (msg) => console.log(`✓ ${msg}`)

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

if (typeof pkg.name === 'string' && pkg.name !== '') ok(`name = ${pkg.name}`)
else fail('package.json 缺少 name')

if (typeof pkg.version === 'string' && /^\d+\.\d+\.\d+/.test(pkg.version)) ok(`version = ${pkg.version}`)
else fail('package.json 缺少合法的 version')

if (pkg.type !== 'module') fail('package.json 应为 "type": "module"')
else ok('type = module')

// ---- 可安装性：dsh.bundle.patch（目录审核被拒的头号原因就是缺它）----
const patchRel = pkg.dsh?.bundle?.patch
if (!patchRel) fail('缺少 dsh.bundle.patch（这是"可安装"的必要条件）')
else if (!existsSync(resolve(root, patchRel))) fail(`patch 文件不存在：${patchRel}`)
else {
  ok(`dsh.bundle.patch = ${patchRel}`)
  const patch = readFileSync(resolve(root, patchRel), 'utf8')
  if (patch.includes(pkg.name)) ok(`patch 引用了 ${pkg.name}`)
  else fail(`patch 未引用包名 ${pkg.name}`)
}

// ---- 入口文件 ----
for (const [key, rel] of Object.entries({ main: pkg.main, ...(pkg.exports ?? {}) })) {
  const target = typeof rel === 'string' ? rel : rel?.default
  if (!target || !target.startsWith('./')) continue
  if (!existsSync(resolve(root, target))) fail(`${key} 指向的文件不存在：${target}`)
  else ok(`${key} = ${target}`)
}

// ---- 客户端 bundle（仅当声明了 dsh.client）----
const clientDecl = pkg.dsh?.client
if (clientDecl) {
  if (clientDecl.platform !== 'web') fail(`dsh.client.platform 应为 web，实际 ${clientDecl.platform}`)
  else ok('dsh.client.platform = web')

  const clientRel = typeof pkg.exports?.['./client'] === 'string' ? pkg.exports['./client'] : null
  if (!clientRel) fail("声明了 dsh.client 但缺少 exports['./client']")
  else {
    const clientPath = resolve(root, clientRel)
    if (!existsSync(clientPath)) fail(`客户端 bundle 不存在：${clientRel}`)
    else {
      const src = readFileSync(clientPath, 'utf8')
      const head = src.slice(0, 8000) // id 通常在文件顶部
      const idMatch = /__ModuleLoader__\s*\.\s*load\s*\(\s*\{\s*id:\s*['"]([^'"]+)['"]/.exec(head)
      if (!idMatch) fail(`bundle 未以 window.__ModuleLoader__.load({ id, factory }) 形式注册：${clientRel}`)
      else if (idMatch[1] !== pkg.name) fail(`bundle 注册的 id (${idMatch[1]}) 与包名 (${pkg.name}) 不一致`)
      else ok(`bundle id = ${idMatch[1]}`)

      // 注意：exports.* 常写在文件末尾（工厂函数体之后），必须全文扫描
      if (!/(?:exports|module\.exports)\.inject\s*=/.test(src)) fail('bundle 缺少 exports.inject（未声明服务依赖会在槽位未就绪时静默失效）')
      else ok('bundle 声明了 exports.inject')
    }
  }
}

console.log(process.exitCode === 1 ? '\n自检未通过' : '\n自检通过')
