/**
 * Lightweight guardrails: high-risk modules stay aligned with DB/RLS seams documented in
 * supabase/AGENTS.md (architecture tests, not behavioral coverage).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../..');
const SRC_ROOT = resolve(REPO_ROOT, 'src');
const SUPABASE_RUNTIME = resolve(REPO_ROOT, 'supabase/runtime.ts');

/** Heuristic only; not safe for strings containing // or block comment delimiters. */
function stripLineAndBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) {
    throw new Error(`Cannot find ${dir} — is the repo structure correct?`);
  }

  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkSourceFiles(full, acc);
    } else if (['.ts', '.tsx', '.mts', '.cts'].includes(extname(name))) {
      acc.push(full);
    }
  }
  return acc;
}

const GET_DB_VALUE_IMPORT =
  /import\s+(?:type\s+)?(?:\{[^}]*\bgetDb\b[^}]*\}|\*\s+as\s+\w+)\s+from\s+['"]@supabase\/runtime['"]/;
const FORBIDDEN_GET_DB_FALLBACKS = [
  /\bdbClient\s*\?\?\s*getDb\s*\(/,
  /\bdbClient\s*=\s*getDb\s*\(/,
  /\bdeps\.getDb\s*\(/,
  /\bparams\.dbClient\s*\?\?\s*getDb\s*\(/,
];

const NAMED_SERVICE_ROLE_OWNERS = new Set([
  'lib/db/queries/admin/jobs-metrics.ts',
  'lib/db/queries/admin/retention.ts',
  'features/lesson-content/start-module-lesson-generation-workflow.ts',
  'features/notifications/email/start-email-notification-delivery-workflow.ts',
]);

const SERVICE_ROLE_DEFAULTS = [
  /\bdbClient\s*\?\?\s*serviceRoleDb\b/,
  /\bdbClient\s*=\s*serviceRoleDb\b/,
  /\bdeps\.dbClient\s*\?\?\s*serviceRoleDb\b/,
];

const BELOW_SEAM_SCAN_ROOTS = [
  resolve(SRC_ROOT, 'lib/db/queries'),
  resolve(SRC_ROOT, 'features/billing'),
  resolve(SRC_ROOT, 'features/plans/entitlement'),
  resolve(SRC_ROOT, 'features/plans/read-projection'),
  resolve(SRC_ROOT, 'features/plans/api'),
  resolve(SRC_ROOT, 'features/plans/regeneration-orchestration'),
  resolve(SRC_ROOT, 'features/plans/write-service'),
  resolve(SRC_ROOT, 'features/lesson-content'),
  resolve(SRC_ROOT, 'features/notifications/email'),
];

function srcRelative(absolutePath: string): string {
  return relative(SRC_ROOT, absolutePath).split('\\').join('/');
}

describe('DB query RLS capability seams', () => {
  it('attempts module keeps explicit dbClient (no runtime getDb import/default)', () => {
    const attempts = readFileSync(
      resolve(SRC_ROOT, 'lib/db/queries/attempts.ts'),
      'utf8',
    );
    expect(attempts).not.toContain(`from '@supabase/runtime'`);
    expect(attempts).not.toContain(`from "@supabase/runtime"`);
    const withoutComments = stripLineAndBlockComments(attempts);
    expect(withoutComments).not.toMatch(/\bdbClient\s*=\s*getDb\s*\(\)/);
  });

  it('lockOwnedPlanById requires explicit dbClient', () => {
    const plansHelpers = readFileSync(
      resolve(SRC_ROOT, 'lib/db/queries/helpers/plans-helpers.ts'),
      'utf8',
    );
    const lockedIface =
      plansHelpers.match(
        /interface LockedOwnedPlanQueryParams \{[^}]+\}/,
      )?.[0] ?? '';
    expect(lockedIface).toContain('interface LockedOwnedPlanQueryParams');
    expect(lockedIface).toContain('dbClient: PlanQueryClient');
    expect(lockedIface).not.toContain('dbClient?:');
  });

  it('admin jobs-metrics defaults to service-role only', () => {
    const metrics = readFileSync(
      resolve(SRC_ROOT, 'lib/db/queries/admin/jobs-metrics.ts'),
      'utf8',
    );
    expect(metrics).toContain(`db as serviceRoleDb`);
    expect(metrics).toContain(`dbClient: typeof serviceRoleDb = serviceRoleDb`);
    expect(metrics).not.toContain(`from '@supabase/runtime'`);
    expect(metrics).not.toContain(`from "@supabase/runtime"`);
    const withoutComments = stripLineAndBlockComments(metrics);
    expect(withoutComments).not.toMatch(/\bdbClient\s*=\s*getDb\s*\(\)/);
  });

  it('query and owned feature modules require an explicit client below the request seam', () => {
    const files = BELOW_SEAM_SCAN_ROOTS.flatMap((dir) => walkSourceFiles(dir));
    const violations: string[] = [];

    for (const file of files) {
      const rel = srcRelative(file);
      const source = stripLineAndBlockComments(readFileSync(file, 'utf8'));

      if (GET_DB_VALUE_IMPORT.test(source)) {
        violations.push(`${rel}: imports getDb from @supabase/runtime`);
      }

      for (const pattern of FORBIDDEN_GET_DB_FALLBACKS) {
        if (pattern.test(source)) {
          violations.push(`${rel}: forbidden getDb fallback ${pattern}`);
        }
      }

      if (!NAMED_SERVICE_ROLE_OWNERS.has(rel)) {
        for (const pattern of SERVICE_ROLE_DEFAULTS) {
          if (pattern.test(source)) {
            violations.push(`${rel}: unnamed service-role default ${pattern}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps ambient getDb acquisition only at request establishment', () => {
    const allowed = [
      readFileSync(resolve(SRC_ROOT, 'lib/api/request-boundary.ts'), 'utf8'),
      readFileSync(resolve(SRC_ROOT, 'lib/api/auth.ts'), 'utf8'),
      readFileSync(SUPABASE_RUNTIME, 'utf8'),
    ];

    for (const source of allowed) {
      expect(source).toContain('getDb');
    }

    const streamCleanup = readFileSync(
      resolve(SRC_ROOT, 'features/plans/session/stream-cleanup.ts'),
      'utf8',
    );
    expect(streamCleanup).toContain('MissingRequestDbContextError');
    expect(streamCleanup).not.toMatch(/\bgetDb\s*\(/);
  });
});
