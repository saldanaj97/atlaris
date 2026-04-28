import { truncateAll } from './truncate';

export async function resetDbForIntegrationTestFile() {
  await truncateAll();
}
