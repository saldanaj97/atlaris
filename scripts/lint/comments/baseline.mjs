import {
  BASELINE_PATH,
  commentHash,
  isDirective,
  listSourceFiles,
  readBaseline,
} from './shared.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseSync } from 'oxc-parser';

const mode = process.argv[2];
if (!['--check', '--update', '--init'].includes(mode)) {
  console.error(
    'usage: node scripts/lint/comments/baseline.mjs --check | --update | --init',
  );
  process.exit(1);
}

const root = process.cwd();
const current = {};
for (const file of listSourceFiles(root)) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  for (const comment of parseSync(file, readFileSync(file, 'utf8')).comments) {
    if (isDirective(comment.value)) continue;
    const counts = (current[relative] ??= {});
    const hash = commentHash(comment.value);
    counts[hash] = (counts[hash] ?? 0) + 1;
  }
}

const existing = readBaseline(root).files;
const grown = [];
const shrunk = [];
const next = {};

for (const [file, counts] of Object.entries(current)) {
  for (const [hash, count] of Object.entries(counts)) {
    const allowed = existing[file]?.[hash] ?? 0;
    if (count > allowed) grown.push(`${file} (${hash}: ${count} > ${allowed})`);
    const kept = mode === '--init' ? count : Math.min(count, allowed);
    if (kept > 0) (next[file] ??= {})[hash] = kept;
  }
}
for (const [file, counts] of Object.entries(existing)) {
  for (const [hash, allowed] of Object.entries(counts)) {
    if ((current[file]?.[hash] ?? 0) < allowed)
      shrunk.push(`${file} (${hash})`);
  }
}

if (mode === '--check') {
  if (grown.length > 0) {
    console.error(
      `New comments in src/ are banned. Delete them, or write an ADR in docs/adr/:\n  ${grown.join('\n  ')}`,
    );
  }
  if (shrunk.length > 0) {
    console.error(
      `Baseline lists comments that no longer exist. Run: pnpm lint:comments:update\n  ${shrunk.join('\n  ')}`,
    );
  }
  process.exit(grown.length > 0 || shrunk.length > 0 ? 1 : 0);
}

if (mode === '--update' && grown.length > 0) {
  console.error(
    `Refusing to grow ${BASELINE_PATH}; delete these comments instead:\n  ${grown.join('\n  ')}`,
  );
  process.exit(1);
}

const sorted = Object.fromEntries(
  Object.keys(next)
    .sort()
    .map((file) => [file, next[file]]),
);
writeFileSync(
  path.join(root, BASELINE_PATH),
  `${JSON.stringify({ version: 1, files: sorted }, null, 2)}\n`,
);
const total = Object.values(sorted).reduce(
  (sum, counts) => sum + Object.values(counts).reduce((a, b) => a + b, 0),
  0,
);
console.log(
  `${BASELINE_PATH}: ${total} comments in ${Object.keys(sorted).length} files`,
);
