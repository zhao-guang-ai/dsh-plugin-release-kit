# DSH 插件上线流程手册（RUNBOOK）

> 从「本地插件能跑」到「出现在各插件市场」，一条可复现的路径。
> 本文档由 `dsh-quote-annotate-pro` 的真实上线过程沉淀（2026-10-10 ~ 10-11）：12 个渠道、30+ 个坑，每条都标了**症状 → 原因 → 处理**。
>
> 配套物料：`listings.json`（目录登记表，机读）、`scripts/`（自检 / 复查 / 提交）、`templates/`（CI 与包清单模板）、`PR-TEXTS.md`（提交文案模板）。

---

## 0. 总览：五个阶段

| 阶段 | 目标 | 出口条件 | 预计耗时 |
|---|---|---|---|
| **① 工程准备** | 仓库根具备可安装 bundle 契约 | `node scripts/check-manifest.mjs` 通过 | 10 分钟 |
| **② 本地验证** | 真机跑通插件 | 装进 profile 并实测功能 | 视插件而定 |
| **③ GitHub 上线** | 公开仓库 + topic + Release + CI | `gh repo view` 四个 topic 齐全、CI 绿 | 15 分钟 |
| **④ npm 发布** | 包可被 `dsh plugin add <名>` 安装 | `npm view <包名> version` 有值 | 30~60 分钟（首次） |
| **⑤ 目录收录** | 各市场可见 | 至少 3 个目录收录 | 自动 1 天 / 人工 1 周 |

**关键顺序**：③ 的 topic 决定了 ⑤ 里 7 个目录能否**自动**收录；④ 决定市场是否显示下载量与安装命令。**topic 和 npm 越早越好**，它们是自动化的前提。

---

## 1. 阶段①：工程准备（仓库根放什么）

```
<你的插件>/
├── package.json          ← 必须含 dsh.bundle.patch + dsh.client（若有前端）
├── cordis.patch.yml      ← 插入 Loader 行
├── lib/index.js          ← Host 半区（可空占位，但要有 apply）
├── lib/client.js         ← Client 半区（浏览器 bundle，见下）
├── README.md / README.en.md
├── CHANGELOG.md
├── LICENSE               ← MIT 或其他
├── .gitignore / .gitattributes
├── tools/check-manifest.mjs
└── .github/workflows/{ci,release}.yml
```

### 1.1 `package.json` 的 DSH 契约（最容易被拒的一点）

```jsonc
{
  "name": "dsh-your-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": { "default": "./lib/index.js" }, "./client": "./lib/client.js" },
  "files": ["lib", "cordis.patch.yml", "README.md", "LICENSE"],
  "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },   // ★ 必须有：决定能否 dsh plugin add
    "client": { "platform": "web", "inject": [] }  // 仅带浏览器 UI 时
  }
}
```

> ⚠️ **只声明 `dsh.client` 不算可安装**。目录审核被拒的头号原因就是缺 `dsh.bundle`。

### 1.2 Client bundle 的加载契约

浏览器半区必须是**工厂式 CJS**，由 DSH 的模块加载器执行：

```js
window.__ModuleLoader__.load({
  id: 'dsh-your-plugin',            // ★ 必须与 package.json 的 name 完全一致
  factory: (require) => {
    const React = require('react')  // React 是平台种子，无需打包
    function apply(ctx) { /* 注册槽位等 */ }
    exports.name = 'dsh-your-plugin'
    exports.inject = ['slots']      // ★ 服务依赖必须声明，否则 slot 未就绪时会静默失效
    exports.apply = apply
    return module.exports
  },
})
```

要点：
- **`inject` 必须声明**。`ctx.get('slots')` 拿到 `undefined` 就 `return`，是"插件加载了却毫无反应"的头号原因（不报错）。
- 每个注册步骤包 `try/catch`，失败要能看见（见 1.4 诊断通道）。
- **不需要构建步骤也能写**：`lib/client.js` 可直接手写（你的插件就这么做），改完保存即生效。
- 想用打包器也可以，但产物一样要是上面这个形状。

### 1.3 版本号与入口一致性

