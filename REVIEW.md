# REVIEW：kekeguai/wanxiang-qipu 只读代码审查

审查日期 2026-11-19。只读：未修改仓库内任何文件（本文件除外），未提交，未开 PR。破坏性验证全部在临时改动后还原，见第 2 节。

## 0. 审查范围与 HEAD 说明

- 请求基准：`5c9d942`（"docs: 更新 README 及数据源说明，替换在线网址为 wxq.007.al (#16)"）。
- 实际 HEAD：`1843a2c`（"docs: 新增 PROJECT_HISTORY.md，README 目录加一行"）。`5c9d942` 是 HEAD 的祖先，两者之间另有 `067045e`（"SEO：补 meta/robots/sitemap，路由从 # 改成 History (#17)"）。`git diff --stat 5c9d942 HEAD` = 20 files changed, 330 insertions(+), 133 deletions(-)。本报告针对 `1843a2c`，比请求基准多含 #17 的路由/SEO 改动。
- 范围：`scripts/validate.mjs`、`verify-site.mjs`、`verify-ui.mjs`、`check_real_diff.mjs`、`fetch_stats.mjs`、`merge_stats.mjs`、`build_comps_site.mjs`、`site/dist/app.js`、`vercel.json`、`deploy/Caddyfile`、`.github/workflows/*.yml`、`.gitattributes`、`.gitignore`、`data/comps.json` 的结构。未审 `node_modules`，未逐条审 `site/dist/data` 下生成 JSON 的全量内容。

## 1. 分级发现

### P0

无。未发现会导致线上崩溃、不可恢复的数据损坏或凭据泄露的问题。

### P1

#### P1-1 部分抓取结果会被当全量合并，已有统计被清空

- 位置：`scripts/merge_stats.mjs:86`（配合 `scripts/fetch_stats.mjs:226`、`:264`）
- 问题：`merge_stats.mjs` 只遍历输入 JSON 的 `lineups` 数组，从不读 `coverage.lineupsFetched` / `total` / `sampleCount`（`:116` 只是把 `sampleCount` 原样抄进 `statsSnapshot`）；输入里没有的 rosterKey 走 `delete st[f]; st.source = ''`，把上次合并好的统计直接抹掉。
- 触发：`fetch_stats.mjs` 因 `--max-pages`（`:226`）或连续 4 轮无新增（`:227`）提前收尾——这两条都是退出码 0、照常写文件（`:264`）——再拿这份覆盖不全的文件跑 `merge_stats.mjs`，未出现在本次抓取里的阵容统计全部变 `null`。`statsSnapshot.sampleCount` 仍写页面报的全量样本数，看上去"合并成功"。
- 复现：`node scripts/fetch_stats.mjs --max-pages 1 --out /tmp/partial.json`，然后 `node scripts/merge_stats.mjs --in /tmp/partial.json`，对比 `data/comps.json` 中 `stats.source === 'datawxq.com'` 的记录数（当前 31，会变少）；测完 `git checkout -- data/comps.json`。
- 修法：merge 前要求 `lineupsFetched >= total`（或 `rosterKeysMatched === compsRosterKeys`），不满足就报错退出、不写文件。

#### P1-2 阵容榜样本数与日期是手写常量，数据刷新后永久陈旧，且测试是循环断言

- 位置：`site/dist/app.js:828`（`312,754 局样本 · 更新于 2026-11-18`）
- 结论：手写常量，不是生成物。全仓只有 3 处该字面量：`app.js:828`、`verify-ui.mjs:194`、`README.md:247`。`scripts/build_comps_site.mjs` 只输出 `site/dist/data/comps.json`（`:166`），其 meta 只带 `statsScope`（`:149`），不带 sampleCount / fetchedAt，也不会重写 `app.js`。
- 问题：真实值就在 `data/comps.json` 的 `statsSnapshot`（`sampleCount: 312754`、`fetchedAt: 2026-11-18T14:27:03.666Z`），但没进站点 meta，前端只能写死；下次 datawxq 重抓后页面日期和样本数不会变。`verify-ui.mjs:194` 断言的就是同一字面量，改数据不会让测试失败。
- 触发：任何一次 stats 重新合并（`merge_stats.mjs` 改 `data/comps.json` → `build_comps_site.mjs` 重生成站点数据）之后，页面仍显示 `312,754` / `2026-11-18`。
- 复现：`grep -rn '312,754' site/dist scripts README.md`；或改 `data/comps.json` 的 `statsSnapshot.sampleCount` 后跑 `node scripts/build_comps_site.mjs`，`app.js` 不变。
- 修法：`build_comps_site.mjs` 把 sampleCount / fetchedAt 写进 meta，`app.js` 从 `COMPS.meta` 读，`verify-ui.mjs:194` 改为与 meta 比对。
- 分级说明：按影响判 P1——不是崩溃也不是数据损坏，但这是站点对外声明的核心事实，且现有测试结构上抓不到。

