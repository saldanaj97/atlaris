import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseSync } from 'oxc-parser';

function collectEmptyJsxContainers(node, found) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectEmptyJsxContainers(child, found);
    return;
  }
  if (
    node.type === 'JSXExpressionContainer' &&
    node.expression?.type === 'JSXEmptyExpression'
  ) {
    found.push([node.start, node.end]);
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    collectEmptyJsxContainers(node[key], found);
  }
}

function expandRange(source, start, end, containers) {
  const container = containers.find(([s, e]) => s <= start && end <= e);
  if (container) [start, end] = container;
  let lineStart = start;
  while (
    lineStart > 0 &&
    (source[lineStart - 1] === ' ' || source[lineStart - 1] === '\t')
  )
    lineStart--;
  let lineEnd = end;
  while (
    lineEnd < source.length &&
    (source[lineEnd] === ' ' || source[lineEnd] === '\t')
  )
    lineEnd++;
  const atLineStart = lineStart === 0 || source[lineStart - 1] === '\n';
  const atLineEnd = lineEnd >= source.length || source[lineEnd] === '\n';
  if (atLineStart && atLineEnd) {
    return [lineStart, lineEnd < source.length ? lineEnd + 1 : lineEnd];
  }
  if (atLineEnd) return [lineStart, end];
  return [start, end];
}

export function deleteRanges(file, ranges) {
  const source = readFileSync(file, 'utf8');
  const containers = [];
  collectEmptyJsxContainers(parseSync(file, source).program, containers);
  const expanded = ranges
    .map(([start, end]) => expandRange(source, start, end, containers))
    .sort((a, b) => b[0] - a[0]);
  let next = source;
  let lastStart = Infinity;
  for (const [start, end] of expanded) {
    if (end > lastStart) continue;
    next = next.slice(0, start) + next.slice(end);
    lastStart = start;
  }
  writeFileSync(file, next);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const planPath = process.argv[2];
  if (!planPath) {
    console.error('usage: node scripts/lint/comments/apply.mjs <plan.json>');
    process.exit(1);
  }
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const byFile = new Map();
  for (const item of plan.delete) {
    const ranges = byFile.get(item.file) ?? [];
    ranges.push([item.start, item.end]);
    byFile.set(item.file, ranges);
  }
  for (const [file, ranges] of byFile) {
    deleteRanges(path.resolve(file), ranges);
  }
  console.log(`edited ${byFile.size} files; run oxfmt on them next`);
}