`tools/check-manifest.mjs`（模板里有）会校验：包名 ↔ bundle id ↔ patch 引用三者一致。**每次改完先跑它**：

```sh
node tools/check-manifest.mjs
```

### 1.4 加一条可开关的诊断通道（强烈建议）

前端插件没有终端，出问题时你不知道为什么。加一个"探测不到接收端就静默"的上报：

```js
const DIAG_ENABLED = true
const DIAG_URL = 'http://127.0.0.1:47821/dsh-plugin'
function report(tag, detail) { /* console.log + POST，失败吞掉 */ }
```

本地开一个只有几行的接收端即可实时看到全链路事件（模板 `templates/tools/diag-sink.mjs`）。发布时保留也无害：探测失败就静默，不产生网络噪音。

---

## 2. 阶段②：本地验证

```sh
# 装进某个 profile（link 方式：改文件即热更，无需重启）
dsh plugin --profile <profile> add <本仓库绝对路径>
```

- 改 `lib/client.js` 保存后，客户端 HMR 会自动热更该插件（无需重启 DSH）。
- 真机测**每一条**功能，并让诊断通道把关键路径打出来（例如：`register:ok …` / `insert:ok …` / `jump:ok`）。
- **只测"能装"是不够的**：上游 `dsh-quote-annotate` 的教训是——它加载成功、不报错、但一个 UI 都没注册。

---

## 3. 阶段③：GitHub 上线

### 3.1 建仓库（空仓库，**不要**勾 README/License）

```sh
git init -b main
git add -A && git commit -m "feat: v0.1.0"
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```

### 3.1.1 立刻设置仓库简介与主页（**极易漏，实测会卡住收录**）

```sh
gh repo edit <owner>/<repo> \
  --description "一句话说明（≤350 字符，中英并列更好）" \
  --homepage "https://www.npmjs.com/package/<包名>"
```

**为什么必做**（真实踩坑）：

- **所有市场都抓 GitHub 的 `description` 字段**。我们漏了这一步，结果 DSH Market 里 `"description": ""`、靠它自动生成的 `descriptionZh` 兜底 —— 展示质量下降。
- **HackSing/dsh-plugins 的自动准入会直接拒**：机器人回复 *"自动复核不能准入：仓库缺少简介"*，要求补全后再评论 `/recheck`，14 天不满足就自动归档关闭。
- 建议同一条命令把 `homepage` 指向 npm 包页，用户点进去就能看到版本与安装命令。

> 漏了也别慌：随时可补（`gh repo edit` 或网页 About ⚙️），然后在对应 issue 里评论 `/recheck` 重审即可。

### 3.2 加 topic（**决定自动收录，务必做**）

```sh
gh repo edit <owner>/<repo> --add-topic dsh-plugin --add-topic deepseek-harness --add-topic dsh --add-topic dsh-bundle
gh api repos/<owner>/<repo>/topics   # 复核
```

- 7 个目录**只扫 topic**，没有 `dsh-plugin` 就永远不会被自动收录。
- 加完 topic **24 小时内**陆续出现（DSH Market 每天 03:00 扫描，dsh.pub/dsh-plugin.org 更快）。

### 3.3 Release 页

```sh
gh release create v0.1.0 --title "v0.1.0 — 首个版本" --notes-file CHANGELOG.md
```

### 3.4 两条 CI 工作流（模板直接抄）

| 工作流 | 触发 | 作用 |
|---|---|---|
| `ci.yml` | push / PR | `node --check` + 清单自检 |
| `release.yml` | 推 `v*` 标签 | 校验 tag↔版本 → 自检 → **OIDC 发布 npm**（带 provenance） |

---

## 4. 阶段④：npm 发布

### 4.1 一次性准备（只有首次需要）

1. **注册账号必须走网页**：`npm adduser --auth-type=legacy` 已被关闭（`Account creation via legacy auth is unavailable`）。npm 网页若被 Cloudflare 拦（VPN 出口 IP 常见），换浏览器/无痕/关扩展，或用**手机热点/手机浏览器**。
2. **TOTP（验证器 App）2FA 已下线**：`npm profile enable-2fa auth-and-writes` 会报 `Adding a new TOTP 2FA is no longer supported`。
   → 到 `https://www.npmjs.com/settings/<user>/tfa` 加 **security key / passkey**，并**保存恢复码**。
