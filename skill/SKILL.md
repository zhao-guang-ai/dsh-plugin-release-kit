---
name: dsh-plugin-release
description: Publish a DeepSeek Harness (DSH) plugin end-to-end — bundle contract, GitHub repo with topics, npm release via Trusted Publishing (OIDC), and submissions to plugin directories/markets. Use when asked to release, publish or list a DSH plugin ("上线插件", "上架到插件市场", "发布到 npm", "打包 cordis 插件"), to scaffold a new DSH plugin repo, or to debug a DSH plugin that loads but does nothing.
metadata:
  author: zhao-guang-ai
  version: "1.0.0"
  source: https://github.com/zhao-guang-ai/dsh-plugin-release-kit
---

# DSH 插件上线

从「本地插件能跑」到「各插件市场都能装」。**12 个渠道、30+ 个坑**都已在真实项目上验证过（`dsh-quote-annotate-pro`，2026-10）。

**原则**：先让自动化生效（topic + npm 是自动收录的前提），再考虑人工提交；提交是以用户名义的公开行为 —— **先列清单给人确认，再动手**。

## 五阶段与出口条件

| 阶段 | 出口条件 |
|---|---|
| ① 工程准备 | `node tools/check-manifest.mjs` 通过 |
| ② 本地验证 | 装进 profile 并**实测每条功能**（只测"能装"不够） |
| ③ GitHub | public + 4 个 topic + Release + CI 绿 |
| ④ npm | `npm view <包名> version` 有值，且配好 Trusted Publisher |
| ⑤ 目录收录 | ≥3 个目录收录（自动 1 天 / 人工 1 周） |

## ① 工程准备（抄 `templates/`）

```sh
cp -r <skill>/templates/. <新插件>/     # 然后替换 <owner> <repo> <包名> 占位符
#   templates/package.json.tmpl      → package.json
#   templates/cordis.patch.yml.tmpl  → cordis.patch.yml
node tools/check-manifest.mjs
```

必须满足（缺一项就会被目录审核拒）：
- `package.json` 有 **`dsh.bundle.patch`**（"可安装"的必要条件，只声明 `dsh.client` 不算）
- patch 文件在**仓库根**，且 `insert` 里引用了包名
- 客户端 bundle 是 `window.__ModuleLoader__.load({ id, factory })`，**`id` 与包名完全一致**
- bundle 里 **`exports.inject = ['slots']` 必须声明** —— 不声明会在槽位未就绪时静默失效（不报错、无 UI）
- README 有安装命令（中英双版更好）、LICENSE 存在

## ② 本地验证

```sh
dsh plugin --profile <profile> add <本仓库绝对路径>   # link 安装：改文件即热更，无需重启
node tools/diag-sink.mjs                            # 可选：本地诊断接收端（探测不到就静默）
```

前端插件没有终端：**加一条可开关的诊断通道**（探测不到接收端就完全静默），否则出问题时无从下手。

## ③ GitHub

```sh
gh repo edit <owner>/<repo> --add-topic dsh-plugin --add-topic deepseek-harness --add-topic dsh --add-topic dsh-bundle
gh release create v0.1.0 --title "v0.1.0" --notes-file CHANGELOG.md
git tag -a v0.1.0 -m "v0.1.0" && git push origin main --follow-tags
```

- **topic 决定 7 个目录能否自动收录**；没有 `dsh-plugin` 永远不会被扫到。
- 非插件仓库（如工具包）**不要**加 `dsh-plugin`，会被当成插件去校验 bundle。

## ④ npm 发布（首次约 30~60 分钟，之后推 tag 即发）

首次人工发布：

```sh
# 账号：注册只能走网页（命令行 adduser 已关闭）；TOTP 2FA 已下线 → 用 passkey/安全密钥，并保存恢复码
npm login --auth-type=web --registry https://registry.npmjs.org/
npm publish --access public --registry https://registry.npmjs.org/
```

之后配 **Trusted Publisher**（`https://www.npmjs.com/package/<包名>/access`）：点 **GitHub Actions** 按钮 → 填 `<owner>` / `<repo>` / `release.yml` / `npm` → **勾 Allow npm publish** → 保存。
再配 `templates/.github/workflows/release.yml`，以后 `git tag` 即由 OIDC 自动发布（带 SLSA provenance，仓库零 token）。

npm 高危坑（详见 `references/runbook.md` §4）：邮箱 OTP 不能用于发布；granular token 权限必须选 `publish and stage`（选 `stage only` 只会产生 `0.0.0-stage` 占位版本）；token 不能预绑定尚未发布的包；已发布版本不可覆盖；首次发布后 registry 要几分钟才可见。

## ⑤ 目录收录

```sh
# 复查（已收录 / PR / Issue 状态一目了然）
node scripts/check-listings.mjs --owner <owner> --repo <repo> --pkg <包名> [--proxy]

# 提交（默认干跑，给人确认后再 --apply；自动跳过已有提交）
node scripts/submit-listings.mjs --owner <owner> --repo <repo> --desc-en "..." --desc-zh "..." --apply
```

- 目录清单、路线、门槛、格式：**`listings.json`**（脚本读它）
- 提交文案：**`references/texts.md`**
- 判定"是否已收录"：查**详情页 200/404** 或**它的数据文件**；⚠️ 搜索页 `?q=<包名>` 出现包名是**假阳性**（页面回显查询词）
- 网页表单（必须用户本人填）：dsh.pub（自动收录，提交会被判 `already_listed`）· dshplugin.dev（人工审核，记编号）· DSH Plugin Store（`summary ≤200 字符`、`category` 必选、**提交成功会清空表单**，回执是下方绿字）

## 插件"加载了却毫无反应"的排查顺序

1. `exports.inject` 是否声明了 `slots`（最常见）
2. 每个注册步骤是否包了 `try/catch`（一处抛错会中断后续注册）
3. 是否用了已不存在的 API（如 `input.insertReference`）→ 改走官方事件/状态
4. 组件里读的字段在当前 DSH 版本是否恒为 `undefined`（如 `useSessions(s => s.current)`）
5. DOM 定位是否依赖已消失的 `data-*`（改用官方状态或 `title` 反查）

## 参考文件

| 文件 | 内容 |
|---|---|
| `references/runbook.md` | 完整手册：五阶段细节、npm 10 坑、目录策略、环境备忘（Windows/VPN/gh/沙箱） |
| `references/texts.md` | 提交文案模板（一句话/长描述/兼容性说明/各目录正文/表单字段） |
| `listings.json` | 目录登记表（类型/路线/判据/门槛），两个脚本都读它 |
| `scripts/` | `check-listings.mjs`（复查）、`submit-listings.mjs`（提交）、`lib/gh.mjs`（自动定位 gh + 重试 + 代理） |
| `templates/` | CI、release(OIDC)、check-manifest、diag-sink、package.json、cordis.patch.yml、README 骨架、LICENSE |

> 工具包主页（可 star / 提 issue 更新目录规则）：https://github.com/zhao-guang-ai/dsh-plugin-release-kit
