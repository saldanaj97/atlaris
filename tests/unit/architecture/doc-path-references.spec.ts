import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

const EXCLUDED_DOC_PREFIXES = [
  'node_modules/',
  '.agents/skill-sources/',
  'tests/results/',
];

/**
 * Backticked paths that deliberately name files that do not exist in this
 * repository: removed files cited as history, files that must stay absent, and
 * files that live in an external package. Keyed by doc, then by path, with the
 * reason. Keep it small; fix the doc instead when the file simply moved.
 */
const ALLOWED_MISSING_PATHS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  'docs/CHANGELOG.md': {
    '.github/workflows/ci-pr.yml':
      'Changelog records this workflow as removed.',
    '.github/workflows/ci-trunk.yml':
      'Changelog records this workflow as removed.',
  },
  'docs/architecture/cloudflare-jobs-runtime.md': {
    'src/lib/proxy/workflow-callback-auth.ts':
      'Lists what B7b removed from the app.',
  },
  'docs/architecture/email-notification-delivery-runbook.md': {
    '.github/workflows/email-notification-delivery-scheduler.yml':
      'The runbook requires this workflow to stay absent.',
  },
  'docs/testing/playwright-local-smoke.md': {
    '.agents/recaps/': 'Names folders that smoke notes must not be written to.',
    '.agents/handoffs/':
      'Names folders that smoke notes must not be written to.',
    '.cursor/plans/': 'Names folders that smoke notes must not be written to.',
    'prds/': 'Names folders that smoke notes must not be written to.',
  },
  'docs/security/codex-scan-verification-2026-08-20.md': {
    'src/app/api/v1/plans/stream/route.ts':
      'Dated scan report; the SSE route was removed in JCS-133.',
  },
  'docs/styles/design-system.md': {
    '.cursor/rules/design-after-hours.mdc':
      'Listed as removed by JCS-98 ("Deleted" and "Pre-adoption paths").',
    'docs/styles/after-hours-direction.md':
      'Listed as removed by JCS-98 ("Deleted" and "Pre-adoption paths").',
    'docs/styles/style-guide.md':
      'Listed as removed by JCS-98 ("Deleted" and "Pre-adoption paths").',
    'docs/design-system/':
      'Example location for a future design-system folder.',
    'docs/registries/content-catalog.json':
      'Lives in the external reference package, not this repository.',
    'docs/source-register.json':
      'Lives in the external reference package, not this repository.',
    'scripts/build.py':
      'Names a script missing from the external reference package.',
    'scripts/token-compiler.py':
      'Lives in the external reference package, not this repository.',
  },
};

type Reference = { doc: string; line: number; path: string };

