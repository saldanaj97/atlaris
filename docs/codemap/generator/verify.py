#!/usr/bin/env python3
"""Independent verification of docs/codemap/*. Usage: python3 verify.py [DIR]"""
import os, re, sys, json, hashlib, subprocess, html
REPO=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','..')); os.chdir(REPO)
D = sys.argv[1] if len(sys.argv)>1 else 'docs/codemap'
fails=[]; notes=[]
def fail(m): fails.append(m)
def sh(*a): return subprocess.check_output(a,text=True).strip()
def rd(p): return open(p,encoding='utf-8',errors='replace').read()
res={}
# 1 parse
try:
    data=json.load(open(f'{D}/codemap.json')); res['codemap.json parses']=True
except Exception as e:
    print('FAIL parse json',e); sys.exit(1)
try:
    lock=json.load(open(f'{D}/codemap.lock')); res['codemap.lock parses']=True
except Exception as e:
    print('FAIL parse lock',e); sys.exit(1)
if list(data.keys())!=['generated_at','generated_from_commit','scope','nodes','edges','flows','mismatches']: fail('top-level keys/order differ from spec: %s'%list(data.keys()))
nodes={n['id']:n for n in data['nodes']}
if len(nodes)>20: fail('more than 20 nodes')
if len(nodes)!=len(data['nodes']): fail('duplicate node ids')
def ev_ok(e,ctx):
    p,s=e.get('path'),e.get('symbol')
    if not p or not s: fail(f'{ctx}: evidence missing path/symbol {e}'); return
    if not os.path.isfile(p): fail(f'{ctx}: evidence path missing {p}'); return
    if s not in rd(p): fail(f'{ctx}: symbol {s!r} not in {p}')
nsym=0
for n in data['nodes']:
    for k in ('id','path','role','entrypoints','tests','constraints','evidence','aliases'):
        if k not in n: fail(f"node {n.get('id')} missing {k}")
    if not os.path.exists(n['path']): fail(f"node {n['id']} path missing {n['path']}")
    for p in n['paths']:
        if not os.path.exists(p): fail(f"node {n['id']} paths entry missing {p}")
    if not n['evidence']: fail(f"node {n['id']} has no evidence")
    for e in n['evidence']+n['entrypoints']: ev_ok(e,'node '+n['id']); nsym+=1
    for c in n['constraints']: ev_ok(c['source'],'constraint '+n['id']); nsym+=1
    for t in n['tests']:
        if not os.path.exists(t['path']): fail(f"node {n['id']} test path missing {t['path']}")
    for a in n['aliases']:
        src=a['source']
        if 'path' in src:
            ok=os.path.isfile(src['path']) and a['word'].lower() in rd(src['path']).lower()
        else:
            try: subj=sh('git','log','-1','--format=%s',src['commit'])
            except Exception: subj=''
            ok=a['word'].lower() in subj.lower()
        if ok and a['status']!='found': fail(f"alias {n['id']}:{a['word']} found but marked {a['status']}")
        if not ok and a['status']!='unknown': fail(f"alias {n['id']}:{a['word']} NOT in source but marked {a['status']}")
# 3 edges
ALLOWED={'imports','calls','reads','writes','publishes','subscribes'}
eids=set(); eby={}
for e in data['edges']:
    for k in ('from','to','type','evidence'):
        if k not in e: fail(f'edge missing {k}: {e}')
    if e['type'] not in ALLOWED: fail(f"bad edge type {e['type']}")
    if e['from'] not in nodes or e['to'] not in nodes: fail(f"edge endpoint missing {e['from']}>{e['to']}")
    if not e['evidence'] and e.get('status')!='unknown': fail(f"edge {e.get('id')} has no evidence but is not unknown")
    if e['evidence'] and e.get('status')=='unknown': fail(f"edge {e.get('id')} has evidence but marked unknown")
    for ev in e['evidence']: ev_ok(ev,'edge '+e['id']); nsym+=1
    if e['id'] in eids: fail('dup edge id '+e['id'])
    eids.add(e['id']); eby[e['id']]=e
# 4 flows
if not (3<=len(data['flows'])<=5): fail('flows must be 3-5')
for f in data['flows']:
    for k in ('trigger','steps','outcome'):
        if k not in f: fail(f"flow {f.get('id')} missing {k}")
    seen=set()
    for s in f['steps']:
        if s['node'] not in nodes: fail(f"flow {f['id']} step node {s['node']} missing")
        for ev in s['evidence']: ev_ok(ev,f"flow {f['id']} step {s['n']}"); nsym+=1
        if s['via']:
            e=eby.get(s['via'])
            if not e: fail(f"flow {f['id']} step {s['n']} via {s['via']} not an edge")
            else:
                other = e['from'] if e['to']==s['node'] else e['to'] if e['from']==s['node'] else None
                if other is None or other not in seen: fail(f"flow {f['id']} step {s['n']} via {s['via']} does not connect {s['node']} to an earlier step")
        elif s['n']!=1 and not s['via']:
            notes.append(f"flow {f['id']} step {s['n']} has no via edge (annotation only)")
        seen.add(s['node'])