3. **发布强制强 2FA**：只开邮箱 OTP 不够，`npm publish` 会 403
   （`Two-factor authentication or granular access token with bypass 2fa enabled is required`）。
4. 于是有两条发布路径：

| 路径 | 做法 | 适用 |
|---|---|---|
| **A. 人工首发** | 网页建 **Granular Access Token**：`Bypass 2FA` 打开、Permissions 选 **`Read and write (publish and stage)`**（⚠️ 不要选 `stage only`，否则只会产生 `0.0.0-stage` 占位版本）、Packages 选 **All packages** | 首次发布 |
| **B. CI 自动发版** | 配 **Trusted Publisher**（见 4.3），之后推 tag 即发布，无需 token | 长期 |

首发命令：

```sh
npm login --auth-type=web --registry https://registry.npmjs.org/   # 手机/浏览器完成授权
npm publish --access public --registry https://registry.npmjs.org/
```

### 4.2 npm 踩坑速查（全部真实发生）

| 症状 | 原因 | 处理 |
|---|---|---|
| `ENEEDAUTH` | 未登录；或 `.npmrc` 指向 npmmirror（**只读镜像**） | 显式加 `--registry https://registry.npmjs.org/`；`package.json` 里也写 `publishConfig.registry` |
| `E403 ... bypass 2fa` | 账号无强 2FA / token 无 bypass | 见 4.1 |
| `E400 Token name is required` | `npm token create` 未带 `--name` | 加 `--name=<名字>` |
| `E401 You do not have access to the requested package(s)` | token 想绑定**尚未发布**的包 | 用 `All packages` |
| 只出现 `0.0.0-stage` 占位版本 | token 权限选成了 **stage only** | 改成 `publish and stage` 重发 |
| `E403 ... too similar to existing package` | 包名与既有包近似 | 换名（如加 scope `@user/<name>`） |
| 发布命令"没反应"，registry 仍 404 | **npm 首次发布要处理几分钟** | 等 2~5 分钟再查，别急着重发 |
| `You cannot publish over the previously published versions` | 版本已存在 | bump `version` 后重发 |
| 吊销 bypass-2FA token 报 403 | 吊销属"账号变更"，2026-08 起受限 | 只能在网页 Access Tokens 里删 |

### 4.3 配 Trusted Publisher（一次配置，永久免 token）

1. 发布成功后打开 `https://www.npmjs.com/package/<包名>/access`
2. **Publishing access** 选第一项：`Require two-factor authentication and disallow bypass 2fa tokens (recommended)`
3. **Trusted Publisher** → 点 **GitHub Actions** 按钮（**要先点它才会展开表单**）→ 填四项：

   | 字段 | 值 |
   |---|---|
   | Organization or user | `<owner>` |
   | Repository | `<repo>` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |

4. **Allowed actions**：勾 **`Allow npm publish`**（不勾只能 stage publish）；`Allow npm dist-tag` 可按需
5. 保存后，以后发版只需：

```sh
# 改 package.json 版本 + 记 CHANGELOG
git tag -a v0.1.1 -m "v0.1.1" && git push origin main --follow-tags
# release.yml 自动发布（带 SLSA provenance），无需 token / 动态码
```

---

## 5. 阶段⑤：目录收录

### 5.1 三类目录，策略不同

| 类型 | 目录 | 你要做什么 |
|---|---|---|
| **A. 自动（topic 扫描）** | DSH Market（dsh.market）· dsh-plugin.org · **dsh.pub** · dshplugin.market · dsh-xray · DSH Marketplace · DSH Plugin Hub | **只要 topic + 公开仓库**，1 天内自动出现 |
| **B. PR / Issue** | awesome-dsh-plugin（in-DSH `dshmarket` 的目录源）· DSH Plugin Radar · Awesome DeepSeek Harness · DSH Marketplace 精选 · HackSing · cccakeee · dshplugin.me · 1024Store · dshplugin.world | 用 `scripts/submit-listings.mjs` 或手动开 PR/Issue |
| **C. 网页表单（必须本人）** | dsh.pub · dshplugin.dev · DSH Plugin Store | 用户填写（模板见 `PR-TEXTS.md`） |

