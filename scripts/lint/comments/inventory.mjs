import {
  isDirective,
  lineOf,
  lineStarts,
  listSourceFiles,
  normalizeComment,
} from './shared.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseSync } from 'oxc-parser';

const STRONG_RATIONALE =
  /\b(because|so that|otherwise|instead of|rather than|cannot|can't|must not|must never|never|fail[- ]closed|fail[- ]open|race|idempot|intentional|without (this|it)|bypass|atomic|replay|untrusted|injection|timing-safe|constant-time|(?:DEV|JCS)-\d+)\b/i;

function hintFor(text) {
  if (text.length >= 50 && STRONG_RATIONALE.test(text)) return 'decision?';
  if (text.length >= 110) return 'review';
  return 'tautology?';
}

export function inventory(root) {
  const groups = [];
  for (const file of listSourceFiles(root)) {
    const source = readFileSync(file, 'utf8');
    const starts = lineStarts(source);
    const lines = source.split('\n');
    const relative = path.relative(root, file).split(path.sep).join('/');
    let current = null;
    for (const comment of parseSync(file, source).comments) {
      if (isDirective(comment.value)) {
        current = null;
        continue;
      }
      const startLine = lineOf(starts, comment.start);
      const endLine = lineOf(starts, comment.end - 1);
      const before = lines[startLine - 1]
        .slice(0, comment.start - starts[startLine - 1])
        .trim();
      const after = lines[endLine - 1]
        .slice(comment.end - starts[endLine - 1])
        .trim();
      const standalone = before === '' && after === '';
      const indent =
        lines[startLine - 1].length - lines[startLine - 1].trimStart().length;
      const joins =
        current &&
        standalone &&
        current.standalone &&
        comment.type === 'Line' &&
        current.type === 'Line' &&
        startLine === current.endLine + 1 &&
        indent === current.indent;
      if (joins) {
        current.endLine = endLine;
        current.end = comment.end;
        current.values.push(comment.value);
        continue;
      }
      current = {
        file: relative,
        type: comment.type,
        start: comment.start,
        end: comment.end,
        startLine,
        endLine,
        indent,
        standalone,
        trailing: before !== '',
        values: [comment.value],
      };
      groups.push(current);
    }
  }
  return groups.map((group, index) => {
    const text = normalizeComment(group.values.join('\n'));
    return { id: index + 1, ...group, text, hint: hintFor(text) };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node scripts/lint/comments/inventory.mjs <out.json>');
    process.exit(1);
  }
  const groups = inventory(process.cwd());
  writeFileSync(out, JSON.stringify(groups));
  console.log(`${groups.length} logical comments written to ${out}`);
}
