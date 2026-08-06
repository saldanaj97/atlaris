import { EXACT_PACKAGE_VERSION } from './shared.mjs';

const workspaceLine = (line) => line.replace(/\r$/, '');

const workspaceBlock = (text) => {
  if (typeof text !== 'string') return null;
  const lines = text.split('\n');
  const start = lines.findIndex(
    (line) => workspaceLine(line) === 'minimumReleaseAgeExclude:',
  );
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length) {
    const line = workspaceLine(lines[end]);
    if (line === '' || /^\s/.test(line)) {
      end += 1;
      continue;
    }
    break;
  }
  return { lines, start, end, body: lines.slice(start + 1, end) };
};

const exactException = (raw) => {
  if (typeof raw !== 'string') return null;
  let value = workspaceLine(raw).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const quote = value[0];
    value = value.slice(1, -1);
    if (quote === '"' && value.includes('\\')) return null;
  } else if (value.includes('"') || value.includes("'")) {
    return null;
  }
  const match = value.match(EXACT_PACKAGE_VERSION);
  return match ? { value, package: match[1], version: match[2] } : null;
};

const entryLine = (line) => {
  const match = workspaceLine(line).match(/^ {2}- (.+)$/);
  return match ? exactException(match[1]) : null;
};

/** Prove that workspace changes are only additions to minimumReleaseAgeExclude. */
export function inspectWorkspaceDiff(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') {
    return {
      valid: false,
      changed: true,
      additions: [],
      error: 'workspace contents are required',
    };
  }
  if (before === after)
    return { valid: true, changed: false, additions: [], entries: [] };
  const beforeBlock = workspaceBlock(before);
  const afterBlock = workspaceBlock(after);
  if (!beforeBlock || !afterBlock) {
    return {
      valid: false,
      changed: true,
      additions: [],
      error: 'workspace minimumReleaseAgeExclude block is missing',
    };
  }
  const outsideBefore = [
    ...beforeBlock.lines.slice(0, beforeBlock.start),
    ...beforeBlock.lines.slice(beforeBlock.end),
  ];
  const outsideAfter = [
    ...afterBlock.lines.slice(0, afterBlock.start),
    ...afterBlock.lines.slice(afterBlock.end),
  ];
  if (JSON.stringify(outsideBefore) !== JSON.stringify(outsideAfter)) {
    return {
      valid: false,
      changed: true,
      additions: [],
      error: 'workspace content outside exclusion block changed',
    };
  }

  const additions = [];
  let cursor = 0;
  for (const line of afterBlock.body) {
    if (cursor < beforeBlock.body.length && line === beforeBlock.body[cursor]) {
      cursor += 1;
      continue;
    }
    const parsed = entryLine(line);
    if (!parsed) {
      return {
        valid: false,
        changed: true,
        additions: [],
        error: 'workspace release-age block contains a non-addition change',
      };
    }
    additions.push(parsed);
  }
  if (cursor !== beforeBlock.body.length) {
    return {
      valid: false,
      changed: true,
      additions: [],
      error: 'existing release-age exclusions were removed or reordered',
    };
  }

  const allEntries = [
    ...beforeBlock.body,
    ...additions.map((item) => `  - ${item.value}`),
  ]
    .map(entryLine)
    .filter(Boolean)
    .map((item) => item.value);
  if (new Set(allEntries).size !== allEntries.length) {
    return {
      valid: false,
      changed: true,
      additions: [],
      error: 'release-age exclusions contain duplicates',
    };
  }
  return {
    valid: true,
    changed: true,
    additions: additions.map((item) => item.value).sort(),
    entries: additions,
  };
}
