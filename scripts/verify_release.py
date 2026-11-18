"""核对 site/dist 与 release.json：逐文件 SHA-256 是否一致、清单与磁盘是否同一批文件。

用法：
  python scripts/make_release.py      # 先重算清单
  python scripts/verify_release.py    # 再核对

Windows 检出会把文本变成 CRLF，所以和 make_release.py 一样先换回 LF 再算 hash；
否则在 Windows 上永远对不上，而线上（Linux）其实没问题。
"""
import hashlib, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'site' / 'dist'


def payload(p):
    b = p.read_bytes()
    return b if b'\x00' in b else b.replace(b'\r\n', b'\n')


manifest = json.loads((DIST / 'release.json').read_text(encoding='utf-8'))
listed = set(manifest['files'])
actual = {
    p.relative_to(DIST).as_posix()
    for p in DIST.rglob('*')
    if p.is_file() and p.name != 'release.json' and not p.name.startswith('.')
}

bad = [name for name, want in manifest['files'].items()
       if hashlib.sha256(payload(DIST / name)).hexdigest() != want]
missing = sorted(listed - actual)
extra = sorted(actual - listed)

if bad or missing or extra:
    print('release.json 与 site/dist 不一致：')
    for n in bad[:10]:
        print('  哈希不符', n)
    for n in missing[:10]:
        print('  清单有、磁盘没有', n)
    for n in extra[:10]:
        print('  磁盘有、清单没有', n)
    sys.exit('先在本地跑 python scripts/make_release.py 再提交')

print(f"OK {manifest['release']} · {len(listed)} 个文件")