> 完整清单、路线、格式要求见 **`listings.json`**（机读）与本文 §7。

### 5.2 提交规则要点（踩过的）

- **HackSing/dsh-plugins 的 issue 标题必须以 `[Plugin]:` 开头** —— 用别的标题（如 `Submit a plugin: …`）它的自动收录流程**识别不到**，只能靠维护者手动补标签。其自动复核还会查「仓库公开简介、license、README、插件结构」，被拒后在 issue 里评论 `/recheck` 重审（14 天不满足自动归档）。
- **GitHub 仓库简介（description）缺失会卡住收录**：见 §3.1.1。

- **仓库必须满 1 天**：`awesome-dsh-plugin` 的 CI 硬门槛（不足会红）。
- **dsh.pub 不需要提交**：它按 topic 自动同步 + 静态契约校验，人工提交会被判 `already_listed`。
- **DSH Marketplace 精选（DshMarketPlace）**：其 CI 要求 `npm test` 重新生成两份 README + `marketplace-cache.json` 一起提交，且 topic 准入要求**≥10 个提交** → 提交数不够时先别提。
- **一个 PR 只改一个文件/一行**：多条目列表用独立文件（如 `data/plugins/<owner>__<repo>.yml`）以避免冲突。
- **文案要求**：事实性、无营销词；英文优先；一句话描述 ≤200 字符（表单常见上限）。
- **提交是以你名义的公开行为**：先列清单给人确认，再提交；每个目录只提交一次。

### 5.3 判定"是否已收录"的正确姿势

| 目录类型 | 判据 |
|---|---|
| 有详情页的（dsh-plugin.org / dsh-plugins.org / dshmarketplace.dev …） | `GET /plugins/<owner>/<repo>` → **200 = 已收录，404 = 未收录** |
| SPA（dsh.market / dshmarketplace.dev） | 抓它的**数据文件**，别抓 HTML：dsh.market 在 `2BingLing/dsh-market` 的 `web/public/plugins-lite.json`（>1MB，需 raw 头） |
| dsh.pub | 查它仓库的 `packages/catalog/src/community.generated.json`（`status: verified`）与 `topic-analysis.generated.json`（`status: listed`） |
| 1024Store | `https://api.deepseek1024.com/v1/plugins/search?q=<包名>` 的 `total` |

> ⚠️ **伪判据**：`?q=<包名>` 搜索页里出现包名 ≠ 已收录 —— 页面会回显查询词，这是假阳性（我们踩过）。

---

## 6. 环境与工具备忘（Windows 实测）

| 事项 | 结论 |
|---|---|
| **GitHub 网络** | `github.com:443` 常被 TLS 重置；`api.github.com` 时通时断；**SSH(22) 一直可用**。开 VPN 后设 `HTTPS_PROXY=http://127.0.0.1:7890` 最稳 |
| **gh CLI** | 免安装即可：从 GitHub release 取其 windows zip（可经 mirror 下载 + **用 API 的 sha256 校验**），解压到工作区，`gh.exe` 直接调用 |
| **gh 认证** | 设备码流程：`gh auth login --web`（输出里的一次性码给人，浏览器授权）。若 gh 写不了 `%APPDATA%`（沙箱受限组），token 其实已在 **Windows 凭据管理器**里，手写一个最小 `hosts.yml`（只写 `user` + `git_protocol`）即可用 |
| **gh 不能写本地文件**（本沙箱） | `gh run view --log` 之类会失败 → 改用 `gh api …/actions/jobs/<id>/logs --allow-escape-sequences` 直接取日志文本 |
| **大文件提交** | Contents API 传 base64：**必须 `--input <json文件>`**，命令行传参会 `ENAMETOOLONG`（Windows ~32KB 上限） |
| **PowerShell 5.1** | 不支持 `??`、`&&`；`>` 重定向写 UTF-16（别用它存 JSON）→ 用 Node 读写文件 |
| **Node 路径** | 本机 `D:\DeepSeekHarness\dsh-home\dsh-runtimes\…\node\bin\node.exe`（v24） |
| **npm** | 系统 npm 在 `D:\Program Files\nodejs`（v11），`.npmrc` 默认指向 npmmirror → 发布必须显式 `--registry` |

