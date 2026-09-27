import hashlib, json, subprocess
from pathlib import Path
base=Path('/opt/wanxiang')
manifest=json.loads((base/'current/release.json').read_text())
failed=[]
for name,expected in manifest['files'].items():
 p=base/'current'/name
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=expected:failed.append(name)
assert not failed,failed
print('Release',manifest['release'],'files checked:',len(manifest['files']))
containers=json.loads(subprocess.check_output(['docker','inspect',*subprocess.check_output(['docker','ps','-q'],text=True).split()]))
print(json.dumps([{'name':c['Name'],'status':c['State']['Status'],'health':c['State'].get('Health',{}).get('Status','not configured'),'restarts':c['RestartCount']} for c in containers],ensure_ascii=False))
baseline=(base/'deploy/before-containers.txt').read_text()
current='\n'.join(sorted(f"{c['Name']} {c['State']['Status']} {c['RestartCount']} {c['State']['StartedAt']}" for c in containers if c['Name']!='/wanxiang-guide'))+'\n'
assert current==baseline,'Existing container state changed'
subprocess.run(['docker','exec','-i','jchart-shared-gateway','sha256sum','-c','-'],input=(base/'deploy/before-config.sha256').read_bytes(),check=True)
subprocess.run(['docker','stats','--no-stream','--format','{{.Name}} {{.MemUsage}} {{.CPUPerc}}','wanxiang-guide'],check=True)
print('Existing containers and configurations match baseline.')
