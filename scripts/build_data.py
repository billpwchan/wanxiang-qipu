"""Build site/dist/data/cards.json from the official card API snapshot (research/raw-20260925).

Images are cached as research/cache/cards/<sha256(url)[:24]>.png (downloaded once, not deployed).
cards.json keeps the logical path assets/cards/<name>.png; run scripts/build_assets_v5.py next to
convert them to site/dist/assets/c/*.webp and rewrite the paths.
Usage: python3 scripts/build_data.py [--fetch]
--fetch re-downloads the five official endpoints into research/raw-<today> first.
"""
import datetime, hashlib, html, json, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'research' / 'raw-20260925'
ASSETS = ROOT / 'research' / 'cache' / 'cards'  # PNG 缓存（不上线）
OUT = ROOT / 'site' / 'dist' / 'data' / 'cards.json'
ENDPOINTS = {1: 'heroCards', 2: 'effectCards', 4: 'equipCards', 8: 'talentCards', 16: 'lords'}
URL = 'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_{}.js'


def fetch_raw():
    global RAW
    RAW = ROOT / 'research' / ('raw-' + datetime.date.today().strftime('%Y%m%d'))
    RAW.mkdir(parents=True, exist_ok=True)
    for n in ENDPOINTS:
        req = urllib.request.Request(URL.format(n), headers={'User-Agent': 'Mozilla/5.0'})
        (RAW / f'oscard_{n}.js').write_bytes(urllib.request.urlopen(req, timeout=30).read())


def load(n):
    t = (RAW / f'oscard_{n}.js').read_text(encoding='utf-8')
    return json.loads(t[t.index('{'):t.rindex('}') + 1])[ENDPOINTS[n]]


def clean(v):
    return html.unescape(re.sub(r'<[^>]*>', '', v or '')).strip()


missing = []


def local(url):
    if not url or not url.startswith('http'):
        return ''
    name = hashlib.sha256(url.encode()).hexdigest()[:24] + '.png'
    p = ASSETS / name
    if not p.exists():
        ASSETS.mkdir(parents=True, exist_ok=True)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://wxq.qq.com/'})
            b = urllib.request.urlopen(req, timeout=25).read()
            if b.startswith(b'\x89PNG') or b.startswith(b'\xff\xd8') or b[:4] == b'RIFF':
                p.write_bytes(b)
            else:
                raise ValueError('not an image')
        except Exception as e:  # keep going; the UI falls back to a monogram
            missing.append((url, str(e)))
            return ''
    return 'assets/cards/' + name


def base(c):
    return {'id': c['id'], 'name': c['name'], 'tier': c.get('quality'), 'faction': c.get('relationName', ''),
            'text': clean(c.get('desc')), 'cost': (c.get('shopBuyCost') or {}).get('Count'),
            'img': local(c.get('thumb') or c.get('image'))}


def hero(c):
    h = c['heroCard']
    p = h.get('properties', {})
    item = base(c)
    item.update({
        'awake': clean((h.get('awakeingCard') or {}).get('desc')),
        'kw': [k['name'] for k in h.get('keywordDescription', []) if k.get('name')],
        'stats': {'hp': p.get('HP'), 'atk': p.get('phyAttack'), 'ap': p.get('magAttack'), 'range': p.get('attackDistance'),
                  'mana0': p.get('initEnergy'), 'mana': p.get('energy'), 'as': p.get('attackSpeed')},
        'skills': [{'name': s['name'], 'text': clean(s['desc']),
                    'nodes': [{'lv': q['level'], 'text': clean(q['desc'])} for q in (s.get('enhanceSkill') or {}).get('params', [])]}
                   for s in h.get('skillList', [])],
        'art': local(c.get('image')),
    })
    return item


def with_related(c):
    item = base(c)
    rel = [{'name': x['name'], 'text': clean(x.get('desc'))} for x in (c.get('previewCards') or [])]
    if rel:
        item['rel'] = rel
    return item


def lord(l):
    def walk(card, out, seen):
        if card['id'] in seen:
            return
        seen.add(card['id'])
        out.append({'name': card['name'], 'text': clean(card.get('desc'))})
        for p in card.get('previewCards') or []:
            walk(p, out, seen)
    stages = []
    for t in l['talent']:
        out, seen = [], set()
        for c in t['cards']:
            walk(c, out, seen)
        stages.append({'stage': t['name'], 'cards': out})
    return {'id': l['lordId'], 'name': l['name'], 'img': local(l.get('avatar') or l.get('icon')),
            'art': local(l.get('portraitV2') or l.get('portrait')), 'stages': stages}


if __name__ == '__main__':
    if '--fetch' in sys.argv:
        fetch_raw()
    data = {
        'meta': {'season': 'S1', 'snapshot': RAW.name.replace('raw-', ''), 'patch': '9/24 v1.3.x',
                 'source': 'game.gtimg.cn 官方卡牌接口'},
        'heroes': [hero(c) for c in load(1)],
        'effects': [with_related(c) for c in load(2)],
        'equipment': [with_related(c) for c in load(4)],
        'talents': [with_related(c) for c in load(8)],
        'lords': [lord(l) for l in load(16)],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print(json.dumps({k: len(v) for k, v in data.items() if isinstance(v, list)}, ensure_ascii=False),
          'bytes', OUT.stat().st_size, 'missing images', len(missing))
    for u, e in missing[:10]:
        print('  missing', u, e)
