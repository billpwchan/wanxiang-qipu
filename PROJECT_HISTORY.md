# 万象棋谱 项目重构与演进史 (PROJECT_HISTORY.md)

> 写给未来的开发者（或 AI Agent）：这份文档记录了本项目从“原作者停更的半废”状态，被接盘重构为“全自动现代数据站”的全部过程。如果你接手了这个项目，请先读这份文档，它能让你省去几天的逆向抓包和踩坑时间。

## 一、 前世今生：为什么要重构？
本仓库 fork 自原作者的 `billpwchan/wanxiang-qipu`。接手时项目处于以下状态：
1. 作者停更（停在 9/24 数据版本）。
2. 存在跨平台 BUG：Windows 下由于 ESM 模块路径问题，构建和校验脚本直接崩溃；CRLF 换行符导致 CI 误报。
3. 数据陈旧：图鉴停留在旧版，缺少关键战斗属性。
4. 原始 `data/comps.json` 中的数据仅有阵容码和英雄，胜率与变阵全靠手动整理或为 null。

**重构核心目标**：修复底层架构，全量更新真实数据，打通前端胜率榜与变阵展示，实现每日自动更新与 Vercel 托管。

## 二、 技术里程碑（已完成的硬核改造）
1. **基础修复**：修复了 Windows 下 `pathToFileURL` 的报错；统一了 CRLF/LF；重写了零依赖的 `validate.mjs`。
2. **图鉴全量翻新**：通过 `589094_oscard_new_*.js` 接口抓取了最新卡池。补全了 13 项隐藏属性（物防、法防、暴击、移速等），更新为 85英雄 / 77装备 / 292天赋 / 98效果牌，并补齐了最后 2 位冷门棋手（武凤、安琪拉）的立绘与数据。
3. **数据突破：逆向 datawxq 签名**：
   - datawxq 接口有严格签名（t, did, nonce, signature）和 IP 风控（42000）。
   - **破局点**：我们用 CDP（Chrome DevTools Protocol）启动无头浏览器，在页面上下文 `import` 了它的 `seo-*.js` 并调用其导出的 `dz` 函数，让官方前端自己帮我们算签名，成功绕开了风控。
   - **Join Key 发现**：datawxq 的阵容 ID 和官方不同。我们发现了万能关联键 `rosterKey`（格式：`英雄数量|升序排列的英雄ID`），成功把 31万局的真实胜率（Top 10榜）和 144 条变阵数据合并进了 `data/comps.json`。
4. **前端大重构**：
   - 新增 `#/comps` 页面（阵容库）。
   - 增加“真实胜率 Top 10”榜单，按 `avgPlacement` 升序。
   - 增加“变阵折叠面板”，展示变阵前后的英雄替换、场次、登场率。
   - 增加“一键复制阵容码”和“跳转对应打法路线”功能。
   - 将 Hash 路由（`/#/`）重构为 History 路由（`/comps`），并补齐了 SEO 相关的 meta 标签、`robots.txt` 和 `sitemap.xml`。
5. **CI/CD 与全自动化**：
   - 配置了 Vercel 自动构建，并增加了 `vercel.json` 配置（排除安装依赖，直接打包 `site/dist`）。
   - 配置了 GitHub Actions (`auto-update.yml`)，每天定时抓取官方新卡池。
   - **防抖黑科技**：编写了 `check_real_diff.mjs`，排除了 `meta.snapshot` 和 `release.json` 时间戳的影响，确保只有“官方真实数据变更”时才会开 PR，否则每天绿着跳过。

## 三、 数据流与架构映射
- **官方卡池 (无风控)**：`game.gtimg.cn` 抓取 → `research/raw-<date>/` → `build_data.py` → `cards.json`。
- **第三方统计 (有风控)**：`datawxq.com` 抓取（需代理或本地跑）→ `fetch_stats.mjs` / `fetch_variants.mjs` → 按 `rosterKey` 合并进 `data/comps.json`。
- **前端数据裁剪**：`data/comps.json` → `build_comps_site.mjs` → `site/dist/data/comps.json`（减小体积）。
- **校验与发布**：`validate.mjs` (数据契约) → `verify-site.mjs` (静态站点完整性) → `make_release.py` (生成 SHA256 清单)。

## 四、 未来维护指南 (给 AI 和开发者的 SOP)

### 1. 日常检查（三绿测试）
改动任何代码后，必须跑通：
```bash
npm run validate  # 检查数据外键与 schema
npm run verify    # 检查静态文件引用完整性
CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" npm test  # 89项真实浏览器交互断言

```
