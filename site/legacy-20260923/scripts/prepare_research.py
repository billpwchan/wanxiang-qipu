"""Publish a traceable, structured edition of the two supplied research documents."""
import re,json,html,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'research/deep-s1-2026-09-23'
OUT=ROOT/'site/dist/data'
main=(SOURCE/'S1深度推演.md').read_text(); companion=(SOURCE/'全英雄取舍与关键天赋.md').read_text()
def inline(s):
 s=html.escape(s)
 s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',lambda m:'<a href="'+html.escape('data/hero-decisions.md' if m[2]=='全英雄取舍与关键天赋.md' else m[2],quote=True)+'" target="_blank" rel="noopener">'+m[1]+' ↗</a>' if m[2].startswith('https://') or m[2]=='全英雄取舍与关键天赋.md' else m[1],s)
 s=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',s)
 s=re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
 return s

def rows(s):return [[c.strip() for c in l.strip().strip('|').split('|')] for l in s.splitlines() if l.startswith('|') and not re.match(r'^\|[\s:|\-]+$',l)]
def markdown(s):
 lines=s.splitlines();out=[];i=0
 while i<len(lines):
  line=lines[i].strip()
  if not line:i+=1;continue
  if line.startswith('|'):
   block=[]
   while i<len(lines) and lines[i].strip().startswith('|'):block.append(lines[i].strip());i+=1
   rs=rows('\n'.join(block));heads=rs[0]
   out.append('<div class="research-table"><table><thead><tr>'+''.join('<th>'+inline(c)+'</th>' for c in heads)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td data-label="'+html.escape(heads[j] if j<len(heads) else '',quote=True)+'">'+inline(c)+'</td>' for j,c in enumerate(r))+'</tr>' for r in rs[1:])+'</tbody></table></div>');continue
  h=re.match(r'^(#{1,5}) (.+)$',line)
  if h:out.append(f'<h{min(5,len(h[1]))}>'+inline(h[2])+f'</h{min(5,len(h[1]))}>');i+=1;continue
  if re.match(r'^(\d+\. |[-*] )',line):
   ordered=bool(re.match(r'^\d+\.',line));tag='ol' if ordered else 'ul';lis=[]
   while i<len(lines) and re.match(r'^(\d+\. |[-*] )',lines[i].strip()):lis.append('<li>'+inline(re.sub(r'^(\d+\. |[-*] )','',lines[i].strip()))+'</li>');i+=1
   out.append('<'+tag+'>'+''.join(lis)+'</'+tag+'>');continue
  paragraph=[line];i+=1
  while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||\d+\. |[-*] )',lines[i].strip()):paragraph.append(lines[i].strip());i+=1
  out.append('<p>'+inline(' '.join(paragraph))+'</p>')
 return '\n'.join(out)
parts=re.split(r'^## (\d+)\. (.+)$',main,flags=re.M)
sections=[]
for i in range(1,len(parts),3):
 n=int(parts[i]);body=parts[i+2];rounds=[]
 for r in rows(body):
  if re.match(r'^R\d',r[0]):rounds.append({'label':r[0],'action':r[1],'fallback':r[2]})
 prose=re.sub(r'### 逐回合决策\s*\n(?:\|[^\n]*\n)+','',body)
 sections.append({'id':n,'title':parts[i+1],'html':markdown(body),'prose':markdown(prose),'rounds':rounds})
heroAdvice={}
for r in rows(companion):
 m=re.match(r'^(.+) / ([1-5])$',r[0])
 if m:heroAdvice[m[1]]={'tier':int(m[2]),'buy':r[1],'keep':r[2],'exit':r[3]}
def chapter(n):
 m=re.search(r'^## '+str(n)+r'\..+?\n(.*?)(?=^## |\Z)',companion,re.M|re.S);return rows(m[1])[1:]
assert len(heroAdvice)==85
cards=json.loads((OUT/'cards.json').read_text());assert set(heroAdvice)=={c['name'] for c in cards['heroes']}
for s in sections:
 if 5<=s['id']<=13:assert len(s['rounds'])==16,(s['id'],len(s['rounds']))
data={'meta':{'date':'2026-09-23','documents':[{'name':'S1深度推演.md','sha256':hashlib.sha256(main.encode()).hexdigest(),'download':'data/deep-research.md'},{'name':'全英雄取舍与关键天赋.md','sha256':hashlib.sha256(companion.encode()).hexdigest(),'download':'data/hero-decisions.md'}]},'sections':sections,'heroAdvice':heroAdvice,'specialUnits':chapter(7),'talentAdvice':chapter(8),'effectAdvice':chapter(9)}
(OUT/'research.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
(OUT/'deep-research.md').write_text(main);(OUT/'hero-decisions.md').write_text(companion)
print(json.dumps({'sections':len(sections),'heroes':len(heroAdvice),'rounds':sum(len(s['rounds']) for s in sections),'talentGroups':len(data['talentAdvice']),'effects':len(data['effectAdvice'])}))
