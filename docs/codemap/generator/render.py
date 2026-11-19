import json, subprocess, re

def repo_name():
    try:
        url = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], text=True).strip()
        m = re.search(r'github\.com[/:]([^/]+/[^/.]+)', url)
        if m: return m.group(1)
    except Exception:
        pass
    return 'atlaris'

TEMPLATE = r'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Codemap __REPO__</title>
<style>
:root{--bg:#0d1117;--panel:#151b23;--panel2:#1b232d;--line:#2a3441;--text:#e6edf3;--muted:#8b98a9;--accent:#5b9dff;--red:#ff6b6b;--ok:#4ade80;--shadow:0 4px 16px rgba(0,0,0,.4);
--k-module:#5b9dff;--k-service:#22d3ee;--k-database:#4ade80;--k-queue:#c084fc;--k-external:#f472b6;
--e-imports:#64748b;--e-calls:#9fb4d6;--e-reads:#4ade80;--e-writes:#fb923c;--e-publishes:#c084fc;--e-subscribes:#e879f9;--flow:#facc15;}
:root[data-theme=light]{--bg:#f6f8fa;--panel:#fff;--panel2:#eef2f6;--line:#d0d7de;--text:#1f2328;--muted:#59636e;--accent:#0969da;--red:#d1242f;--ok:#1a7f37;--shadow:0 4px 16px rgba(0,0,0,.12);
--k-module:#0969da;--k-service:#0b7285;--k-database:#1a7f37;--k-queue:#8250df;--k-external:#bf3989;
--e-imports:#8c959f;--e-calls:#57606a;--e-reads:#1a7f37;--e-writes:#bc4c00;--e-publishes:#8250df;--e-subscribes:#bf3989;--flow:#b08800;}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font:13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
button,input,select{font:inherit;color:inherit}
header{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--line);background:var(--panel)}
header h1{font-size:15px;margin:0;font-weight:650}
header .meta{color:var(--muted);font-size:12px}
header .meta b{color:var(--text);font-weight:600}
header .sp{flex:1}
.btn{background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:4px 9px;cursor:pointer}
.btn:hover{border-color:var(--accent)}
.btn[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}
main{display:grid;grid-template-columns:260px minmax(0,1fr) 380px;height:calc(100% - 46px)}
aside{overflow:auto;background:var(--panel);padding:10px 12px}
#left{border-right:1px solid var(--line)}
#right{border-left:1px solid var(--line);padding:0}
h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:14px 0 6px}
h2:first-child{margin-top:2px}
input[type=search]{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 8px}
.flow{display:block;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:7px 9px;margin:0 0 6px;cursor:pointer}
.flow[aria-pressed=true]{border-color:var(--flow);box-shadow:0 0 0 1px var(--flow) inset}
.flow .t{font-weight:600}
.flow .s{color:var(--muted);font-size:11.5px}
.flow.hl{border-color:var(--accent)}
.chk{display:flex;align-items:center;gap:7px;margin:3px 0;cursor:pointer}
.sw{width:11px;height:11px;border-radius:3px;display:inline-block;flex:none}
.ln{width:20px;height:0;border-top:2px solid;display:inline-block;flex:none}
.ln.dash{border-top-style:dashed}
#stage{position:relative;overflow:hidden;background:radial-gradient(circle at 1px 1px,var(--line) 1px,transparent 0) 0 0/24px 24px}
#svg{width:100%;height:100%;display:block;cursor:grab;touch-action:none}
#svg.panning{cursor:grabbing}
.tools{position:absolute;right:10px;top:10px;display:flex;gap:6px;z-index:2}
.hint{position:absolute;left:12px;bottom:8px;color:var(--muted);font-size:11.5px;pointer-events:none}
.region rect{fill:color-mix(in srgb,var(--panel) 55%,transparent);stroke:var(--line);stroke-width:1.5;stroke-dasharray:6 5}
.region text{fill:var(--muted);font-size:11px;letter-spacing:.07em;text-transform:uppercase;font-weight:600}
.node{cursor:pointer}
.node rect.box{fill:var(--panel2);stroke:var(--line);stroke-width:1.4}
.node .bar{opacity:.95}
.node text{pointer-events:none}
.node .lbl{font-size:14px;font-weight:650;fill:var(--text)}
.node .sub{font-size:10.5px;fill:var(--muted)}
.node .al{font-size:10.5px;fill:var(--muted)}
.node .al .bad{fill:var(--red);font-weight:700}
.node:focus{outline:none}
.node:focus rect.box,.node:hover rect.box{stroke:var(--accent)}
.node.sel rect.box{stroke:var(--accent);stroke-width:2.6}
.node.up rect.box{stroke:#7dd3fc;stroke-width:2.2}
.node.down rect.box{stroke:#fbbf24;stroke-width:2.2}
.node.step rect.box{stroke:var(--flow);stroke-width:2.2}
.node.match rect.box{stroke:var(--ok);stroke-width:2.2}
.node.dim,.edge.dim,.badge.dim{opacity:.24}
.edge path{fill:none;stroke-width:1.5}
.edge.hit{stroke-width:12;stroke:transparent;fill:none}
.edge.hl path.line{stroke-width:2.6}
.edge .hitp{stroke:transparent;stroke-width:12;fill:none;cursor:pointer}
.edge.t-imports path.line{stroke-dasharray:3 4;stroke-width:1}
.edge.t-subscribes path.line{stroke-dasharray:7 4}
.stepbadge circle{fill:var(--flow);stroke:var(--bg);stroke-width:1.5}
.stepbadge text{fill:#111;font-size:10px;font-weight:700;text-anchor:middle;dominant-baseline:central}
.tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:0 7px;font-size:11px;color:var(--muted);margin-right:4px}
.tabs{display:flex;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--panel);z-index:1}
.tabs button{flex:1;background:none;border:0;border-bottom:2px solid transparent;padding:9px 6px;cursor:pointer;color:var(--muted)}
.tabs button[aria-selected=true]{color:var(--text);border-bottom-color:var(--accent)}
.pane{padding:12px 14px}
.pane h3{margin:0 0 4px;font-size:16px}
.pane h4{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:14px 0 5px}
.kv{color:var(--muted);font-size:12px}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px}
.link{color:var(--accent);cursor:pointer;background:none;border:0;padding:0;text-align:left}
.link:hover{text-decoration:underline}
ul.l{margin:0;padding-left:0;list-style:none}
ul.l li{padding:3px 0;border-bottom:1px dashed var(--line)}
ul.l li:last-child{border-bottom:0}
.bad{color:var(--red);font-weight:650}
.ok{color:var(--ok)}
.unk{color:var(--muted);font-style:italic}
.pill{border-radius:4px;padding:0 6px;font-size:10.5px;font-weight:700;text-transform:uppercase}
.pill.high{background:var(--red);color:#111}
.pill.medium{background:#f59e0b;color:#111}
.pill.low{background:var(--line);color:var(--text)}
table.wv{width:100%;border-collapse:collapse;table-layout:fixed}
.pane,table.wv td{overflow-wrap:anywhere;word-break:break-word}
table.wv th:first-child{width:54%}
table.wv th{font-size:11px;color:var(--muted);text-align:left;font-weight:600;padding:4px 6px;border-bottom:1px solid var(--line)}
table.wv td{vertical-align:top;padding:7px 6px;border-bottom:1px solid var(--line)}
table.wv tr.row{cursor:pointer}
table.wv tr.row:hover{background:var(--panel2)}
.why{color:var(--muted);font-size:12px;margin-top:4px}
.fix{font-size:11px;color:var(--muted);margin-top:3px}
.legendnote{color:var(--muted);font-size:11.5px;margin-top:6px}
@media (max-width:1100px){main{grid-template-columns:1fr;grid-template-rows:auto 60vh auto;height:auto}#right{border-left:0;border-top:1px solid var(--line)}#left{border-right:0}}
</style>
</head>
<body>
<header>
  <h1>Codemap · __REPO__</h1>
  <span class="meta">Generated <b id="h-time"></b></span>
  <span class="meta">from commit <b class="mono" id="h-commit"></b></span>
  <span class="meta" id="h-counts"></span>
  <span class="sp"></span>
  <button class="btn" id="b-theme" aria-pressed="false" title="Toggle light/dark theme">Light theme</button>
</header>
<main>
  <aside id="left">
    <h2>Search</h2>
    <input id="q" type="search" placeholder="Module, path, alias, role…" aria-label="Search modules">
    <h2>End-to-end flows</h2>
    <div id="flows"></div>
    <h2>Module types</h2>
    <div id="kinds"></div>
    <h2>Edge types</h2>
    <div id="etypes"></div>
    <div class="legendnote">“imports” is mechanical (static import graph) and hidden by default. Other edge types are hand-evidenced.</div>
    <h2>Legend</h2>
    <div class="legendnote"><span class="bad">Red word</span> = a name we use that does not match the module's name in the code. <span class="tag" style="color:var(--flow);border-color:var(--flow)">3</span> = step number in the selected flow. Blue outline = upstream caller, amber = downstream dependency.</div>
  </aside>
  <section id="stage">
    <div class="tools">
      <button class="btn" id="z-in" title="Zoom in">+</button>
      <button class="btn" id="z-out" title="Zoom out">−</button>
      <button class="btn" id="z-fit" title="Fit to screen">Fit</button>
      <button class="btn" id="z-reset" title="Recompute automatic layout">Re-layout</button>
    </div>
    <svg id="svg" role="img" aria-label="Interactive code map"><defs id="defs"></defs><g id="vp"><g id="g-regions"></g><g id="g-edges"></g><g id="g-nodes"></g><g id="g-badges"></g></g></svg>
    <div class="hint">Drag background to pan · wheel to zoom · drag a module to move it · click a module, edge or flow · Esc clears</div>
  </section>
  <aside id="right">
    <div class="tabs" role="tablist"><button role="tab" id="t-words" aria-selected="true">Words vs names</button><button role="tab" id="t-mod" aria-selected="false">Module</button></div>
    <div class="pane" id="pane"></div>
  </aside>
</main>
<script id="codemap-data" type="application/json">__DATA__</script>
<script>
(function(){
'use strict';
const DATA = JSON.parse(document.getElementById('codemap-data').textContent);
const BOUNDARIES = __BOUNDARIES__;
const REPO = '__REPO__';
const KIND_LABEL = {module:'Module',service:'Service / Worker',database:'Database',queue:'Queue / Workflow',external:'External dependency'};
const ETYPES = ['calls','reads','writes','publishes','subscribes','imports'];
const MAXCOLS = {app:4, cf:2, data:2};
const NW=190, NH=72, GX=18, GY=32, PAD=22, HEAD=30, RGAP=44, RGAP_Y=56;
const $ = (s,r)=> (r||document).querySelector(s);
const SVGNS='http://www.w3.org/2000/svg';
function el(tag,attrs,parent){const e=document.createElementNS(SVGNS,tag);for(const k in (attrs||{}))e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e}
function h(tag,attrs,kids){const e=document.createElement(tag);for(const k in (attrs||{})){if(k==='class')e.className=attrs[k];else if(k==='text')e.textContent=attrs[k];else if(k.startsWith('on'))e.addEventListener(k.slice(2),attrs[k]);else e.setAttribute(k,attrs[k])}(kids||[]).forEach(c=>e.appendChild(typeof c==='string'?document.createTextNode(c):c));return e}
const nodes = new Map(DATA.nodes.map(n=>[n.id,n]));
const edges = DATA.edges;
const flows = DATA.flows;
const eById = new Map(edges.map(e=>[e.id,e]));
const flowsOf = new Map(DATA.nodes.map(n=>[n.id,flows.filter(f=>f.steps.some(s=>s.node===n.id))]));
const mismatchByNode = new Map(DATA.nodes.map(n=>[n.id,DATA.mismatches.filter(m=>m.nodes.includes(n.id))]));

// ---------- state ----------
const S = {sel:null, selEdge:null, flow:null, q:'', kinds:new Set(Object.keys(KIND_LABEL)), types:new Set(['calls','reads','writes','publishes','subscribes']), pos:{}, view:{x:0,y:0,k:1}, tab:'words'};

// ---------- header ----------
$('#h-time').textContent = DATA.generated_at;
$('#h-commit').textContent = DATA.generated_from_commit.slice(0,10);
$('#h-commit').title = DATA.generated_from_commit;
$('#h-counts').textContent = DATA.nodes.length+' nodes · '+edges.filter(e=>e.type!=='imports').length+' evidenced edges (+'+edges.filter(e=>e.type==='imports').length+' import edges) · '+flows.length+' flows · '+DATA.mismatches.length+' word mismatches';

// ---------- layout (layered by depth, width-capped rows, barycenter ordering, seeded restarts) ----------
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
// Regions sit on a 2-row grid: the Next.js app on top, Cloudflare and data/vendors side by side beneath it.
const GRID = {app:{r:0,c:0}, cf:{r:1,c:0}, data:{r:1,c:1}};
function layout(){
  const sem = edges.filter(e=>e.type!=='imports' && e.from!==e.to);
  const regs = BOUNDARIES.map(b=>({id:b.id,label:b.label,nodes:DATA.nodes.filter(n=>n.boundary===b.id).map(n=>n.id)}));
  const layerOf = {};
  regs.forEach(R=>{
    const ids=R.nodes, set=new Set(ids);
    const out={}, indeg={}, outdeg={}; ids.forEach(i=>{out[i]=[];indeg[i]=0;outdeg[i]=0});
    sem.forEach(e=>{ if(set.has(e.from)&&set.has(e.to)&&!out[e.from].includes(e.to)){ out[e.from].push(e.to); indeg[e.to]++; outdeg[e.from]++; } });
    const connected=new Set(); ids.forEach(i=>{ if(indeg[i]||outdeg[i]) connected.add(i); });
    let roots=ids.filter(i=>connected.has(i)&&!indeg[i]).sort();
    if(!roots.length && connected.size) roots=[Array.from(connected).sort((a,b)=>(indeg[a]-outdeg[a])-(indeg[b]-outdeg[b])||a.localeCompare(b))[0]];
    const depth={}; let q=roots.slice(); roots.forEach(r=>depth[r]=0);
    while(q.length){ const u=q.shift(); out[u].slice().sort().forEach(v=>{ if(depth[v]===undefined){ depth[v]=depth[u]+1; q.push(v); } }); }
    const maxD=Math.max(0,...Object.values(depth));
    ids.forEach(i=>{ layerOf[i]= depth[i]!==undefined ? depth[i] : (connected.size? maxD+1 : 0); });
  });
  const nbrs={}; DATA.nodes.forEach(n=>nbrs[n.id]=[]);
  sem.forEach(e=>{nbrs[e.from].push(e.to); nbrs[e.to].push(e.from);});
  function build(O){
    const pos={}, geom={};
    regs.forEach(R=>{
      const L=O[R.id]; const layers=Object.keys(L).map(Number).sort((a,b)=>a-b);
      const rows=[]; layers.forEach(l=>{ const arr=L[l]; for(let i=0;i<arr.length;i+=MAXCOLS[R.id]) rows.push(arr.slice(i,i+MAXCOLS[R.id])); });
      const cols=Math.max(1,...rows.map(r=>r.length));
      const w=cols*NW+(cols-1)*GX+2*PAD, hgt=HEAD+PAD+rows.length*NH+(rows.length-1)*GY+PAD;
      geom[R.id]={w:w,h:hgt,rows:rows};
    });
    const appW=geom.app.w, row2W=geom.cf.w+RGAP+geom.data.w, totalW=Math.max(appW,row2W);
    const org={ app:{x:(totalW-appW)/2,y:0}, cf:{x:(totalW-row2W)/2,y:geom.app.h+RGAP_Y}, data:{x:(totalW-row2W)/2+geom.cf.w+RGAP,y:geom.app.h+RGAP_Y} };
    regs.forEach(R=>{ const g=geom[R.id], o=org[R.id];
      g.rows.forEach((r,ri)=>{ const rw=r.length*NW+(r.length-1)*GX; const sx=o.x+(g.w-rw)/2; r.forEach((id,ci)=>{ pos[id]={x:sx+ci*(NW+GX), y:o.y+HEAD+PAD+ri*(NH+GY)}; }); });
    });
    return {pos,geom};
  }
  function cross(pos){
    const segs=sem.map(e=>({a:e.from,b:e.to,p:[pos[e.from].x+NW/2,pos[e.from].y+NH/2],q:[pos[e.to].x+NW/2,pos[e.to].y+NH/2]}));
    function ccw(A,B,C){return (C[1]-A[1])*(B[0]-A[0])-(B[1]-A[1])*(C[0]-A[0])}
    let c=0;
    for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){const s=segs[i],t=segs[j];
      if(s.a===t.a||s.a===t.b||s.b===t.a||s.b===t.b) continue;
      if((ccw(s.p,t.p,t.q)>0)!==(ccw(s.q,t.p,t.q)>0) && (ccw(s.p,s.q,t.p)>0)!==(ccw(s.p,s.q,t.q)>0)) c++; }
    return c;
  }
  const rand=rng(20260506);
  let best=null;
  for(let restart=0; restart<200; restart++){
    const O={};
    regs.forEach(R=>{ O[R.id]={}; R.nodes.slice().sort().forEach(id=>{(O[R.id][layerOf[id]]=O[R.id][layerOf[id]]||[]).push(id)}); if(restart>0) Object.values(O[R.id]).forEach(a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}}); });
    let cur=build(O);
    for(let sweep=0; sweep<12; sweep++){
      regs.forEach(R=>{ Object.keys(O[R.id]).forEach(l=>{
        const arr=O[R.id][l]; if(arr.length<2) return;
        const bc={}; arr.forEach(id=>{ const ns=nbrs[id]; if(!ns.length){bc[id]=cur.pos[id].x;return} bc[id]=ns.reduce((s,n)=>s+cur.pos[n].x+NW/2,0)/ns.length; });
        arr.sort((a,b)=>bc[a]-bc[b]||a.localeCompare(b));
      }); });
      cur=build(O);
    }
    const sc=cross(cur.pos);
    let len=0; sem.forEach(e=>{len+=Math.hypot(cur.pos[e.from].x-cur.pos[e.to].x,cur.pos[e.from].y-cur.pos[e.to].y)});
    const score=sc*10000+len;
    if(!best||score<best.score) best={score,cross:sc,pos:cur.pos,geom:cur.geom};
  }
  return best;
}
const L0 = layout();
S.pos = JSON.parse(JSON.stringify(L0.pos));
$('#h-counts').textContent += ' · layout crossings: '+L0.cross;

// ---------- svg setup ----------
const svg=$('#svg'), vp=$('#vp'), gR=$('#g-regions'), gE=$('#g-edges'), gN=$('#g-nodes'), gB=$('#g-badges'), defs=$('#defs');
function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
ETYPES.forEach(t=>{ const m=el('marker',{id:'ar-'+t,viewBox:'0 0 10 10',refX:'9',refY:'5',markerWidth:'7',markerHeight:'7',orient:'auto-start-reverse'},defs); el('path',{d:'M0,0 L10,5 L0,10 z',fill:'var(--e-'+t+')'},m); });
{ const m=el('marker',{id:'ar-flow',viewBox:'0 0 10 10',refX:'9',refY:'5',markerWidth:'8',markerHeight:'8',orient:'auto-start-reverse'},defs); el('path',{d:'M0,0 L10,5 L0,10 z',fill:'var(--flow)'},m); }

function visibleNode(n){return S.kinds.has(n.kind)}
function visibleEdge(e){ if(!S.types.has(e.type)) return false; return visibleNode(nodes.get(e.from))&&visibleNode(nodes.get(e.to)); }
function nodeText(n){return (n.id+' '+n.label+' '+n.path+' '+n.role+' '+n.aliases.map(a=>a.word).join(' ')+' '+n.code_names.join(' ')).toLowerCase()}

function activeSets(){
  const A={nodes:new Map(), edges:new Set(), steps:new Map(), flowEdges:new Set(), mode:'none'};
  if(S.flow){
    const f=flows.find(x=>x.id===S.flow); A.mode='flow';
    f.steps.forEach(s=>{ A.nodes.set(s.node,'step'); (A.steps.get(s.node)||A.steps.set(s.node,[]).get(s.node)).push(s.n); if(s.via){A.edges.add(s.via);A.flowEdges.add(s.via)} });
  } else if(S.sel){
    A.mode='node'; A.nodes.set(S.sel,'sel');
    edges.forEach(e=>{ if(!visibleEdge(e)) return;
      if(e.to===S.sel&&e.from!==S.sel){ A.edges.add(e.id); if(!A.nodes.has(e.from)) A.nodes.set(e.from,'up'); }
      if(e.from===S.sel&&e.to!==S.sel){ A.edges.add(e.id); if(!A.nodes.has(e.to)) A.nodes.set(e.to,'down'); else if(A.nodes.get(e.to)==='up') A.nodes.set(e.to,'both'); }
    });
  } else if(S.selEdge){
    const e=eById.get(S.selEdge); A.mode='edge'; A.edges.add(e.id); A.nodes.set(e.from,'up'); A.nodes.set(e.to,'down');
  }
  return A;
}

function portPoint(p,side,off){ const x=p.x,y=p.y; if(side==='r') return [x+NW,y+NH/2+off]; if(side==='l') return [x,y+NH/2+off]; if(side==='b') return [x+NW/2+off,y+NH]; return [x+NW/2+off,y]; }
function pathFor(e,off){
  const a=S.pos[e.from], b=S.pos[e.to];
  const ca=[a.x+NW/2,a.y+NH/2], cb=[b.x+NW/2,b.y+NH/2];
  const dx=cb[0]-ca[0], dy=cb[1]-ca[1];
  if(Math.abs(dy)<NH*0.6 && Math.abs(dx)>NW+GX*2){
    const lift=46+Math.abs(off)*2, p=[ca[0]+off,a.y], q=[cb[0]+off,b.y];
    return {d:'M'+p[0]+','+p[1]+' C'+p[0]+','+(p[1]-lift)+' '+q[0]+','+(q[1]-lift)+' '+q[0]+','+q[1], mid:[(p[0]+q[0])/2,p[1]-lift*0.75]};
  }
  let sa,sb;
  if(Math.abs(dy)<NH*0.6 || Math.abs(dx)/(NW+GX) > Math.abs(dy)/(NH+GY)*1.6){ sa=dx>0?'r':'l'; sb=dx>0?'l':'r'; } else { sa=dy>0?'b':'t'; sb=dy>0?'t':'b'; }
  const p=portPoint(a,sa,off), q=portPoint(b,sb,off);
  const d=Math.max(28,Math.hypot(q[0]-p[0],q[1]-p[1])*0.4);
  const v={r:[1,0],l:[-1,0],b:[0,1],t:[0,-1]};
  const c1=[p[0]+v[sa][0]*d,p[1]+v[sa][1]*d], c2=[q[0]+v[sb][0]*d,q[1]+v[sb][1]*d];
  return {d:'M'+p[0]+','+p[1]+' C'+c1[0]+','+c1[1]+' '+c2[0]+','+c2[1]+' '+q[0]+','+q[1], mid:[(p[0]+3*c1[0]+3*c2[0]+q[0])/8,(p[1]+3*c1[1]+3*c2[1]+q[1])/8]};
}

function aliasLine(n){
  const found=n.aliases.filter(a=>a.status==='found');
  const uniq=[]; found.forEach(a=>{ if(!uniq.some(u=>u.word.toLowerCase()===a.word.toLowerCase())) uniq.push(a); });
  const sorted=uniq.slice().sort((a,b)=>(a.match===false?-1:1)-(b.match===false?-1:1));
  return sorted;
}

function render(){
  const A=activeSets(); const q=S.q.trim().toLowerCase();
  gR.textContent=''; gE.textContent=''; gN.textContent=''; gB.textContent='';
  // regions
  BOUNDARIES.forEach(b=>{
    const ids=DATA.nodes.filter(n=>n.boundary===b.id&&visibleNode(n)).map(n=>n.id); if(!ids.length) return;
    const xs=ids.map(i=>S.pos[i].x), ys=ids.map(i=>S.pos[i].y);
    const x0=Math.min(...xs)-PAD, y0=Math.min(...ys)-PAD-HEAD+6, x1=Math.max(...xs)+NW+PAD, y1=Math.max(...ys)+NH+PAD;
    const g=el('g',{class:'region'},gR); el('rect',{x:x0,y:y0,width:x1-x0,height:y1-y0,rx:14},g);
    const t=el('text',{x:x0+14,y:y0+20},g); t.textContent=b.label;
  });
  // edges (parallel offsets among visible)
  const vis=edges.filter(visibleEdge); const grp={};
  vis.forEach(e=>{ const k=[e.from,e.to].sort().join('|'); (grp[k]=grp[k]||[]).push(e); });
  const dimAll = A.mode!=='none';
  vis.forEach(e=>{
    const k=[e.from,e.to].sort().join('|'); const list=grp[k]; const i=list.indexOf(e); const off=(i-(list.length-1)/2)*11;
    const P=pathFor(e,off);
    const on=A.edges.has(e.id);
    const isFlow=A.flowEdges.has(e.id);
    const g=el('g',{class:'edge t-'+e.type+(on?' hl':'')+(dimAll&&!on?' dim':''),'data-id':e.id},gE);
    el('path',{class:'line',d:P.d,stroke:isFlow?'var(--flow)':'var(--e-'+e.type+')','marker-end':'url(#ar-'+(isFlow?'flow':e.type)+')',opacity:dimAll&&!on?'':(e.type==='imports'?'.55':'.9')},g);
    const hp=el('path',{class:'hitp',d:P.d},g);
    const tt=el('title',{},g); tt.textContent=e.from+' → '+e.to+' ['+e.type+']\n'+(e.note?e.note+'\n':'')+e.evidence.map(v=>v.path+' :: '+v.symbol).join('\n');
    hp.addEventListener('click',ev=>{ev.stopPropagation();S.selEdge=e.id;S.sel=null;S.flow=null;setTab('mod');render();});
    e._mid=P.mid;
  });
  // nodes
  DATA.nodes.forEach(n=>{
    if(!visibleNode(n)) return;
    const p=S.pos[n.id]; const role=A.nodes.get(n.id);
    let cls='node'; if(role==='sel')cls+=' sel'; else if(role==='up')cls+=' up'; else if(role==='down')cls+=' down'; else if(role==='both')cls+=' up down'; else if(role==='step')cls+=' step';
    const matches=q&&nodeText(n).includes(q); if(matches) cls+=' match';
    if(dimAll&&!role) cls+=' dim'; else if(q&&!matches&&!dimAll) cls+=' dim';
    const g=el('g',{class:cls,transform:'translate('+p.x+','+p.y+')',tabindex:'0','data-id':n.id,role:'button','aria-label':n.label+', '+KIND_LABEL[n.kind]},gN);
    el('rect',{class:'box',width:NW,height:NH,rx:9},g);
    el('rect',{class:'bar',x:0,y:0,width:6,height:NH,rx:3,fill:'var(--k-'+n.kind+')'},g);
    const t1=el('text',{class:'lbl',x:15,y:20},g); t1.textContent=n.label.length>24?n.label.slice(0,23)+'…':n.label;
    const t2=el('text',{class:'sub',x:15,y:36},g); t2.textContent=KIND_LABEL[n.kind]+' · '+(n.path.length>20?'…'+n.path.slice(-19):n.path);
    const t3=el('text',{class:'al',x:15,y:50},g); const als=aliasLine(n); let used=0; const budget=30; let shown=0;
    const lead=el('tspan',{},t3); lead.textContent='aka ';
    for(const a of als){ const w=a.word; if(used+w.length>budget && shown>0) break; const ts=el('tspan',{class:a.match===false?'bad':''},t3); ts.textContent=(shown?' · ':'')+w; used+=w.length+3; shown++; }
    if(als.length>shown){ const ts=el('tspan',{},t3); ts.textContent=' +'+(als.length-shown); }
    const t4=el('text',{class:'al',x:15,y:65},g); const mm=(mismatchByNode.get(n.id)||[]); const redN=n.aliases.filter(a=>a.match===false).length; t4.textContent=redN? (redN+' word'+(redN>1?'s':'')+' ≠ code name'):'words match code';
    if(redN) t4.setAttribute('class','al bad');
    const tt=el('title',{},g); tt.textContent=n.role;
    g.addEventListener('keydown',ev=>{ if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectNode(n.id)} });
    g.addEventListener('pointerdown',ev=>startNodeDrag(ev,n.id));
    const steps=A.steps.get(n.id);
    if(steps){ steps.forEach((s,i)=>{ const b=el('g',{class:'stepbadge',transform:'translate('+(p.x+NW-10-i*20)+','+(p.y-4)+')'},gB); el('circle',{r:9},b); const tx=el('text',{},b); tx.textContent=s; }); }
  });
  // flow edge step badges are on nodes; refresh side UI
  syncSide(A);
}

// ---------- side UI ----------
function buildSide(){
  const fl=$('#flows'); fl.textContent='';
  flows.forEach(f=>{
    const b=h('button',{class:'flow','aria-pressed':'false','data-id':f.id,onclick:()=>{ S.flow = S.flow===f.id?null:f.id; S.sel=null; S.selEdge=null; setTab(S.flow?'flow':'words'); render(); }},[
      h('div',{class:'t',text:f.name}), h('div',{class:'s',text:f.steps.length+' steps · '+f.trigger.slice(0,70)+(f.trigger.length>70?'…':'')})]);
    fl.appendChild(b);
  });
  const kc=$('#kinds'); kc.textContent='';
  Object.keys(KIND_LABEL).forEach(k=>{
    const c=h('label',{class:'chk'},[h('input',{type:'checkbox',checked:'checked',onchange:e=>{ e.target.checked?S.kinds.add(k):S.kinds.delete(k); render(); }}), h('span',{class:'sw',style:'background:var(--k-'+k+')'}), KIND_LABEL[k]+' ('+DATA.nodes.filter(n=>n.kind===k).length+')']);
    kc.appendChild(c);
  });
  const ec=$('#etypes'); ec.textContent='';
  ETYPES.forEach(t=>{
    const n=edges.filter(e=>e.type===t).length;
    const c=h('label',{class:'chk'},[h('input',{type:'checkbox',onchange:e=>{ e.target.checked?S.types.add(t):S.types.delete(t); render(); }}), h('span',{class:'ln'+(t==='imports'?' dash':''),style:'border-color:var(--e-'+t+')'}), t+' ('+n+')']);
    if(S.types.has(t)) c.firstChild.checked=true;
    ec.appendChild(c);
  });
}
function syncSide(A){
  document.querySelectorAll('.flow').forEach(b=>{ b.setAttribute('aria-pressed',String(S.flow===b.dataset.id)); b.classList.toggle('hl', !!(S.sel && flowsOf.get(S.sel).some(f=>f.id===b.dataset.id))); });
  renderPane();
}
function selectNode(id){ S.sel=id; S.selEdge=null; S.flow=null; setTab('mod'); render(); }
function setTab(t){ S.tab=t==='flow'?'mod':t; $('#t-words').setAttribute('aria-selected',String(S.tab==='words')); $('#t-mod').setAttribute('aria-selected',String(S.tab==='mod')); }
$('#t-words').onclick=()=>{setTab('words');renderPane()};
$('#t-mod').onclick=()=>{setTab('mod');renderPane()};

function evList(list){ return h('ul',{class:'l'},list.map(v=>h('li',{},[h('code',{text:v.path}), document.createTextNode(' '), h('span',{class:'kv',text:'→ '+v.symbol})]))); }
function nodeLink(id){ return h('button',{class:'link',onclick:()=>selectNode(id),text:nodes.get(id).label}); }
function aliasRow(a){
  const li=h('li',{});
  if(a.status!=='found'){ li.appendChild(h('span',{class:'unk',text:a.word+' — unknown (not found in '+(a.source.path||a.source.commit)+')'})); return li; }
  const src=a.source.path? a.source.path : ('commit '+a.source.commit.slice(0,7)+': '+a.source.subject);
  li.appendChild(h('span',{class:a.match===false?'bad':'ok',text:a.word})); li.appendChild(h('span',{class:'kv',text:'  '+a.source_type+' · '+src}));
  if(a.match===false) li.appendChild(h('div',{class:'kv',text:'does not match a code name ('+nodes.get(a.__node||'').code_names+')'}));
  return li;
}
function renderPane(){
  const pane=$('#pane'); pane.textContent='';
  if(S.tab==='words'){ pane.appendChild(wordsPane()); return; }
  if(S.flow){ pane.appendChild(flowPane(flows.find(f=>f.id===S.flow))); return; }
  if(S.selEdge){ pane.appendChild(edgePane(eById.get(S.selEdge))); return; }
  if(S.sel){ pane.appendChild(modulePane(nodes.get(S.sel))); return; }
  pane.appendChild(h('p',{class:'kv',text:'Click a module, an edge or a flow. The map highlights upstream callers, downstream dependencies, related tests and the flows a module belongs to.'}));
}
function wordsPane(){
  const root=h('div',{});
  root.appendChild(h('h3',{text:'Words vs names'}));
  root.appendChild(h('div',{class:'kv',text:'Our words (left) against the names and paths in the code (right). Most likely to cause a wrong edit first. Nothing here has been changed in code or docs.'}));
  const t=h('table',{class:'wv'},[h('thead',{},[h('tr',{},[h('th',{text:'Our word'}),h('th',{text:'Code name and path'})])])]);
  const tb=h('tbody',{}); t.appendChild(tb);
  DATA.mismatches.slice().sort((a,b)=>a.rank-b.rank).forEach(m=>{
    const tr=h('tr',{class:'row',onclick:()=>{ if(m.nodes[0]) { selectNode(m.nodes[0]); } }},[
      h('td',{},[h('div',{},[h('span',{class:'bad',text:m.word}), document.createTextNode(' '), h('span',{class:'pill '+m.severity,text:m.severity})]),
        h('div',{class:'why',text:m.why}),
        (m.our_word_sources&&m.our_word_sources.length)? h('div',{class:'kv'},[document.createTextNode('seen in '), h('code',{text:m.our_word_sources.map(s=>s.path).join(', ')})]) : document.createTextNode('')]),
      h('td',{},[h('div',{class:'mono',text:m.code_name}), h('div',{class:'kv'},[h('code',{text:m.path})]),
        h('div',{class:'fix',text:'change the '+(m.change==='word'?'word (docs / how we say it)':'code name')})])]);
    tb.appendChild(tr);
  });
  root.appendChild(t);
  return root;
}
function modulePane(n){
  const root=h('div',{});
  root.appendChild(h('h3',{text:n.label}));
  root.appendChild(h('div',{},[h('span',{class:'tag',style:'color:var(--k-'+n.kind+');border-color:var(--k-'+n.kind+')',text:KIND_LABEL[n.kind]}), h('span',{class:'tag',text:(BOUNDARIES.find(b=>b.id===n.boundary)||{}).label}), h('code',{text:n.path})]));
  root.appendChild(h('p',{text:n.role}));
  root.appendChild(h('h4',{text:'Words we use for it'}));
  const al=h('ul',{class:'l'}); n.aliases.forEach(a=>{ a.__node=n.id; al.appendChild(aliasRow(a)); }); root.appendChild(al);
  root.appendChild(h('div',{class:'kv',text:'Code names: '+n.code_names.join(', ')}));
  const ups=[],downs=[];
  edges.forEach(e=>{ if(!S.types.has(e.type)&&e.type!=='imports') return; if(!visibleEdge(e)&&!(e.type==='imports'&&S.types.has('imports'))) return; if(e.to===n.id&&e.from!==n.id) ups.push(e); if(e.from===n.id&&e.to!==n.id) downs.push(e); });
  function edgeList(list,dir){ const by={}; list.forEach(e=>{const o=dir==='up'?e.from:e.to; (by[o]=by[o]||[]).push(e)}); const ul=h('ul',{class:'l'}); Object.keys(by).forEach(o=>{ ul.appendChild(h('li',{},[nodeLink(o), h('span',{class:'kv',text:'  '+by[o].map(e=>e.type).join(', ')})])); }); if(!list.length) ul.appendChild(h('li',{class:'kv',text:'none for the visible edge types'})); return ul; }
  root.appendChild(h('h4',{text:'Upstream callers ('+new Set(ups.map(e=>e.from)).size+')'})); root.appendChild(edgeList(ups,'up'));
  root.appendChild(h('h4',{text:'Downstream dependencies ('+new Set(downs.map(e=>e.to)).size+')'})); root.appendChild(edgeList(downs,'down'));
  root.appendChild(h('h4',{text:'Related tests ('+n.tests.reduce((s,t)=>s+t.files,0)+' files)'}));
  const tl=h('ul',{class:'l'}); n.tests.slice(0,14).forEach(t=>tl.appendChild(h('li',{},[h('code',{text:t.path}), h('span',{class:'kv',text:'  '+t.files+' file'+(t.files>1?'s':'')+' · '+t.via})]))); if(!n.tests.length) tl.appendChild(h('li',{class:'kv',text:'no test imports this module directly'})); if(n.tests.length>14) tl.appendChild(h('li',{class:'kv',text:'+'+(n.tests.length-14)+' more directories in codemap.json'})); root.appendChild(tl);
  root.appendChild(h('h4',{text:'Flows it belongs to'}));
  const fl=flowsOf.get(n.id); const fu=h('ul',{class:'l'}); fl.forEach(f=>fu.appendChild(h('li',{},[h('button',{class:'link',onclick:()=>{S.flow=f.id;S.sel=null;render();},text:f.name}), h('span',{class:'kv',text:'  steps '+f.steps.filter(s=>s.node===n.id).map(s=>s.n).join(', ')})]))); if(!fl.length) fu.appendChild(h('li',{class:'kv',text:'none of the 5 mapped flows'})); root.appendChild(fu);
  root.appendChild(h('h4',{text:'Entrypoints'})); root.appendChild(evList(n.entrypoints));
  root.appendChild(h('h4',{text:'Constraints'})); const cu=h('ul',{class:'l'}); n.constraints.forEach(c=>cu.appendChild(h('li',{},[document.createTextNode(c.rule+' '), h('code',{text:c.source.path})]))); root.appendChild(cu);
  root.appendChild(h('h4',{text:'Evidence'})); root.appendChild(evList(n.evidence));
  const mm=mismatchByNode.get(n.id)||[];
  if(mm.length){ root.appendChild(h('h4',{text:'Word mismatches touching this module'})); const ml=h('ul',{class:'l'}); mm.forEach(m=>ml.appendChild(h('li',{},[h('span',{class:'bad',text:m.word}), h('span',{class:'kv',text:'  → '+m.code_name})]))); root.appendChild(ml); }
  return root;
}
function edgePane(e){
  const root=h('div',{});
  root.appendChild(h('h3',{text:e.type}));
  root.appendChild(h('div',{},[nodeLink(e.from), document.createTextNode('  →  '), nodeLink(e.to)]));
  if(e.status==='unknown') root.appendChild(h('p',{class:'unk',text:'unknown — no source evidence'}));
  if(e.note) root.appendChild(h('p',{text:e.note}));
  root.appendChild(h('h4',{text:'Evidence'})); root.appendChild(evList(e.evidence));
  const fl=flows.filter(f=>f.steps.some(s=>s.via===e.id));
  root.appendChild(h('h4',{text:'Used in flows'})); const fu=h('ul',{class:'l'}); fl.forEach(f=>fu.appendChild(h('li',{},[h('button',{class:'link',onclick:()=>{S.flow=f.id;S.selEdge=null;render();},text:f.name})]))); if(!fl.length) fu.appendChild(h('li',{class:'kv',text:'none'})); root.appendChild(fu);
  return root;
}
function flowPane(f){
  const root=h('div',{});
  root.appendChild(h('h3',{text:f.name}));
  root.appendChild(h('div',{},[h('b',{text:'Trigger: '}), document.createTextNode(f.trigger)]));
  const ol=h('ol',{style:'padding-left:20px;margin:10px 0'});
  f.steps.forEach(s=>{ const n=nodes.get(s.node); ol.appendChild(h('li',{style:'margin-bottom:6px'},[nodeLink(s.node), document.createTextNode(': '+s.action+' '), h('span',{class:'kv'},[h('code',{text:s.evidence[0].path+' → '+s.evidence[0].symbol})]) ])); });
  root.appendChild(ol);
  root.appendChild(h('div',{},[h('b',{text:'Outcome: '}), document.createTextNode(f.outcome)]));
  return root;
}

// ---------- interaction: zoom / pan / drag ----------
const drag={mode:null,moved:false,id:null,sx:0,sy:0,ox:0,oy:0};
function applyView(){ vp.setAttribute('transform','translate('+S.view.x+','+S.view.y+') scale('+S.view.k+')'); }
function bbox(){ const ids=DATA.nodes.filter(visibleNode).map(n=>n.id); if(!ids.length) return {x0:0,y0:0,x1:100,y1:100}; return {x0:Math.min(...ids.map(i=>S.pos[i].x))-PAD-10,y0:Math.min(...ids.map(i=>S.pos[i].y))-PAD-HEAD-6,x1:Math.max(...ids.map(i=>S.pos[i].x))+NW+PAD+10,y1:Math.max(...ids.map(i=>S.pos[i].y))+NH+PAD+10}; }
function fit(){ const r=svg.getBoundingClientRect(); const b=bbox(); const k=Math.min(r.width/(b.x1-b.x0), r.height/(b.y1-b.y0), 1.6)*0.97; S.view.k=k; S.view.x=(r.width-(b.x1-b.x0)*k)/2-b.x0*k; S.view.y=(r.height-(b.y1-b.y0)*k)/2-b.y0*k; applyView(); }
function zoomAt(f,cx,cy){ const k0=S.view.k, k1=Math.max(0.15,Math.min(3.5,k0*f)); S.view.x=cx-(cx-S.view.x)*(k1/k0); S.view.y=cy-(cy-S.view.y)*(k1/k0); S.view.k=k1; applyView(); }
svg.addEventListener('wheel',ev=>{ ev.preventDefault(); const r=svg.getBoundingClientRect(); zoomAt(ev.deltaY<0?1.12:1/1.12, ev.clientX-r.left, ev.clientY-r.top); },{passive:false});
svg.addEventListener('pointerdown',ev=>{ if(ev.target.closest('.node')||ev.target.closest('.edge')) return; drag.mode='pan'; drag.moved=false; drag.sx=ev.clientX; drag.sy=ev.clientY; drag.ox=S.view.x; drag.oy=S.view.y; svg.setPointerCapture(ev.pointerId); svg.classList.add('panning'); });
function startNodeDrag(ev,id){ ev.stopPropagation(); drag.mode='node'; drag.id=id; drag.moved=false; drag.sx=ev.clientX; drag.sy=ev.clientY; drag.ox=S.pos[id].x; drag.oy=S.pos[id].y; }
svg.addEventListener('pointermove',ev=>{
  if(!drag.mode) return; const dx=ev.clientX-drag.sx, dy=ev.clientY-drag.sy;
  if(!drag.moved && Math.abs(dx)+Math.abs(dy)>4){ drag.moved=true; try{svg.setPointerCapture(ev.pointerId)}catch(_){} }
  if(!drag.moved) return;
  if(drag.mode==='pan'){ S.view.x=drag.ox+dx; S.view.y=drag.oy+dy; applyView(); }
  else if(drag.mode==='node'){ S.pos[drag.id]={x:drag.ox+dx/S.view.k, y:drag.oy+dy/S.view.k}; render(); }
});
function endDrag(ev){ if(!drag.mode) return; const wasNode=drag.mode==='node', moved=drag.moved, id=drag.id; svg.classList.remove('panning'); drag.mode=null; setTimeout(()=>{drag.moved=false},0); if(wasNode&&!moved&&ev.type==='pointerup') selectNode(id); }
svg.addEventListener('pointerup',endDrag); svg.addEventListener('pointercancel',endDrag);
svg.addEventListener('click',ev=>{ if(drag.moved) return; if(ev.target.closest('.node')||ev.target.closest('.edge')) return; S.sel=null;S.selEdge=null;S.flow=null; setTab('words'); render(); });
document.addEventListener('keydown',ev=>{ if(ev.key==='Escape'){ S.sel=null;S.selEdge=null;S.flow=null;S.q='';$('#q').value='';setTab('words');render(); } });
$('#z-in').onclick=()=>{const r=svg.getBoundingClientRect();zoomAt(1.25,r.width/2,r.height/2)};
$('#z-out').onclick=()=>{const r=svg.getBoundingClientRect();zoomAt(1/1.25,r.width/2,r.height/2)};
$('#z-fit').onclick=fit;
$('#z-reset').onclick=()=>{ S.pos=JSON.parse(JSON.stringify(L0.pos)); render(); fit(); };
$('#q').addEventListener('input',e=>{ S.q=e.target.value; render(); });
$('#q').addEventListener('keydown',e=>{ if(e.key==='Enter'){ const q=S.q.trim().toLowerCase(); const m=DATA.nodes.find(n=>visibleNode(n)&&nodeText(n).includes(q)); if(m) selectNode(m.id); } });
$('#b-theme').onclick=e=>{ const r=document.documentElement; const light=r.getAttribute('data-theme')!=='light'; r.setAttribute('data-theme',light?'light':'dark'); e.target.setAttribute('aria-pressed',String(light)); e.target.textContent=light?'Dark theme':'Light theme'; };
window.addEventListener('resize',fit);

buildSide();
S.flow = flows.length ? flows[0].id : null;
setTab('words');
render(); fit();
})();
</script>
</body>
</html>
'''

def write_html(data, path):
    payload = json.dumps(data, ensure_ascii=True, separators=(',', ':')).replace('</', '<\\/')
    import model as M
    html = (TEMPLATE
        .replace('__REPO__', repo_name())
        .replace('__BOUNDARIES__', json.dumps(M.BOUNDARIES))
        .replace('__DATA__', payload))
    # generated_at / commit appear in the header via JS; also keep them as static text for no-JS readers
    html = html.replace('<span class="meta">Generated <b id="h-time"></b></span>', '<span class="meta">Generated <b id="h-time">%s</b></span>' % data['generated_at'])
    html = html.replace('<b class="mono" id="h-commit"></b>', '<b class="mono" id="h-commit">%s</b>' % data['generated_from_commit'][:10])
    open(path, 'w', encoding='utf-8').write(html)
