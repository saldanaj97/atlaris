/**
 * Intentional readFileSync: ensure integration/bootstrap paths keep anon +
 * authenticated job_queue write revokes aligned (migration 0028/0029 parity).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

describe('job_queue privilege bootstrap sync', () => {
  const revokeAuthenticated =
    /REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM authenticated/;
  const revokeAnon = /REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM anon/;

  it('mirrors authenticated + anon revokes in grantRlsPermissions and rls-bootstrap', () => {
    const bootstrap = readFileSync(
      resolve(TEST_DIR, '../../../helpers/db/bootstrap.ts'),
      'utf8',
    );
    const rlsBootstrap = readFileSync(
      resolve(TEST_DIR, '../../../helpers/db/rls-bootstrap.ts'),
      'utf8',
    );

    expect(bootstrap).toMatch(revokeAuthenticated);
    expect(bootstrap).toMatch(revokeAnon);
    expect(rlsBootstrap).toMatch(revokeAuthenticated);
    expect(rlsBootstrap).toMatch(revokeAnon);
  });
});
