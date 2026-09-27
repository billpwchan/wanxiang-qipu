"""官方社区阵容 → 去掉作者信息的精简版，供 build_facts.mjs 使用（阵容码、名字、英雄、棋手、导入次数）。
原始分页 research/v4/lineups/p*.js 与合并后的 all.json 含作者昵称、用户 ID、头像，只留在本地、不进仓库。
python3 scripts/trim_lineups.py   → research/v4/lineups/lineups.json"""
import json
from pathlib import Path

D = Path(__file__).resolve().parents[1] / 'research/v4/lineups'
src = json.loads((D / 'all.json').read_text())
keep = [{
    'key': l['key'], 'name': l['name'], 'tag': l.get('tag', ''), 'useNum': l['useNum'],
    'createTimestamp': l.get('createTimestamp'), 'seasonId': l.get('seasonId'),
    'lordList': [{'name': x['name']} for x in l.get('lordList', [])],
    'heroList': [{'name': x['name']} for x in l.get('heroList', [])],
} for l in src]
(D / 'lineups.json').write_text(json.dumps(keep, ensure_ascii=False, separators=(',', ':')))
print(len(keep), 'lineups →', D / 'lineups.json', (D / 'lineups.json').stat().st_size // 1024, 'KB')
