import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const COMMENT_ROOT = 'src';
export const BASELINE_PATH = 'scripts/lint/comment-baseline.json';

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

const DIRECTIVE =
  /^\s*(oxlint-|eslint-|react-doctor-|oxfmt-|@ts-|@vitest-|@jsx|@license|@preserve|biome-|prettier-|istanbul |c8 |v8 |#__PURE__|#__NO_SIDE_EFFECTS__|\/\s*<reference)/;

export function isDirective(value) {
  return DIRECTIVE.test(value);
}

export function normalizeComment(value) {
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function commentHash(value) {
  return createHash('sha1')
    .update(normalizeComment(value))
    .digest('hex')
    .slice(0, 12);
}

export function listSourceFiles(root, dir = COMMENT_ROOT) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE_FILE.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(root, dir));
  return files.sort();
}

export function readBaseline(root) {
  try {
    return JSON.parse(readFileSync(path.join(root, BASELINE_PATH), 'utf8'));
  } catch {
    return { version: 1, files: {} };
  }
}

export function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

export function lineOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}
