"""打包 site/dist：写 release.json（每个文件的 SHA-256）并生成 releases/wanxiang-static-<release>.tar.gz。
之后按 DEPLOYMENT.md 上传，并在服务器上用 deploy/update.py 原子切换。

Windows 上 git 的 core.autocrlf 会把文本文件检出成 CRLF，而线上（Linux）是 LF。
所以这里统一按 LF 计算 hash、也按 LF 打进包里，两处必须一致，否则 deploy/update.py
的 hash 断言会失败。key 用 posix 分隔符（Windows 的 str() 会给反斜杠）。"""
import datetime, hashlib, io, json, tarfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'site' / 'dist'
release = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')


def payload(p):
    """参与发布的内容：二进制原样，文本一律换成 LF。"""
    b = p.read_bytes()
    return b if b'\x00' in b else b.replace(b'\r\n', b'\n')


files, entries = {}, []
for p in sorted(DIST.rglob('*')):
    if p.is_file() and p.name != 'release.json' and not p.name.startswith('.'):
        name = p.relative_to(DIST).as_posix()
        data = payload(p)
        files[name] = hashlib.sha256(data).hexdigest()
        entries.append((name, data, p))

manifest = json.dumps({'release': release, 'files': files}, ensure_ascii=False, indent=1)
(DIST / 'release.json').write_text(manifest, encoding='utf-8')

out = ROOT / 'releases' / f'wanxiang-static-{release}.tar.gz'  # releases/ 不进 git
out.parent.mkdir(exist_ok=True)
with tarfile.open(out, 'w:gz') as tar:
    for name, data, p in entries:
        ti = tar.gettarinfo(str(p), arcname=name)
        ti.size = len(data)  # 文本按 LF 打进包，长度与磁盘上的 CRLF 版本不同
        tar.addfile(ti, io.BytesIO(data))
    mraw = manifest.encode('utf-8')
    ti = tar.gettarinfo(str(DIST / 'release.json'), arcname='release.json')
    ti.size = len(mraw)
    tar.addfile(ti, io.BytesIO(mraw))
print(json.dumps({'release': release, 'files': len(files), 'archive': out.name, 'bytes': out.stat().st_size}))