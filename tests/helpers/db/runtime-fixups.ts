import { ensureRlsRolesAndPermissions } from './rls-bootstrap';
import { ensureJobTypeEnumValue } from './schema-fixups';

/**
 * Integration/Testcontainers template hook: RLS/policy repair (`rls-bootstrap`) then enum drift (`schema-fixups`).
 * Disposable smoke DB skips this path (see `tests/helpers/smoke/db-pipeline.ts`). `job_queue` revoke parity: `job-queue-privilege-bootstrap-sync.spec.ts`.
 */
export async function applyRuntimeDatabaseFixups(): Promise<void> {
  await ensureRlsRolesAndPermissions();
  await ensureJobTypeEnumValue();
}
