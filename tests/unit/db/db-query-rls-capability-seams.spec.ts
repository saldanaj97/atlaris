/**
 * Lightweight guardrails: high-risk modules stay aligned with DB/RLS seams documented in
 * src/lib/db/AGENTS.md (architecture tests, not behavioral coverage).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(TEST_DIR, '../../../src');

/** Heuristic only; not safe for strings containing // or block comment delimiters. */
function stripLineAndBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('DB query RLS capability seams', () => {
  it('attempts module keeps explicit dbClient (no runtime getDb import/default)', () => {
    const attempts = readFileSync(
      resolve(SRC_ROOT, 'lib/db/queries/attempts.ts'),
      'utf8',
    );
    expect(attempts).not.toContain(`from '@/lib/db/runtime'`);
    expect(attempts).not.toContain(`from "@/lib/db/runtime"`);
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
    expect(metrics).not.toContain(`from '@/lib/db/runtime'`);
    expect(metrics).not.toContain(`from "@/lib/db/runtime"`);
    const withoutComments = stripLineAndBlockComments(metrics);
    expect(withoutComments).not.toMatch(/\bdbClient\s*=\s*getDb\s*\(\)/);
  });
});
