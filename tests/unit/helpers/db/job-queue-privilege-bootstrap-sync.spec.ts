/**
 * Intentional readFileSync: ensure integration/bootstrap paths keep anonymous +
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
  const revokeAnonymous =
    /REVOKE INSERT, UPDATE, DELETE ON "job_queue" FROM anonymous/;

  it('mirrors authenticated + anonymous revokes in grantRlsPermissions and rls-bootstrap', () => {
    const bootstrap = readFileSync(
      resolve(TEST_DIR, '../../../helpers/db/bootstrap.ts'),
      'utf8',
    );
    const rlsBootstrap = readFileSync(
      resolve(TEST_DIR, '../../../helpers/db/rls-bootstrap.ts'),
      'utf8',
    );

    expect(bootstrap).toMatch(revokeAuthenticated);
    expect(bootstrap).toMatch(revokeAnonymous);
    expect(rlsBootstrap).toMatch(revokeAuthenticated);
    expect(rlsBootstrap).toMatch(revokeAnonymous);
  });
});
