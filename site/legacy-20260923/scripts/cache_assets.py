"""Create a versioned, same-origin copy of the public card artwork used by this site."""
import concurrent.futures, hashlib, json, time, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'site/dist/assets/cards'; DEST.mkdir(parents=True,exist_ok=True)
DATA=ROOT/'site/dist/data/cards.json'
d=json.loads(DATA.read_text()); jobs={}
def collect(x):
 if isinstance(x,dict):
  for key in ('thumb','image'):
   url=x.get(key+'Original') or x.get(key,'')
   if url.startswith('https://game-os-cos.kohsocialapp.qq.com/'):
    x[key+'Original']=url; jobs[url]=hashlib.sha256(url.encode()).hexdigest()[:24]+'.png'
  for v in x.values():collect(v)
 elif isinstance(x,list):
  for v in x:collect(v)
collect(d)
def fetch(item):
 url,name=item; p=DEST/name
 if p.exists() and p.stat().st_size>100:return url,name,p.stat().st_size,None
 for attempt in range(3):
  try:
   req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://wxq.qq.com/'})
   with urllib.request.urlopen(req,timeout=25) as r:b=r.read(12*1024*1024)
   if not (b.startswith(b'\x89PNG') or b.startswith(b'\xff\xd8') or b[:4]==b'RIFF'):raise ValueError('not an image')
   p.write_bytes(b);return url,name,len(b),None
  except Exception as e:
   error=str(e);time.sleep(.25*(attempt+1))
 return url,name,0,error
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for row in pool.map(fetch,jobs.items()):
  results.append(row)
  if len(results)%100==0:print(f'{len(results)}/{len(jobs)} assets checked',flush=True)
lookup={u:'assets/cards/'+name for u,name,size,err in results if not err}
def rewrite(x):
 if isinstance(x,dict):
  for k in ('thumb','image'):
   if x.get(k+'Original') in lookup:x[k]=lookup[x[k+'Original']]
  for v in x.values():rewrite(v)
 elif isinstance(x,list):
  for v in x:rewrite(v)
rewrite(d);DATA.write_text(json.dumps(d,ensure_ascii=False,indent=2))
manifest={'source':'Tencent public card assets','fetchedAt':'2026-09-23','files':[{'url':u,'path':'assets/cards/'+n,'bytes':size,'error':err} for u,n,size,err in results]}
(ROOT/'research/asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps({'assets':len(results),'bytes':sum(r[2] for r in results),'failed':[{'url':u,'error':e} for u,n,s,e in results if e]},ensure_ascii=False),flush=True)
if any(r[3] for r in results):raise SystemExit(1)
