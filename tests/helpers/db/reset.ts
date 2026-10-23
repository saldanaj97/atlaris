import { seedModelCatalog } from './model-catalog';
import { truncateAll } from './truncate';

export async function resetDbForIntegrationTestFile() {
  await truncateAll();
  await seedModelCatalog();
}
