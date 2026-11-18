# `data/` 说明

社区阵容数据的落库结果。三个文件都由脚本或外部快照归纳，不手改（`versions.json` 除外）。

| 文件 | 内容 | 来源 |
|---|---|---|
| `comps.json` | 112 条社区阵容，按 `lineupCode` 去重 | `scripts/gen_comps.mjs` 归纳外部快照 |
| `lords.json` | 棋手外键表，只有 `{ id, name }` | 官方卡池 `lords` 抽取 |
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

## 更新

```sh
npm run gen:comps -- --in <快照目录> --out data
npm run validate
```

仓库内不含原始快照，见根目录 `README.md` 的「社区阵容数据」。
