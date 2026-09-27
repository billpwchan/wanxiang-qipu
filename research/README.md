# research

原始数据快照、条件查询结果、机制假设和分析脚本。网站和副驾只读 `site/dist/data/`，这里是生成那些文件的原料和过程记录。

| 目录 / 文件 | 内容 | 被谁用 |
|---|---|---|
| `raw-20260925/` | 官方卡牌接口快照（9/24 版本）：`oscard_1/2/4/8/16.js` = 英雄 / 效果 / 装备 / 天赋 / 棋手 | `scripts/build_data.py`、`fetch_art.py` |
| `v2/datawxq-20260925/` | datawxq 公开榜单：棋手榜、阵容榜（全部 + 每个禁用阵营） | `scripts/build_meta.py` |
| `v2/explore/` | datawxq 检索器：`q-*.json` 查询清单、`r-*.json` 结果、`log-*.txt` 运行记录 | `v3/build_evidence.py`、`v3/analyze.py` |
| `v2/sim-hanxin.json` | 雅典娜韩信一局的能量 / 经验账本模拟 | `scripts/sim_hanxin.py` 的输出 |
| `v3/hypotheses.md` | 查数据之前写下的机制假设与可证伪预测 | — |
| `v3/build_evidence.py` | 检索器结果 → `site/dist/data/evidence.js` | 数据流程第 5 步 |
| `v3/analyze.py`、`v3/deep.py` | 联动（交互项）、撞车双重差分、棋手适配 → `v3/deep-report.txt` | — |
| `v4/official/` | 官方棋手 3D 立绘、阵营 / 关键词 / 品阶图标、`lords.json` | `scripts/build_assets_v5.py`、`build_facts.mjs` |
| `v4/lineups/lineups.json` | 官方社区阵容 500 个（去掉作者信息）：阵容码、英雄、棋手、导入次数 | `scripts/build_facts.mjs` |
| `v4/retired/data/` | v4 的内容模块（路线、机制链、要点、棋手指南、每张牌一句话），v5 已下线，留作参考 | — |
| `v4/old-site/`、`v4/cards.v4.json` | v4 前端与卡牌数据 | — |
| `engine/` | 机制引擎：把卡面规则变成「每回合事件 → 放大器 → 等级」的计算模型（不是战斗模拟） | — |
| `deep-s1-2026-09-23/` | 9/23 的 S1 深度推演与全英雄取舍研究，以及当时的官方数据快照 | 早期版本 |
| `raw/`、`*-readable.txt`、`asset-manifest.json`、`snapshot-manifest.json` | 9/23 的官方数据快照与可读版本 | 早期版本 |
| `INTEGRATION.md`、`PLANNER.md`、`QA.md`、`REVIEW.md` | 9/23 各版本的接入说明、推演器设计、核验记录、阵容复核 | — |

不在仓库里的本地目录（`.gitignore`）：

- `cache/cards/`：官方卡面 PNG 缓存，`build_data.py` 自动下载；
- `skins/`：官网皮肤原画缓存，`fetch_skins.py` 自动下载；
- `v4/fonts/`：阿里妈妈数黑体 npm 包，获取方法见 [docs/data-pipeline.md](../docs/data-pipeline.md)；
- `v4/lineups/p*.js`、`v4/lineups/all.json`、`raw/lineups.json`：社区阵容原始数据，含作者昵称、用户 ID、头像；
- `v4/retired/` 下除 `data/` 以外的退役素材。

早期版本（9/23）的研究结论有些已被后来的数据推翻，比如按卡面把姜导、镜排在前面。引用前请以 `docs/methodology.md` 和当前的 `facts.js` 为准。