function git(args: string[], input?: string): string {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * The tracked tree is the source of truth for what exists, so results match on
 * every machine; untracked or machine-local files must not change the outcome.
 */
function listTrackedFiles(): string[] {
  return git(['ls-files', '-z']).split('\0').filter(Boolean);
}

/** A tracked file, or a folder that contains one. */
function createTrackedPathLookup(files: string[]): (path: string) => boolean {
  const entries = new Set(files);
  for (const file of files) {
    for (
      let slash = file.indexOf('/');
      slash > 0;
      slash = file.indexOf('/', slash + 1)
    ) {
      entries.add(file.slice(0, slash));
    }
  }
  return (path) => entries.has(path.replace(/\/+$/, ''));
}

function isScannedDoc(file: string): boolean {
  return (
    /\.(md|mdc)$/.test(file) &&
    !EXCLUDED_DOC_PREFIXES.some((prefix) => file.startsWith(prefix))
  );
}

function topLevelDirectories(files: string[]): Set<string> {
  const roots = new Set<string>();
  for (const file of files) {
    const slash = file.indexOf('/');
    if (slash > 0) roots.add(file.slice(0, slash));
  }
  return roots;
}

function normalizeReference(raw: string): string | null {
  if (/[*<>{}$|…]|\.\.\./.test(raw)) return null;
  let path = raw
    .replace(/[.,;:]+$/, '')
    .replace(/#.*$/, '')
    .replace(/:\d+(-\d+)?$/, '');
  // Keep route-group parentheses, drop a closing one that has no opener.
  if (path.endsWith(')') && !path.includes('(')) path = path.slice(0, -1);
  return path.includes('/') ? path : null;
}

function extractReferences(doc: string, roots: Set<string>): Reference[] {
  const references: Reference[] = [];
  let inFence = false;

  // A tracked doc can be absent from a partial checkout; there is nothing to scan.
  if (!existsSync(join(REPO_ROOT, doc))) return references;

  readFileSync(join(REPO_ROOT, doc), 'utf8')
    .split('\n')
    .forEach((text, index) => {
      if (/^\s*(```|~~~)/.test(text)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;

      for (const match of text.matchAll(/`([^`\s]+)`/g)) {
        const path = normalizeReference(match[1] ?? '');
        if (!path || !roots.has(path.slice(0, path.indexOf('/')))) continue;
        references.push({ doc, line: index + 1, path });
      }
    });

  return references;
}

/**
 * Paths ignored by a tracked `.gitignore`. `.git/info/exclude` and global
 * excludes are machine-local, so honoring them would hide a broken reference
 * on one machine and flag it on another.
 */
function gitIgnoredPaths(paths: string[]): Set<string> {
  if (paths.length === 0) return new Set();
  let out: string;
  try {
    out = git(['check-ignore', '-v', '-z', '--stdin'], paths.join('\0'));
  } catch (error) {
    // `git check-ignore` exits 1 when nothing matches.
    if ((error as { status?: number }).status === 1) return new Set();
    throw error;
  }

  const ignored = new Set<string>();
  const fields = out.split('\0');
  for (let i = 0; i + 3 < fields.length; i += 4) {
    const source = fields[i] ?? '';
    if (source === '.gitignore' || source.endsWith('/.gitignore')) {
      ignored.add(fields[i + 3] ?? '');
    }
  }
  return ignored;
}

function findBrokenReferences(): Reference[] {
  const tracked = listTrackedFiles();
  const roots = topLevelDirectories(tracked);
  const isTracked = createTrackedPathLookup(tracked);
  const references = tracked
    .filter(isScannedDoc)
    .flatMap((doc) => extractReferences(doc, roots))
    .filter(
      ({ doc, path }) =>
        !isTracked(path) &&
        !isTracked(posix.join(dirname(doc), path)) &&
        !(path in (ALLOWED_MISSING_PATHS[doc] ?? {})),
    );

  const ignored = gitIgnoredPaths([...new Set(references.map((r) => r.path))]);
  return references.filter(({ path }) => !ignored.has(path));
}

describe('documentation path references', () => {
  it('points every backticked repo path in tracked Markdown at an existing file', () => {
    const broken = findBrokenReferences();

    expect(
      broken.map(({ doc, line, path }) => `${doc}:${line} → ${path}`),
      'Update these doc references, or add a reasoned entry to ALLOWED_MISSING_PATHS if the doc deliberately names a removed file',
    ).toEqual([]);
  });

  it('keeps allowlist entries tied to docs that still mention a missing path', () => {
    const tracked = listTrackedFiles();
    const trackedSet = new Set(tracked);
    // Allowlisted roots count too, so an entry under an untracked root (`prds/`)
    // is still matched against its doc.
    const roots = topLevelDirectories(tracked);
    for (const paths of Object.values(ALLOWED_MISSING_PATHS)) {
      for (const path of Object.keys(paths)) {
        roots.add(path.slice(0, path.indexOf('/')));
      }
    }
    const isTracked = createTrackedPathLookup(tracked);
    const stale: string[] = [];

    for (const [doc, paths] of Object.entries(ALLOWED_MISSING_PATHS)) {
      const mentioned = trackedSet.has(doc)
        ? new Set(extractReferences(doc, roots).map((r) => r.path))
        : new Set<string>();
      for (const path of Object.keys(paths)) {
        if (!mentioned.has(path))
          stale.push(`${doc} → ${path} (not mentioned)`);
        else if (isTracked(path) || isTracked(posix.join(dirname(doc), path))) {
          stale.push(`${doc} → ${path} (exists now)`);
        }
      }
    }

    expect(stale).toEqual([]);
  });
});