#### P1-3 cards.json 拉取失败会让全站停在「载入中…」，没有任何兜底

- 位置：`site/dist/app.js:1114`（`Promise.all`）/ `:1115`
- 问题：`fetch('/data/cards.json').then((r) => r.json())` 没有 `.catch`（`art.json`、`comps.json` 都有）；cards.json 一失败整个 `Promise.all` reject，`render()` 永不执行，页面停在骨架的「载入中…」。
- 触发：弱网/断网/CDN 5xx 时打开任意页面（cards.json 是站点最大的数据文件之一）。实测：CDP 屏蔽 `/data/cards.json` 后加载 `/comps` → `#view` 文本 "载入中…"、innerHTML 长度 64、0 张卡、控制台 `TypeError: Failed to fetch`。
- 复现：`node scripts/serve.mjs`，DevTools Network 屏蔽 `/data/cards.json`，刷新 `/comps`。
- 修法：给 cards.json 的 fetch 加 `.catch`，失败时渲染一行可见错误（与阵容页「阵容数据没有载入，刷新一下试试」同款）。

#### P1-4 统计结果不可回溯：原始响应不落库，无法复核历史数字

- 位置：`scripts/merge_stats.mjs:112`（`statsSnapshot` 只有汇总），`.gitignore:40`（`snapshots/probe-stats/` 不进仓库）
- 问题：`data/comps.json` 的 `statsSnapshot` 只有 `{source, fetchedAt, statisticsScope, sampleCount, rosterKeysMatched, recordsFilled}`，没有原始 lineups；原始响应所在的 `snapshots/probe-stats/` 被 gitignore，仓库内该目录为空，`git log --all -- snapshots` 无记录。`merge_stats.mjs` 原地覆盖 stats，无版本、无旧值。
- 触发：任何人质疑某个数字时，无法从仓库内任何文件反查到抓取原始值。
- 复现：`ls snapshots/probe-stats`（空）；`statsSnapshot` 段无 lineups 数组；全盘搜索 datawxq 原始响应只有 `deepseek-chat.json` 一份聊天记录。
- 修法：把 `coverage` 与命中的 lineups 摘要（rosterKey / appearanceRate / avgPlacement / count）随 `statsSnapshot` 落库，或按日期归档快照目录。

#### P1-5 merge_variants.mjs 存在与 merge_stats 同源的部分合并漏洞（未修）

- 位置：`scripts/merge_variants.mjs:178-184`（`variantsSnapshot` 的 `rosterKeysRequested` / `rosterKeysFetched` / `rosterKeysWithVariants` 未被校验）
- 问题：输入不全时仍会合并并整体重写 `variantsSnapshot`，不校验 requested 与 fetched 是否一致；未命中的记录保持原样（`:134`）不会被清空，但快照与 note 会以本次部分抓取的数据覆盖上一次的全量记录。未修。

### P2

#### P2-1 fetch_stats 把任何加载失败都报成「页面结构可能变了」

- 位置：`scripts/fetch_stats.mjs:159`
- 问题：离线/风控/DNS 失败时页面没有 `.el-select`，脚本输出 `没能把最小场次降到 10，页面结构可能变了`，误导排查方向。实测断网：`minimumCount filter: no-select no-option` → 该消息 → exit 1。
- 触发：网络不通与 datawxq 改版输出完全相同。
- 复现：`CHROME_PATH=<带 --proxy-server=127.0.0.1:1 的 Chrome 包装器> node scripts/fetch_stats.mjs --out /tmp/x.json`。
- 修法：`.el-select` 不存在时先判断页面是否加载成功（title/正文），区分「没加载出来」和「结构变了」。

#### P2-2 cpPct 的 0.1 阈值造成精度跳变

- 位置：`site/dist/app.js:746`
- 问题：`(v * 100).toFixed(v < 0.1 ? 1 : 0)`：<10% 显示一位小数（9.9%），≥10% 掉到整数（12%），同一列数字精度不一致；吃鸡率大多在 11–17%，全部被抹成整数。
- 触发：任何登场率/吃鸡率/前三率跨过 10% 的阵容。
- 复现：`node -e "const f=(v)=>((v*100).toFixed(v<0.1?1:0)+'%');console.log(f(0.0999),f(0.1),f(0.115))"` → `10.0% 10% 12%`。
- 修法：统一一位小数（或统一两位），阈值只用于「是否显示」不改精度。

