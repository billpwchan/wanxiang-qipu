"""Normalize the public Tencent card snapshot; never silently invent missing fields."""
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'site' / 'dist' / 'data'
OUT.mkdir(parents=True, exist_ok=True)

def clean(value):
    return html.unescape(re.sub(r'<[^>]*>', '', value or '')).strip()

def card(c):
    item = {'id': c['id'], 'name': c['name'], 'tier': c['quality'],
            'faction': c.get('relationName', ''), 'text': clean(c.get('desc')),
            'cost': c.get('shopBuyCost', {}).get('Count'), 'thumb': c.get('thumb',''), 'image': c.get('image',''),
            'source': 'https://camp.qq.com/h5/webdist/os-handbook-detail/index.html?id=' + str(c['id']) + '&isNavigationBarHidden=1#/'}
    if c.get('heroCard'):
        h = c['heroCard']
        item.update({'awakened': clean(h.get('awakeingCard', {}).get('desc')), 'stats': h.get('properties', {}),
                     'keywords': [x['name'] for x in h.get('keywordDescription', [])],
                     'skills': [{'name': s['name'], 'text': clean(s['desc']),
                                 'breakpoints': [{'level': p['level'], 'text': clean(p['desc'])} for p in s.get('enhanceSkill', {}).get('params', [])]}
                                for s in h.get('skillList', [])]})
    if c.get('previewCards'):
        item['related'] = [{'name': x['name'], 'text': clean(x.get('desc'))} for x in c['previewCards']]
    return item

data = {'meta': {'season': 'S1', 'fetchedAt': '2026-09-23', 'patchReviewed': '2026-09-21 · V1.1.14',
                 'notice': '官网公开卡牌快照，不等同于客户端逐项实测。阵容判断为机制推导，没有对局胜率样本。'}, 'sources': []}
for name, key, endpoint in [('heroes', 'heroCards', 1), ('talents', 'talentCards', 8), ('equipment', 'equipCards', 4), ('effects', 'effectCards', 2), ('lords', 'lords', 16)]:
    raw = (ROOT / 'research' / 'raw' / (name + '.json')).read_bytes()
    values = json.loads(raw)[key]
    data['sources'].append({'id': name, 'url': f'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_{endpoint}.js', 'count': len(values), 'sha256': hashlib.sha256(raw).hexdigest()})
    if name == 'lords':
        data[name] = [{'id': l['lordId'], 'name': l['name'], 'thumb': l.get('portrait',''), 'image': l.get('icon',''), 'abilities': [{'stage': t['name'], 'cards': [card(c) for c in t['cards']]} for t in l['talent']]} for l in values]
    else:
        data[name] = [card(c) for c in values]
keywords = {}
for c in json.loads((ROOT / 'research/raw/heroes.json').read_text())['heroCards']:
    for k in c['heroCard'].get('keywordDescription', []):
        keywords[k['name']] = clean(k['desc'])
data['keywords'] = keywords
# Prefer the checked local copy; cache_assets.py fetches any newly introduced art.
asset_manifest = ROOT / 'research' / 'asset-manifest.json'
if asset_manifest.exists():
    media = {r['url']: r['path'] for r in json.loads(asset_manifest.read_text())['files'] if not r.get('error') and (ROOT / 'site/dist' / r['path']).is_file()}
    def localize(x):
        if isinstance(x, dict):
            for k in ('thumb', 'image'):
                if x.get(k) in media:
                    x[k + 'Original'] = x[k]
                    x[k] = media[x[k]]
            for v in x.values(): localize(v)
        elif isinstance(x, list):
            for v in x: localize(v)
    localize(data)
(OUT / 'cards.json').write_text(json.dumps(data, ensure_ascii=False, indent=2))
(ROOT / 'research' / 'snapshot-manifest.json').write_text(json.dumps(data['sources'], ensure_ascii=False, indent=2))
print('Prepared:', ', '.join(f'{k}={len(data[k])}' for k in ['heroes', 'lords', 'talents', 'equipment', 'effects']))