---

## 7. 目录登记表（速查版）

| 目录 | 类型 | 路线 | 备注 |
|---|---|---|---|
| DSH Market（dsh.market） | 自动 | topic 扫描（每日 03:00） | 数据在 `2BingLing/dsh-market` |
| dsh-plugin.org | 自动 | topic 扫描 | 有详情页；未被收录可 `/submit` |
| dsh.pub | 自动 | topic 同步 + 静态契约校验 | **提交会被判 already_listed** |
| dsh-xray | 自动 | 按仓库批量生成卡片 | 慢 |
| DSH Marketplace | 自动 | Next.js 站点 | 详情页 `/plugins/<owner>/<repo>` |
| dshplugin.market | 自动 | 纯前端 topic 扫描 | 无后端 |
| DSH Plugin Hub | 自动 | 每日扫描 | 曾出现 503（站点侧） |
| **awesome-dsh-plugin** | PR | `data/plugins/<owner>__<repo>.yml`（1 个文件） | **in-DSH `dshmarket` 的目录源**；仓库需满 1 天 |
| DSH Plugin Radar | PR | `PLUGINS.md` 表格加一行 | 也每天 02:00 自动扫描 |
| Awesome DeepSeek Harness | PR | `README.md` + `README.zh-CN.md` 各一行 | 双语 |
| DSH Marketplace 精选 | PR | `data/curated.yml` 加 `- repo:` | 需 regenerated README + cache；≥10 commits |
| HackSing DSH Plugins | Issue | `submit-plugin.yml` 字段 | |
| DeepSeek Harness Plugins | Issue | 自由格式 | 站点从此仓库同步 |
| dshplugin.me | Issue | 自由格式 | |
| 1024Store | Issue | 自由格式 | 响应慢 |
| dshplugin.world | Issue | **在自己的仓库**开 issue，标题 `[dshplugin.world] list this` | 特殊约定 |
| dshplugin.dev | 表单 | 网页 | 人工审核，给编号 |
| DSH Plugin Store | 表单 | 网页 | ⚠️ **提交成功会清空表单**，回执是下方绿字 |

---

## 8. 常见症状速查（前端插件）

| 症状 | 最可能的原因 |
|---|---|
| 插件"加载了但毫无反应"、控制台无报错 | 少了 `exports.inject = ['slots']`，`apply` 在服务就绪前 return |
| 注册了一部分、后面全没有 | 某个注册调用抛错且未捕获（注意 chain→list 之类的槽位类型变更） |
| 点按钮没反应 | 组件里读的字段在当前版本恒为 `undefined`（如 `useSessions(s => s.current)`） |
| 插入内容退化成纯文本 | 调用了已不存在的 API（如 `input.insertReference`），应改走官方事件 |
| DOM 里找不到自己的元素 | 上游改了渲染，`data-*` 属性消失（只剩 CSS 类）→ 用官方状态或 `title` 反查 |
| 跳转/高亮找不到目标行 | 锚点键变了；确认 `data-chat-anchor-key` / `data-chat-turn` 的实际取值 |

---

## 9. 一键清单（复制到 issue/PR 里用）

```markdown
- [ ] `node tools/check-manifest.mjs` 通过
- [ ] 本机 profile 实测通过（记录验证方式与 DSH 版本）
- [ ] package.json 含 `dsh.bundle.patch`；patch 文件在仓库根
- [ ] README 有安装命令；中英双版；LICENSE 存在
- [ ] 仓库 public；topics: dsh-plugin / deepseek-harness / dsh / dsh-bundle
- [ ] GitHub Release 已建（tag = package.json version）
- [ ] npm 已发布（`npm view <pkg> version` 有值）
- [ ] Trusted Publisher 已配（owner / repo / release.yml / npm）
- [ ] 等 1 天后复查自动目录；需要时用 scripts/submit-listings.mjs 提交 PR/Issue
- [ ] 表单类目录（dsh.pub / dshplugin.dev / DSH Plugin Store）填写并留档编号
```
