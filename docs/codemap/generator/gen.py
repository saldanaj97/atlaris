#!/usr/bin/env python3
"""Generates docs/codemap/{codemap.json,codemap.lock,codemap.html} together from the repo.
Run from anywhere: python3 gen.py [--out DIR]. Reads the working tree + git; writes only into DIR.
A relative DIR is resolved against the directory you ran it from."""
import os, re, sys, json, hashlib, subprocess, datetime, collections

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import model as M

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))  # generator lives in docs/codemap/generator
OUT = os.path.join(REPO, 'docs/codemap')
CALLER_CWD = os.getcwd()
os.chdir(REPO)

def sh(*a, strip=True):
    out = subprocess.check_output(a, text=True)
    return out.strip() if strip else out

# ---------------- repo facts ----------------
COMMIT = sh('git', 'rev-parse', 'HEAD')
TRACKED = sh('git', 'ls-files').splitlines()
EXC = M.SCOPE_EXCLUDES
BARE = {'node_modules', 'dist', 'build', 'coverage'}
def excluded(p):
    if any(seg in BARE for seg in p.split('/')): return True
    return any(p == e or p.startswith(e + '/') for e in EXC)
FILES = [p for p in TRACKED if not excluded(p) and os.path.isfile(p)]
FSET = set(FILES)

_text = {}
def text(p):
    if p not in _text:
        _text[p] = open(p, encoding='utf-8', errors='replace').read()
    return _text[p]

def has_symbol(path, symbol):
    return os.path.isfile(path) and symbol in text(path)

def in_paths(p, prefixes):
    return any(p == x or p.startswith(x + '/') for x in prefixes)

NODE_BY_ID = {n['id']: n for n in M.NODES}
INTERNAL = [n for n in M.NODES if n['kind'] in ('module', 'service')]

def node_of(p):
    best, bl = None, -1
    for n in INTERNAL:
        for x in n['paths']:
            if (p == x or p.startswith(x + '/')) and len(x) > bl:
                best, bl = n['id'], len(x)
    return best

# ---------------- alias resolution ----------------
GENERIC = {'layer', 'module', 'feature', 'service', 'route', 'router', 'page'}
def tokens(s):
    s = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', s)
    out = set()
    for t in re.split(r'[^A-Za-z0-9]+', s):
        t = t.lower()
        if not t: continue
        if t.endswith('ies') and len(t) > 4: t = t[:-3] + 'y'
        elif t.endswith('s') and not t.endswith('ss') and len(t) > 3: t = t[:-1]
        if t in GENERIC: continue
        out.add(t)
    return frozenset(out)

