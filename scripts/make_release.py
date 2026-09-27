"""打包 site/dist：写 release.json（每个文件的 SHA-256）并生成 releases/wanxiang-static-<release>.tar.gz。
之后按 DEPLOYMENT.md 上传，并在服务器上用 deploy/update.py 原子切换。"""
import datetime, hashlib, json, tarfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'site' / 'dist'
release = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
files = {}
for p in sorted(DIST.rglob('*')):
    if p.is_file() and p.name != 'release.json' and not p.name.startswith('.'):
        files[str(p.relative_to(DIST))] = hashlib.sha256(p.read_bytes()).hexdigest()
(DIST / 'release.json').write_text(json.dumps({'release': release, 'files': files}, ensure_ascii=False, indent=1))
out = ROOT / 'releases' / f'wanxiang-static-{release}.tar.gz'  # releases/ 不进 git
out.parent.mkdir(exist_ok=True)
with tarfile.open(out, 'w:gz') as tar:
    for p in sorted(DIST.rglob('*')):
        if p.name.startswith('.'):
            continue
        tar.add(p, arcname=str(p.relative_to(DIST)), recursive=False)
print(json.dumps({'release': release, 'files': len(files), 'archive': out.name, 'bytes': out.stat().st_size}))
