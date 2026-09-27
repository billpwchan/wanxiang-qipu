"""Run over authorized SSH: sudo python3 - <release-id> <uploaded-archive>.

Updates only /opt/wanxiang/current. No container restart or gateway reload.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile

release, archive = sys.argv[1:]
assert re.fullmatch(r"\d{8}-\d{6}", release)
base = Path('/opt/wanxiang')
current = base / 'current'
assert current.is_symlink()
previous = os.readlink(current)
assert re.fullmatch(r'releases/\d{8}-\d{6}', previous)
destination = base / 'releases' / release
assert not destination.exists(), 'Release already exists; do not overwrite'
audit = base / 'deploy' / ('update-' + release)
audit.mkdir()

def command(*args):
    return subprocess.check_output(args, text=True).strip()

def containers():
    ids = command('docker', 'ps', '-aq').split()
    rows = command('docker', 'inspect', '--format',
        '{{.Name}} {{.Id}} {{.State.Status}} {{.RestartCount}} {{.State.StartedAt}}', *ids)
    return '\n'.join(sorted(rows.splitlines())) + '\n'

def fragments():
    return command('docker', 'exec', 'jchart-shared-gateway', 'sh', '-c',
        'sha256sum /config/sites-enabled/*') + '\n'

before_containers, before_config = containers(), fragments()
(audit / 'before-containers.txt').write_text(before_containers)
(audit / 'before-config.sha256').write_text(before_config)
(audit / 'previous.txt').write_text(previous + '\n')
destination.mkdir(mode=0o755)
with tarfile.open(archive) as bundle:
    for member in bundle.getmembers():
        assert not member.issym() and not member.islnk()
        assert member.isfile() or member.isdir()
        target = (destination / member.name).resolve()
        assert target == destination or destination in target.parents
    bundle.extractall(destination)

manifest = json.loads((destination / 'release.json').read_text())
assert manifest['release'] == release
for name, digest in manifest['files'].items():
    path = (destination / name).resolve()
    assert destination in path.parents and path.is_file()
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, name
for path in destination.rglob('*'):
    path.chmod(0o755 if path.is_dir() else 0o644)

def switch(target):
    temporary = base / ('next-' + release)
    temporary.symlink_to(target)
    os.replace(temporary, current)

switch('releases/' + release)
try:
    assert command('docker', 'exec', 'jchart-shared-gateway', 'wget', '-qO-',
        'http://wanxiang-guide:8080/healthz') == 'ok'
    served = command('docker', 'exec', 'jchart-shared-gateway', 'wget', '-qO-',
        'http://wanxiang-guide:8080/release.json')
    assert json.loads(served)['release'] == release
    after_containers, after_config = containers(), fragments()
    (audit / 'after-containers.txt').write_text(after_containers)
    (audit / 'after-config.sha256').write_text(after_config)
    assert after_containers == before_containers, 'Container baseline changed'
    assert after_config == before_config, 'Gateway fragment baseline changed'
except Exception:
    switch(previous)
    raise

print(json.dumps({'release': release, 'previous': previous,
    'verifiedFiles': len(manifest['files']), 'health': 'ok',
    'containersUnchanged': True, 'gatewayFragmentsUnchanged': True}))
