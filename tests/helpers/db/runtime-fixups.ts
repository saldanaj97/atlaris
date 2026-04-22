import { ensureRlsRolesAndPermissions } from './rls-bootstrap';
import { ensureJobTypeEnumValue } from './schema-fixups';

/**
 * Stable DB objects belong in the bootstrapped template DB, not in every file reset.
 */
export async function applyRuntimeDatabaseFixups(): Promise<void> {
	await ensureRlsRolesAndPermissions();
	await ensureJobTypeEnumValue();
}