#### P2-3 断言分布：共 91 个静态 check 点，默认执行 89 条；阵容页 22 条最多，其中 1 条是循环断言

- 位置：`scripts/verify-ui.mjs`（按 `check(` 调用点统计）
- 分布：开局 16（含「我的棋手」4）、路线 15、对局 11、棋手/查牌/规则 16（棋手 3、查牌 5、规则 1、热门 6、数据说明 1）、阵容 22（阵容榜 10、卡片/交互 12）、SEO 6、全局 5。91 个静态点中 `:255` 只在溢出失败时触发、`:260` 仅 GPU=1 执行，默认执行 89 条，与运行输出 `89/89 通过` 一致。
- 结论：断言分布均衡（各功能组 11–16，阵容 22 最高），不存在「只查元素存在」的集中退化；主要薄弱点是 P1-2 的循环断言（`:194`）与线上 Vercel 行为未覆盖。
- 复现：`node scripts/verify-ui.mjs`；分组按 `check(` 前缀统计。
- 修法：`:194` 的期望值改成从 `site/dist/data/comps.json` meta 读。

#### P2-4 vercel.json 的 catch-all 会把缺失静态资源变成 200 HTML，且无安全响应头

- 位置：`vercel.json:8`（rewrites）、`vercel.json:1`
- 问题：`/(.*) → /index.html` 对不存在的 `/assets/*.webp`、`/data/*.json` 也返回 index.html（200），资源 404 被掩盖成 HTML 解析错误；Caddy 用 `@page` 排除了 `/assets/* /data/* /fonts/* /app.css /app.js /glass.js`（`deploy/Caddyfile:26`），`scripts/serve.mjs:21` 也按扩展名 404。Caddy 有 CSP / X-Frame-Options 等头（`deploy/Caddyfile:8-15`），`vercel.json` 没有。
- 触发：任何资源路径拼错或文件被删时，线上返回 200，测试（跑在本地 server）抓不到。
- 复现：部署后请求 `/assets/nope.webp`，观察 200 + text/html。
- 修法：rewrite 排除带扩展名的路径，并补安全响应头。

#### P2-5 第三方 action 只钉 tag，未钉 commit SHA

- 位置：`.github/workflows/auto-update.yml:84`（`peter-evans/create-pull-request@v6`）
- 触发：上游 tag 被移动或账号被攻破时，CI 用写权限 token 执行任意代码（该 job 有 `contents: write` / `pull-requests: write`）。
- 复现：`grep -n 'uses:' .github/workflows/*.yml`。
- 修法：钉到完整 commit SHA。

#### P2-6 verify.yml 的步骤名与断言数不一致

- 位置：`.github/workflows/verify.yml:27`（`真实浏览器交互（50 项）`，实际 89）
- 触发：看 CI 日志的人误判覆盖面。
- 复现：`grep -n '真实浏览器交互' .github/workflows/verify.yml`。
- 修法：去掉硬编码数字。

#### P2-7 app.js 多处图片/链接插值未过 esc()

- 位置：`site/dist/app.js:88`（`<img src="${src}"`；同模式 `:200`、`:289`、`:372`、`:530`、`:916`、`:925`）
- 触发：仅当数据文件（cards.json / facts.js / art.json）被写入带引号的内容时才会破坏属性结构；当前这些值来自仓库内生成文件，外部官方接口只影响 name 类字段（已 esc），现实风险低。
- 复现：`grep -n '\${src}\|\${img}\|splash.src' site/dist/app.js`。
- 修法：所有插进属性的值统一过 `esc()`。

#### P2-8 validate.mjs 的缺口（部分被 verify-site 兜住）

- 位置与缺口：`:214` 只查 lineupCode 唯一，全文件无 name 唯一性检查；`:250` level 只查整数（实际恒为 1，未校验）；`:252` positionX/Z 只查整数，无范围/重叠；`:350-355` 登场率等有 0~1，avgPlacement 只查 >0 无上限，count/variantCount 无 ≤sampleCount；`:364` variants 只查 ≤ variantCount；`:390-397` 变阵 added/removed 英雄不做 heroes.json 外键（`verify-site.mjs:125-131` 有兜）；全文件 0 处校验 `statsSnapshot` / `variantsSnapshot`。另：`:4` 的 usage 写了 `[--out data/comps.json]`，解析器只认 `--in` / `--dry`。
- 触发：手工改数据或 merge 异常时，这些字段可以写进任意合法类型值而不报错。
- 复现：把 `data/comps.json` 任一 `stats.count` 改成 `999999999`，`npm run validate` 通过；把 `st.avgPlacement` 改成 `100`，同样通过。
- 修法：补 count ≤ sampleCount、avgPlacement < 7、变阵英雄外键、statsSnapshot 结构校验。

