import { ensureRlsRolesAndPermissions } from './rls-bootstrap';
import { ensureJobTypeEnumValue } from './schema-fixups';
import { truncateAll } from './truncate';

export async function resetDbForIntegrationTestFile() {
  await truncateAll();
  await ensureRlsRolesAndPermissions();
  await ensureJobTypeEnumValue();
}