# 5 mismatches
red=set()
for n in data['nodes']:
    for a in n['aliases']:
        if a['status']=='found' and a['match'] is False: red.add((n['id'],a['word']))
mw={m['word'] for m in data['mismatches']}
for m in data['mismatches']:
    for k in ('word','code_name','path','change'):
        if not m.get(k): fail(f"mismatch missing {k}: {m}")
    if m['change'] not in ('word','code_name'): fail('bad change '+m['change'])
    if not os.path.exists(m['path']): fail('mismatch path missing '+m['path'])
    for ev in m.get('our_word_sources',[])+m.get('code_evidence',[]): ev_ok(ev,'mismatch '+m['word']); nsym+=1
    for nid in m.get('nodes',[]):
        if nid not in nodes: fail('mismatch node missing '+nid)
for nid,w in red:
    if not any({'node':nid,'alias':w} in m.get('covers',[]) for m in data['mismatches']): fail(f'red alias {nid}:{w} has no mismatch entry')
# 6 html
h=rd(f'{D}/codemap.html')
m=re.search(r'<script id="codemap-data" type="application/json">(.*?)</script>',h,re.S)
if not m: fail('html has no embedded codemap data')
else:
    emb=json.loads(m.group(1).replace('<\\/','</'))
    if emb!=data: fail('html embedded data != codemap.json')
    for k in ('nodes','edges','flows'):
        if emb[k]!=data[k]: fail('html/json differ in '+k)
for bad in ('src="http','href="http','@import','url(http','fetch(','XMLHttpRequest'):
    if bad in h: fail('html is not self-contained: found '+bad)
if data['generated_at'] not in h or data['generated_from_commit'][:7] not in h: fail('html header missing generated_at/commit')
# 7 lock
head=sh('git','rev-parse','HEAD')
if lock['commit']!=data['generated_from_commit']: fail('lock commit != json commit')
if lock['generated_at']!=data['generated_at']: fail('lock generated_at != json')
if lock['commit']!=head:
    # allow: codemap committed on top of the generated commit and nothing else changed
    chg=sh('git','diff','--name-only',lock['commit'],'HEAD').splitlines()
    other=[c for c in chg if not c.startswith('docs/codemap/')]
    if other: fail('HEAD moved and files outside docs/codemap changed: %s'%other[:5])
    else: notes.append('HEAD is a docs/codemap-only commit on top of the lock commit')
por=sh('git','status','--porcelain','--','.',':!docs/codemap')
dirty=bool(por)
if dirty!=lock['working_tree_dirty']: fail(f'lock working_tree_dirty={lock["working_tree_dirty"]} but actual {dirty}')
excl=lock['excluded_directories']; BARE={'node_modules','dist','build','coverage'}
def excluded(p): return any(s in BARE for s in p.split('/')) or any(p==e or p.startswith(e+'/') for e in excl)
tracked=[p for p in sh('git','ls-files').splitlines() if not excluded(p) and os.path.isfile(p)]
def fp(files):
    return hashlib.sha256(''.join('%s\0%s\n'%(p,hashlib.sha256(open(p,'rb').read()).hexdigest()) for p in sorted(files)).encode()).hexdigest()
for nid,mod in lock['modules'].items():
    files=[p for p in tracked if any(p==x or p.startswith(x+'/') for x in mod['paths'])]
    if fp(files)!=mod['fingerprint']: fail('fingerprint mismatch '+nid)
    if len(files)!=mod['file_count']: fail('file_count mismatch '+nid)
if set(lock['modules'])!=set(nodes): fail('lock modules != nodes')
res['_summary']=dict(symbols_checked=nsym,nodes=len(nodes),edges=len(data['edges']),flows=len(data['flows']),mismatches=len(data['mismatches']),red_aliases=len(red),unknown_aliases=sum(1 for n in data['nodes'] for a in n['aliases'] if a['status']=='unknown'),unknown_edges=sum(1 for e in data['edges'] if e.get('status')=='unknown'))
print(json.dumps(res['_summary']))
for n in notes: print('note:',n)
if fails:
    print('FAILURES (%d):'%len(fails))
    for f in fails: print(' -',f)
    sys.exit(1)
print('ALL CHECKS PASSED')