### 已核查、未发现问题

- `check_real_diff.mjs` 的忽略清单（cards.json 只去 `meta.snapshot` / `meta.patch`；release.json 只去 `release` 和 `files['data/cards.json']`；其余任何 tracked/untracked 变更都算真变更）：未发现「真变更被判无变更」的字段；第二阶段 3/4 双向验证通过。深比较依赖键序，方向是误报而非漏报。
- 敏感串 grep：`signed_path` 0、`file?file_id` 0、`BEGIN PRIVATE KEY` 0、`Bearer <token>` 0、`set-cookie`/`cookie:` 0。`token` 仅 2 处第三方前端常量（`research/raw/js-cards.js:413` `'AKD5Kz'`、`research/raw/js-comm.js:315` `'O2oh2z'`），非本项目凭据；工作流 token 只作为 action 输入传递，未打印。
- 工作流权限：`verify.yml` `contents: read`；`auto-update.yml` 的 contents/pull-requests write 是 push 分支 + 开 PR 所需；无 `pull_request_target`。
- 路由/404：`/r/<bad>` 与未知路径走 `notFound()`（`app.js:389`、`:962`），深链刷新在 `scripts/serve.mjs`、`deploy/Caddyfile`、`vercel.json` 三处都有回退；旧 `#/` 与 `#/route/` 链接有 `replaceState` 兼容（`app.js:1113`、`:961`）。
- 81 套 `stats: null` 的渲染：见第 3 节，运行时确认走「暂无统计」，不显示 0。

## 2. 第二阶段：破坏性验证

| # | 命令 | 输出摘要 | 判定 | 工作树 |
|---|---|---|---|---|
| 1 | 临时把 `comps.json` records[0].heroList[0].id 改为 99999999 → `npm run validate` | `comps.json.records[0](lineupCode=92382113832668248).heroList[0]：id 99999999 不在 data/heroes.json 里`，`data/ 校验失败：1 个问题`，exit 1 | 通过（按预期失败） | `git checkout -- data/comps.json`，status 空 |
| 2 | 临时制造两条重复 lineupCode → `npm run validate` | `comps.json.records[1]：lineupCode 重复（首次出现在 records[0]）`，exit 1 | 通过（按预期失败） | 已还原，status 空 |
| 3 | 只改 `site/dist/data/cards.json` 的 `meta.snapshot` → `node scripts/check_real_diff.mjs` | `No real data changes, skip PR`，exit 0 | 通过 | 已还原，status 空 |
| 4 | 改 cards.json 一个真实数值字段 → `node scripts/check_real_diff.mjs` | `site/dist/data/cards.json 内容有变化（已忽略 meta.snapshot）` + `REAL_CHANGES`，exit 1 | 通过 | 已还原，status 空 |
| 5 | 删除 `site/dist/app.js:853` 的 `    ${cpRank()}` → `CHROME=… npm test` | `79/89 通过`，exit 1；10 条 `阵容榜：*` 全部 FAIL（10 行/在网格前/升序两位小数/无重复/合并标套数/千分位/口径/样本数/行内字段/链接） | 通过（按预期失败） | `git checkout -- site/dist/app.js`，status 空；sha256 与备份一致（`ec59ccbcb7ad8d33`） |
| 6 | 断网跑 `fetch_stats.mjs` | `minimumCount filter: no-select no-option` / `没能把最小场次降到 10，页面结构可能变了`，exit 1；输出文件不存在；`snapshots/probe-stats` 仍为空 | 通过（无残缺文件） | 未改仓库文件，status 空 |

测试 5 说明：第一次尝试用正则 `/^    \$\{cpRank\(\)\}\n/m` 删除，因文件是 CRLF、`\n` 匹配不到，行数 1127→1127 未变，`npm test` 89/89 通过——该次无效；改为按 `\n` 切分删除后重做，得表中结果。