def squash(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def alias_matches(word, code_names):
    tw = tokens(word)
    return (bool(tw) and any(tw == tokens(c) for c in code_names)) or any(squash(word) == squash(c) for c in code_names)

def commit_subject(sha):
    try:
        return sh('git', 'log', '-1', '--format=%s', sha)
    except Exception:
        return None

def resolve_alias(node, a):
    word = a['word']
    out = {'word': word, 'source_type': a['source_type']}
    found = False
    if 'commit' in a:
        full = None
        try: full = sh('git', 'rev-parse', a['commit'])
        except Exception: pass
        subj = commit_subject(a['commit']) if full else None
        out['source'] = {'commit': full or a['commit'], 'subject': subj}
        found = bool(subj) and word.lower() in subj.lower()
    else:
        out['source'] = {'path': a['path']}
        found = os.path.isfile(a['path']) and word.lower() in text(a['path']).lower()
    out['status'] = 'found' if found else 'unknown'
    out['match'] = alias_matches(word, node['code_names']) if found else None
    return out

# ---------------- tests (computed from imports) ----------------
IMP = re.compile(r'''(?:import|export)\s+(?:type\s+)?(?:([^'"]*?)\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:vi\.(?:mock|doMock|importActual|importMock|unmock)|jest\.mock)\(\s*['"]([^'"]+)['"]''')
def resolve(frm, spec):
    if spec.startswith('@/'): base = 'src/' + spec[2:]
    elif spec.startswith('@supabase/'): base = 'supabase/' + spec[len('@supabase/'):]
    elif spec.startswith('@tests/'): base = 'tests/' + spec[7:]
    elif spec.startswith('.'): base = os.path.normpath(os.path.join(os.path.dirname(frm), spec))
    else: return None
    for c in (base, base + '.ts', base + '.tsx', base + '.mts', base + '/index.ts', base + '/index.tsx', base + '.js', base + '.mjs'):
        if c in FSET: return c
    return None

SRC = [f for f in FILES if re.search(r'\.(ts|tsx|mts|js|mjs)$', f)]
import_edges = collections.defaultdict(list)       # (a,b) -> [(file, target, clause)]
test_targets = collections.defaultdict(set)         # test file -> set(target files)
for f in SRC:
    is_test = f.startswith('tests/')
    n = node_of(f)
    if not n and not is_test: continue
    for m in IMP.finditer(text(f)):
        spec = m.group(2) or m.group(3) or m.group(4)
        if not spec: continue
        t = resolve(f, spec)
        if not t: continue
        if is_test:
            test_targets[f].add(t)
        else:
            tn = node_of(t)
            if tn and tn != n:
                import_edges[(n, tn)].append((f, t, (m.group(1) or '').strip()))

def tests_for(node):
    hits = collections.Counter()
    for tf, targets in test_targets.items():
        for t in targets:
            if node['kind'] in ('module', 'service'):
                ok = node_of(t) == node['id']
            else:
                ok = t in node['paths']
            if ok:
                hits[os.path.dirname(tf)] += 1
                break
    res = [{'path': d, 'files': c, 'via': 'imports'} for d, c in hits.items()]
    if node['id'] == 'web-ui':
        res.append({'path': 'tests/playwright/smoke', 'files': len([f for f in FILES if f.startswith('tests/playwright/smoke/')]), 'via': 'e2e (drives pages by URL, no import)'})
    res.sort(key=lambda r: (-r['files'], r['path']))
    return res

# ---------------- import evidence ----------------
def first_binding(clause, spec_path):
    c = clause.replace('type ', ' ')
    m = re.search(r'\*\s+as\s+(\w+)', c)
    if m: return m.group(1)
    m = re.search(r'\{([^}]*)\}', c)
    if m:
        for part in m.group(1).split(','):
            part = part.strip().split(' as ')[0].strip()
            if part: return part
    m = re.match(r'\s*(\w+)', c)
    if m and m.group(1): return m.group(1)
    return os.path.basename(spec_path).rsplit('.', 1)[0]

def build_import_edges():
    out = []
    for (a, b), lst in sorted(import_edges.items()):
        lst = sorted(lst, key=lambda x: (x[0], x[1]))
        samples, seen = [], set()
        for f, t, clause in lst:
            if f in seen: continue
            sym = first_binding(clause, t)
            if not sym or sym not in text(f): continue
            seen.add(f)
            samples.append({'path': f, 'symbol': sym})
            if len(samples) == 3: break
        out.append({'from': a, 'to': b, 'type': 'imports', 'evidence': samples, 'note': '%d importing file%s' % (len({x[0] for x in lst}), '' if len({x[0] for x in lst}) == 1 else 's'), 'status': 'evidenced' if samples else 'unknown'})
    return out

# ---------------- fingerprints ----------------
def sha256_file(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

def fingerprint(paths_list):
    lines = []
    for p in sorted(paths_list):
        lines.append('%s\0%s\n' % (p, sha256_file(p)))
    return hashlib.sha256(''.join(lines).encode('utf-8')).hexdigest()

def node_files(n):
    return sorted(p for p in FILES if in_paths(p, n['paths']))

# ---------------- assemble ----------------
def build():
    generated_at = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    nodes = []
    for n in M.NODES:
        nn = {
            'id': n['id'], 'label': n['label'], 'kind': n['kind'], 'boundary': n['boundary'],
            'path': n['path'], 'paths': n['paths'], 'role': n['role'],
            'entrypoints': n['entrypoints'], 'tests': tests_for(n),
            'constraints': n['constraints'], 'evidence': n['evidence'],
            'aliases': [resolve_alias(n, a) for a in n['aliases']],
            'code_names': n['code_names'],
        }
        nodes.append(nn)
    edges = []
    for e in M.EDGES:
        ee = dict(e)
        ee['status'] = 'evidenced' if e['evidence'] else 'unknown'
        edges.append(ee)
    edges += build_import_edges()
    for e in edges:
        e['id'] = '%s>%s:%s' % (e['from'], e['to'], e['type'])
    # flows
    flows = []
    for f in M.FLOWS:
        steps = []
        for i, s in enumerate(f['steps'], 1):
            steps.append({'n': i, 'node': s['node'], 'action': s['action'], 'via': s['via'], 'evidence': s['evidence']})
        flows.append({'id': f['id'], 'name': f['name'], 'trigger': f['trigger'], 'steps': steps, 'outcome': f['outcome']})
    # mismatches: curated + one per remaining red alias
    mism = []
    covered = set()
    for i, m in enumerate(M.MISMATCHES):
        for c in m['covers']: covered.add(c)
        mm = {'rank': i + 1, 'word': m['word'], 'code_name': m['code_name'], 'path': m['path'], 'change': m['change'],
              'severity': 'high' if i < 4 else 'medium', 'why': m['why'], 'nodes': m['nodes'],
              'covers': [{'node': a, 'alias': b} for a, b in m['covers']],
              'our_word_sources': m['our_word_sources'], 'code_evidence': m['code_evidence']}
        mism.append(mm)
    rank = len(mism)
    for n in nodes:
        for a in n['aliases']:
            if a['status'] == 'found' and a['match'] is False and (n['id'], a['word']) not in covered:
                rank += 1
                src = a['source'].get('path') or a['source'].get('subject')
                mism.append({'rank': rank, 'word': a['word'], 'code_name': ' / '.join(n['code_names'][:3]), 'path': n['path'], 'change': 'word', 'severity': 'low',
                             'why': "Synonym for %s with no matching code name (%s: %s)." % (n['label'], a['source_type'], src),
                             'nodes': [n['id']], 'covers': [{'node': n['id'], 'alias': a['word']}], 'our_word_sources': [], 'code_evidence': [n['entrypoints'][0]] if n['entrypoints'] else []})
    data = collections.OrderedDict()
    data['generated_at'] = generated_at
    data['generated_from_commit'] = COMMIT
    data['scope'] = ['src', 'supabase', 'workers', 'tests (related-test mapping only)',
                     'README.md, AGENTS.md, workers/AGENTS.md, docs/** (alias sources only)', 'git commit subjects (alias sources only)']
    data['nodes'] = nodes
    data['edges'] = edges
    data['flows'] = flows
    data['mismatches'] = mism
    return data

def build_lock(data):
    # strip=False: the first porcelain line starts with a status column that may be a space.
    porcelain = sh('git', 'status', '--porcelain', '--', '.', ':!docs/codemap', strip=False)
    dirty = [l[3:] for l in porcelain.splitlines() if l]
    mods = {}
    covered = set()
    for n in M.NODES:
        fl = node_files(n)
        mods[n['id']] = {'fingerprint': fingerprint(fl), 'file_count': len(fl), 'paths': n['paths'], 'kind': n['kind']}
        if n['kind'] in ('module', 'service'): covered.update(fl)
    groups = collections.defaultdict(list)
    for p in FILES:
        if p in covered: continue
        top = p.split('/')[0] if '/' in p else '(root files)'
        groups[top].append(p)
    unmapped = {k: {'fingerprint': fingerprint(v), 'file_count': len(v)} for k, v in sorted(groups.items())}
    return collections.OrderedDict([
        ('lock_version', 1),
        ('generated_at', data['generated_at']),
        ('commit', COMMIT),
        ('working_tree_dirty', bool(dirty)),
        ('dirty_paths', dirty),
        ('dirty_check', "git status --porcelain excluding docs/codemap (the generator's own output)"),
        ('scanned_scope', data['scope']),
        ('excluded_directories', M.SCOPE_EXCLUDES),
        ('fingerprint_algorithm', {
            'name': 'sha256-of-sorted-path-content-pairs',
            'file_hash': 'sha256 of raw file bytes (working tree)',
            'module_hash': "sha256 over the UTF-8 concatenation, in ascending path order, of '<path>\\0<file sha256 hex>\\n' for every git-tracked, non-excluded file under the module's paths",
        }),
        ('modules', mods),
        ('unmapped_top_level', unmapped),
    ])

if __name__ == '__main__':
    out = OUT
    if '--out' in sys.argv:
        i = sys.argv.index('--out')
        if i + 1 >= len(sys.argv):
            sys.exit('usage: gen.py [--out DIR] (--out needs a directory)')
        out = os.path.abspath(os.path.join(CALLER_CWD, sys.argv[i + 1]))
    data = build()
    lock = build_lock(data)
    os.makedirs(out, exist_ok=True)
    json.dump(data, open(os.path.join(out, 'codemap.json'), 'w'), indent=2, ensure_ascii=False)
    open(os.path.join(out, 'codemap.json'), 'a').write('\n')
    json.dump(lock, open(os.path.join(out, 'codemap.lock'), 'w'), indent=2, ensure_ascii=False)
    open(os.path.join(out, 'codemap.lock'), 'a').write('\n')
    import render
    render.write_html(data, os.path.join(out, 'codemap.html'))
    print('ok', len(data['nodes']), 'nodes', len(data['edges']), 'edges', len(data['flows']), 'flows', len(data['mismatches']), 'mismatches')
