import { setupWorkflowTests, teardownWorkflowTests } from '@workflow/vitest';
import { afterAll, beforeAll } from 'vitest';

beforeAll(async () => {
  await setupWorkflowTests({
    outDir: '.workflow-vitest',
    dataDir: '.workflow-data',
  });
});

afterAll(async () => {
  await teardownWorkflowTests();
});
