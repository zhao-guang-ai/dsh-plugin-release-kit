# 提交文案模板（复制即用）

> 把 `<owner>` `<repo>` `<pkg>` 换成你的实际值。**原则：事实性、无营销词、英文优先**。
> 表单类字段常有长度上限（DSH Plugin Store 的 summary ≤ **200 字符**），下面都标了实测长度。

---

## 1. 一句话描述（各表单通用）

**EN（146 字符，安全）**
```
Selection quoting and anchored annotations for DSH conversations: quote a passage and the model receives the exact text labelled by turn and role.
```

**EN（117 字符，更短）**
```
Selection quoting for DSH conversations: quote a passage and the model gets the exact text labelled by turn and role.
```

**ZH**
```
为 DSH 会话添加选区引用与锚点批注：选中文字带锚点进入输入框，输入框下方的引用条可跳回原文并高亮，发送后的引用块标明出处轮次与角色。
```

---

## 2. 长描述（README / 表单详述字段）

**EN**
```
<插件名> adds selection quoting and anchored annotations to DSH conversations. Select text in the transcript, write a short comment, and an anchored quote reference enters the composer; a quote bar under the composer jumps back to the source message and highlights it, and the quote block the model receives names the turn and the speaker's role, so a multi-turn conversation never has to guess which message was meant. Client-side only (no network access, no credentials); anchors persist in localStorage. MIT.
```

**ZH**
```
<插件名> 为 DSH 会话加上"划词 → 批注 → 引用"：选中消息里的文字即可批注，带锚点的引用进入输入框；输入框下方的引用条可跳回原文并高亮；发送的引用块标明出处轮次与角色，多轮对话中模型不必再猜你指的是哪一处。纯客户端、零网络请求、不碰凭证，锚点在 localStorage 持久化，MIT。
```

---

## 3. 兼容性与核验说明（表单的 "Anything we should verify" / issue 的 Compatibility 字段）

```
Client-side plugin only: no network access, no credentials; it stores a small quote-anchor map in localStorage (≤60 entries per session) and nothing else.

Verified on DSH <版本> (<profile> profile, <系统>), full flow: select text → annotate → quote chip → click to jump back and highlight → sent quote block.

Note: it is an MIT fork of <上游 owner/repo> and keeps the upstream attribution. Upstream <版本> fails silently on <DSH 版本> because four interfaces it relies on changed (missing `inject: ['slots']`; `conversation.chat.turnTail` became a list slot; `input.insertReference` no longer exists; `useSessions(s => s.current)` is always undefined). This fork fixes those and adds <新能力>.
```

> 若是原创插件，把 Note 换成一句能力边界说明即可（例如"requires a client-capable profile (Web UI); no host-side tooling or external services"）。

---

## 4. 各目录的提交正文

### 4.1 awesome-dsh-plugin（PR，in-DSH `dshmarket` 的目录源）

**新增文件** `data/plugins/<owner>__<repo>.yml`：
```yaml
url: https://github.com/<owner>/<repo>
name: <owner>/<repo>
category: ui
description:
  en: '<EN 一句话>'
  zh: '<ZH 一句话>'
```

**PR 标题**：`docs: add <owner>/<repo>`

**PR 正文**：
```markdown
Adds `data/plugins/<owner>__<repo>.yml` — one entry, no other files touched.

## What the plugin does

<EN 一句话 + 一句补充>

## Facts

- Repository: https://github.com/<owner>/<repo>
- `package.json` declares `dsh.bundle.patch` → `cordis.patch.yml` at the repository root
- npm: `<pkg>` (<版本>), published from GitHub Actions with npm Trusted Publishing (OIDC)
- License: MIT · categories: UI (`ui`)
- Verified on DSH <版本>, <profile> profile
```

> ⚠️ 仓库需**满 1 天**（其 CI 硬门槛）。

### 4.2 DSH Plugin Radar（PR）

在 `PLUGINS.md` 的 `## 🔌 单插件` 表格**末尾**加一行：
```
| <pkg> | [<owner>/<repo>](https://github.com/<owner>/<repo>) | <ZH 说明：一句话 + 关键行为 + 纯客户端/零网络> | 待测 |
```
**PR 标题**：`docs: 登记 <pkg>`　**正文**：说明"仅改动 PLUGINS.md 一行"。

### 4.3 Awesome DeepSeek Harness（PR）

在 `README.md` 与 `README.zh-CN.md` 的 `## UI, Themes & Interaction` 章节末尾各加一行：
```
- [<owner>/<repo>](https://github.com/<owner>/<repo>) - <对应语言的说明>
```
**PR 标题**：`docs: add <pkg>`

### 4.4 Issue 类（HackSing / cccakeee / dshplugin.me / 1024Store / dshplugin.world）

**HackSing**（有表单字段，按字段名组织）：
```markdown
### Plugin repository
https://github.com/<owner>/<repo>

### Primary value
<EN 一句话>

### Primary category
UI

### Installation and removal
Install: `dsh plugin --profile <profile> add <pkg>`
Remove: `dsh plugin --profile <profile> remove <pkg>`

### Compatibility and verification
<§3 的内容>

### Submission checklist
- [x] Public repository with MIT license
- [x] `package.json` declares `dsh.bundle.patch`; `cordis.patch.yml` at the root
- [x] README documents install and usage
- [x] Topics: `dsh-plugin` `deepseek-harness` `dsh` `dsh-bundle`
```

**其余**：自由格式，包含「仓库 / 安装命令 / 许可 / 一句话描述 / 验证版本」五项即可。
**dshplugin.world 例外**：要在**你自己的仓库**里开 issue，标题必须是 `[dshplugin.world] list this`。

---

## 5. 网页表单

### dsh.pub（`https://dsh.pub/en/submit/`）
- 只填**仓库 URL** 即可（其余它自己读 package.json）。
- ⚠️ 它按 **topic 自动收录**；若已收录，提交会返回 `already_listed`（不是错误）。

### dshplugin.dev（`https://dshplugin.dev/submit`）
- 填仓库 + Review note（§3 内容）。
- 回执：**记下 reference 编号**（形如 `sub_xxxxxxxx-…`）+ 状态 `Pending editorial review`。

### DSH Plugin Store（`https://dshpluginstore.com/submit`）
| 字段 | 要求 |
|---|---|
| Repository URL | 必填，`https://github.com/<owner>/<repo>` |
| One sentence | 必填，**≤200 字符**（用 §1 的 146 字符版） |
| Category | **必选**，UI 类选 `UI & Themes` |
| Anything we should verify | 可选，用 §3 |
| Your email | 可选（仅用于就本次提交回复你） |

⚠️ 三个坑：
1. **提交成功会清空表单**，成功回执是表单**下方一行绿字** `Received — we review every submission by hand and will list it after verification.` —— **页面被清空 ≠ 失败**。
2. 表单含**蜜罐字段 `botcheck`**（隐藏）：被密码管理器自动填充会被服务端静默丢弃 → 用无痕窗口手填最稳。
3. `summary` 超 200 字符会被浏览器静默截断。

---

## 6. 提交后：怎么判定"已收录"

```sh
# 一键复查全部目录（含 PR/Issue 状态）
node scripts/check-listings.mjs --owner <owner> --repo <repo> --pkg <pkg> [--proxy]
```

| 判据 | 说明 |
|---|---|
| 详情页 `GET /plugins/<owner>/<repo>` → 200 | ✅ 已收录（404 = 未收录） |
| SPA 站点 | 抓它的**数据文件**，别抓 HTML |
| `?q=<包名>` 搜索页出现包名 | ⚠️ **假阳性**：页面会回显查询词，不能作为判据 |
