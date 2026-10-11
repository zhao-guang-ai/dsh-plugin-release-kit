# dsh-plugin-release-kit

把「本地能跑的 DSH 插件」变成「各插件市场都能装」的可复用工具包。
本工具包由 [`dsh-quote-annotate-pro`](https://github.com/zhao-guang-ai/dsh-quote-annotate-pro) 的真实上线过程沉淀（12 个渠道、30+ 个坑），**每个坑都有症状 → 原因 → 处理**。

## 里面有什么

| 文件 | 用途 |
|---|---|
| **[RUNBOOK.md](./RUNBOOK.md)** | 主文档：五阶段流程（工程 → 本地验证 → GitHub → npm → 目录收录）+ 踩坑速查 + 症状对照表 |
| **[listings.json](./listings.json)** | 机读目录登记表：每个目录的类型、路线、判据、格式、门槛 |
| **[PR-TEXTS.md](./PR-TEXTS.md)** | 提交文案模板（一句话/长描述/兼容性说明/各目录正文/表单填写），含字符数核对 |
| **[skill/SKILL.md](./skill/SKILL.md)** | **DSH skill 入口**：让任意会话直接加载整套流程（见下"装成 skill"） |
| **[scripts/check-listings.mjs](./scripts/check-listings.mjs)** | 一键复查：已收录？PR/Issue 什么状态？ |
| **[scripts/submit-listings.mjs](./scripts/submit-listings.mjs)** | 按表自动开 PR / Issue（默认干跑，内置去重与重试） |
| **[scripts/install-skill.mjs](./scripts/install-skill.mjs)** | 把本工具包安装成用户级 DSH skill（一条命令，幂等） |
| **[scripts/lib/gh.mjs](./scripts/lib/gh.mjs)** | 共享工具：自动定位 gh、重试、代理、章节插入 |
| **[templates/](./templates)** | 直接抄进新插件仓库的模板：CI/release 工作流、`check-manifest.mjs`、诊断接收端、`package.json`、`cordis.patch.yml`、LICENSE、`.gitignore`/`.gitattributes` |

## 装成 DSH skill（推荐）

```sh
node scripts/install-skill.mjs          # 装到 ~/.agents/skills/dsh-plugin-release（已存在时加 --force 覆盖）
```

装完**新开一个会话**，会话启动时会扫描 skill 目录，之后任意会话都能直接加载：

```
加载 dsh-plugin-release 这个 skill
```

skill 是**自包含**的（70 KB）：`SKILL.md` + `listings.json` + `scripts/` + `templates/` + `references/{runbook,texts}.md`，离线可用。
它描述了什么时机该用它（中英触发词都有：上线插件 / 上架到插件市场 / 发布到 npm / publish a DSH plugin …），以及五阶段命令与高危坑的排查顺序。

> 说明：skill 目录在**会话启动时**扫描，所以当前会话内新装的 skill 要等下一个会话才可见（本会话实测确实加载不到）。

## 快速开始（新插件）

```sh
# 1) 建仓库骨架：把 templates/ 里对应的文件抄进去
cp -r templates/. <你的插件>/          # 然后把 <owner> <repo> <包名> 等占位符替换掉
#    templates/package.json.tmpl        → package.json
#    templates/cordis.patch.yml.tmpl    → cordis.patch.yml

# 2) 自检（CI 也会跑同一份）
node tools/check-manifest.mjs

# 3) 本地装进 profile 实测
dsh plugin --profile <profile> add <你的插件绝对路径>

# 4) 上线 GitHub：public + 这四个 topic（决定能否被自动收录）
gh repo edit <owner>/<repo> --add-topic dsh-plugin --add-topic deepseek-harness --add-topic dsh --add-topic dsh-bundle

# 5) 发布 npm（首次看 RUNBOOK §4；之后配好 Trusted Publisher，推 tag 即发布）
git tag -a v0.1.0 -m "v0.1.0" && git push origin main --follow-tags

# 6) 等 1 天，复查与提交目录
node scripts/check-listings.mjs --owner <owner> --repo <repo> --pkg <pkg>
node scripts/submit-listings.mjs --owner <owner> --repo <repo> --desc-en "..." --desc-zh "..."        # 干跑
node scripts/submit-listings.mjs --owner <owner> --repo <repo> --desc-en "..." --desc-zh "..." --apply # 真提交
```

## 脚本说明

### `check-listings.mjs`
```sh
node scripts/check-listings.mjs --owner <owner> --repo <repo> [--pkg <包名>] [--proxy] [--json]
```
- **A 类目录**：按 `listings.json` 里的判据自动判 ✅/⏳（详情页 200/404、数据文件、API total）
- **B 类目录**：用 `gh` 搜该仓库里带包名的 PR/Issue，输出编号与状态
- `gh` 不在 PATH 也能用：自动探测常见安装位置，或用 `GH_BIN=<gh 路径>` 指定

### `submit-listings.mjs`
```sh
node scripts/submit-listings.mjs --owner <owner> --repo <repo> [--pkg <包名>] \
     [--desc-en "..."] [--desc-zh "..."] [--dsh-version 0.2.0-rc.2] [--compat "..."] \
     [--only id1,id2] [--skip id] [--include-skipped] [--apply] [--proxy]
```
- **默认干跑**：逐条打印将要提交的标题、正文与文件改动
- `--apply` 才写远端；**已有我们开的 PR/Issue 会自动跳过**（防重复）
- PR 路线：自动 fork → 建分支 → 新建文件或"在指定章节末尾插一行" → 开 PR
- Issue 路线：按 `bodyTemplate` 渲染后开 issue
- 大文件走 `--input` 写 JSON 载荷，规避 Windows 命令行长度上限

## 已被验证的路径（真实数据）

`dsh-quote-annotate-pro` 用它跑出来的结果：**3 个目录自动收录**（DSH Market / dsh-plugin.org / dsh.pub）、**3 个 PR 待合并**（含 in-DSH `dshmarket` 的目录源，CI 双绿）、**5 个 Issue 待回应**、**2 个表单待人工审核**。

## 注意

- 提交是**以你名义的公开行为**：`submit-listings.mjs` 先干跑、给人确认，再 `--apply`。
- 每个目录**只提交一次**；脚本会自动跳过已有提交。
- 目录规则会变（门槛、字段、审核方式），以 `listings.json` 里的 `gate`/`note` 与你实际看到的页面为准。

## 许可

MIT，见 [LICENSE](./LICENSE)。`templates/` 里的文件可随意复制进你的插件仓库（无需署名）。
