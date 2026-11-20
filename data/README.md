# `data/` 说明

数据落库结果。除 `versions.json` 外都由脚本或外部快照生成，不手改。

| 文件 | 内容 | 来源 |
|---|---|---|
| `comps.json` | 112 条社区阵容，按 `lineupCode` 去重 | `scripts/gen_comps.mjs` 归纳外部快照 |
| `lords.json` | 棋手外键表，只有 `{ id, name }` | 官方卡池 `lords` 抽取 |
| `heroes.json` | 英雄图鉴，85 条 | 官方卡池 `heroCards` 抽取 |
| `equips.json` | 装备图鉴，77 条 | 官方卡池 `equipCards` 抽取 |
| `talents.json` | 天赋图鉴，292 条 | 官方卡池 `talentCards` 抽取 |
| `effects.json` | 效果牌图鉴，98 条 | 官方卡池 `effectCards` 抽取 |
| `versions.json` | 数据版本与抓取时间 | 手写 |

## `comps.json`

字段白名单见 `scripts/validate.mjs`。几条容易误判的：

- `stats` 四个字段（`avgRank` / `pickRate` / `difficulty` / `equipRate`）官网不提供，恒为 `null`，`statsNote` 说明原因。不要用 `operationDetails` 推 `variants`，不要用 `equipList` 算穿戴率。
- `useNum` 按栏位存进 `useNumByColumn`。跨栏记录的官方取值不同，全部保留，不取单值、不取平均。
- `seasonIdRaw` 按官方原值存，不做语义解释。`general` / `hot` 是 0，`beginner` 是 1；这里的 1 是栏位标识，不是赛季。
- `beginner` 栏全部是官方预置阵容（`tag=官方`、`useNum` 恒 0），对应记录带 `isPreset: true`，不与 `general` / `hot` 的使用次数比较。
- `brief` / `positionDesc` / `equipDesc` 写成 `{ text, source: "ugc" }`，非空才写。玩家原文照录，版权归原作者，见 `NOTICE`。
- `operationDetails[].desc` 可能为空串，源数据如此，非生成错误。所以校验只要求是字符串，不要求非空。
- 不落库：`recommendLords`、`video`、整个 `author` 对象、`interactiveData.infoID`、`interactiveData.exposedComments`。

## `lords.json`

只存 `id`（整数，官方 `lordId`）和 `name`，按 `id` 升序。卡面、技能、立绘在 `site/dist/data/lords.json`（那是素材宽高表，另一个文件），不重复存。

条数不写死：卡池版本升级本来就会增删棋手。校验只要求 `id` 唯一、`name` 非空，条数由 `npm run validate` 当 info 打出来供核对。

## 图鉴四表

图鉴数据由 `589094_oscard_new_{n}.js` 生成，`stats` 包含完整战斗属性。

- 四张表只存纯数据，**不含任何图片字段**（`img` / `art` / `icon` / `thumb` / `url` 一律不写）。卡面、立绘、图标由 `site/dist/data/cards.json` 自己管，两处不重复。
- `type` 是官方卡牌类型：`1` 英雄、`2` 效果牌、`5` 装备、`6` 天赋。每张表的 `type` 恒为该表对应值。
- 公共字段：`id`、`name`、`type`、`tier`（官方 `quality`）、`faction`（官方 `relationName`）、`cost`（官方 `shopBuyCost.Count`）、`desc`（官方 `desc`，已去 HTML 标签）。
- `heroes.json` 另有 `stats`（`hp` / `atk` / `ap` / `range` / `mana0` / `mana` / `as` / `phyDefense` / `magDefense` / `criticalRate` / `criticalEffect` / `moveSpeed` / `initEnergy`）、`kw`（关键词）、`awake`（觉醒）、`skills`。
- `equips.json` 另有 `grpName`（装备子类）和 `equipType`（装备大类）；`talents.json` / `effects.json` 另有 `grpName`（天赋包 / 效果牌包）。
- 关联卡牌（官方 `previewCards`）非空时写进 `rel`。
- 生成方式：`python3 scripts/build_data.py --fetch` 产出 `site/dist/data/cards.json`，再从其中抽取这四张表。

## 更新

```sh
npm run gen:comps -- --in <快照目录> --out data
npm run validate
```

仓库内不含原始快照，见根目录 `README.md` 的「社区阵容数据」。