测试 6 说明：本机无管理员权限，未改系统网络设置；在仓库外（`D:\LS\ZcodeTemp\scratch-review\`）自编一个 Chrome 包装器追加 `--proxy-server=127.0.0.1:1` 模拟断网，先以 `ERR_PROXY_CONNECTION_FAILED` 验证拦截生效。不是物理断网。该次测试同时暴露 P2-1 的错误文案。

## 3. 第三阶段：数据真实性抽样

**前提限制：仓库内不存在 datawxq 原始响应，无法执行「从 snapshots 原始响应反查」。** 证据：`data/comps.json` 的 `statsSnapshot` 只有汇总字段、无 lineups 数组；`snapshots/probe-stats/`、`snapshots/probe-variants/` 为空且被 `.gitignore:38-40` 排除；`git log --all -- snapshots` 无记录；全盘搜索 `appearanceRate` / `avgPlacement` 只命中 `data/comps.json` 与 `deepseek-chat.json`（聊天记录）。以下是仓库内可执行的部分。

抽样：固定种子 20261119 的 LCG 从 112 条中抽 `records[37]`、`[97]`、`[109]`（随机、可复现）。

手算 1：`records[37]` lineupCode `45090461592399904`「大河开团射」
- heroList id：1991, 5061, 1561, 5771, 5051, 1741, 1891 → 升序 1561,1741,1891,1991,5051,5061,5771 → rosterKey `7|1561|1741|1891|1991|5051|5061|5771`，与 `site/dist/data/comps.json` 同码记录完全一致。
- stats → 渲染：appearanceRate 0.2792 → 27.92% → `cpPct` 阈值 ≥0.1 取整 → **28%**（DOM 实测「登场率28%」）；avgPlacement 3.1722 → 卡片 `toFixed(1)` → **3.2**（DOM「平均名次3.2」）；count 14551 → `toLocaleString` → **14,551 局**（DOM 一致）；variantCount 24 = `data/comps.json` 该记录 `variants` 24 条 = 站点 `vars` 24 → 「查看变阵 24」。
- 榜单行：3.1722 → `ruler(dp:2)` → **3.17**（DOM 第 1 行）。

手算 2：`records[97]` lineupCode `32143986255858924`「白歌三分登场」
- id 1061,1271,1411,1841,1281,1231 → 升序 1061,1231,1271,1281,1411,1841 → `6|1061|1231|1271|1281|1411|1841` ✓。
- 0.1846 → 18%；4.0334 → 4.0；9623 → 9,623 局（DOM 全对）；variantCount 28 但 `variants: null` → 不显示变阵面板（DOM 无 summary），符合「没抓过变阵不提」。

手算 3：`records[109]` lineupCode `43`「三分登场流」（官方预置）
- id → `7|1061|1071|1231|1241|1281|1411|1841` ✓；无 stats → 站点 `st: null` → `cpCard` 走「暂无统计」（DOM `社区阵容 43 | 暂无统计`，无 `.stats` 块，无 0）。

81 套 `stats: null` 验证（运行时 `/comps` DOM，CDP）：112 张卡、「暂无统计」81 处、`.stats` 块 175 = 31 + 144（变阵行），cpsum「共 112 套 · 31 套有对局统计 · 6 套有变阵（144 条）」。文本里 25 处疑似 0 的匹配经查全是合法值（如「869 局 / 登场率6.0%」），非 null→0。

聚合一致性：`data/comps.json` 有 stats 的记录 31 = 站点 `meta.withStats`；variants 合计 144 = `meta.variantsTotal`；`statsSnapshot.rosterKeysMatched=15` 而 `recordsFilled=31`（同一 rosterKey 对应多条阵容码，即榜单的「共 N 套同阵容」）。

结论：仓库内能验证的链路（data/comps.json 字段 → 站点 `st` → DOM 文本）全部一致；**抓取阶段真实性未覆盖**——datawxq 当时返回的原始响应不在仓库也不在本机，无法证明这些数字确实来自接口。

## 4. 未验证的假设

以下结论只靠读代码或单次运行，未做进一步验证：

- datawxq 抓取时的真实响应内容（无原始文件，第 3 节）。
- `merge_stats.mjs` / `merge_variants.mjs` 的历史执行记录（无日志）。
- Vercel 线上实际响应行为（按 `vercel.json` 语义推断，未部署验证）。
- GitHub Actions 的实际运行历史与权限越权测试（本机无 gh CLI）。
- 「运维会用提前收尾的 fetch 文件去 merge」（P1-1 的触发路径存在，但未观察到真实发生）。
- `app.js:828` 的 `312,754` 与 `statsSnapshot.sampleCount` 当前同值，但两者无自动关联（巧合一致）。
- 测试 6 用代理模拟断网，未做物理断网。

## 5. 工作树状态

`git status --porcelain` 原始输出：

```
?? REVIEW.md
```

其余为空。本次审查未在仓库内创建或修改其他文件；所有临时改动已还原。
