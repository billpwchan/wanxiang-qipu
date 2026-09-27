# CLAUDE.md

王者万象棋 S1 对局助手：静态网站（`site/dist/`）+ macOS 局内副驾（`copilot/`），共用 `site/dist/data/` 的判断数据。文档默认简体中文。

## 常用命令

```sh
npm run serve                        # http://127.0.0.1:4173/
npm test                             # verify-site + verify-ui（50 项，自带服务器）+ 副驾回放
node scripts/build_facts.mjs         # 改 plan.js 或数据后重算 facts.js
node scripts/sync_readme.mjs         # README 路线表；CI 用 --check
node scripts/build_readme_images.mjs # docs/images/ 配图（macOS 用 GPU）
node copilot/test/run.mjs            # 副驾完整流程（macOS：Chrome + Vision OCR）
```

## 结构与约定

- 网站无构建、无 npm 依赖：原生 ES 模块，`app.js`（哈希路由，字符串模板，插值必须过 `esc()`）、`glass.js`（WebGL2 竖纹玻璃）。不要引入框架或打包工具。
- `data/plan.js` 是人写的打法，不写统计数字；`data/facts.js`、`meta.js`、`evidence.js`、`cards.json`、`release.json` 是生成文件，不要手改。
- 路线主数字 = 专门打这套的棋手的**全部对局**平均名次（开局选择口径）。「打成这套」的终局统计有幸存者偏差，只作上限参考，不能当主数字。见 `docs/methodology.md`。
- 强弱先按卡面机制推（成本、免费 vs 付费涨级、主核、弱点、没成型时），再用数据验证；只改口径或措辞不算分析。
- 页面文案写给玩家：短句、动词开头、游戏里的叫法；不写统计术语和「最强」一类的词（`verify-site.mjs` 会查）。
- 局内功能必须零输入：副驾只读屏幕，最多一次可选点击。
- `site/dist/` 应与线上发布一致（`release.json` 有每个文件的 SHA-256）。改了就要走发布流程。

## 部署

只动本项目：`scripts/make_release.py` → scp 到服务器 `/tmp` → `ssh … "sudo python3 - <R> <archive>" < deploy/update.py`（原子切换，自动回退）。不要重启其他容器、不要改网关其他片段。见 `docs/deployment.md`。

## 数据与隐私

- `research/cache/`、`research/skins/`、`research/v4/fonts/` 是可重新下载的缓存，不进仓库。
- 社区阵容原始数据含作者信息，只提交 `scripts/trim_lineups.py` 生成的 `lineups.json`。
- `copilot/logs/` 可能含个人对局画面，不进仓库。
