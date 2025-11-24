import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupTestData,
  createPlan,
  verifyPlanExists,
  waitForJobCompletion,
  type SmokeTestConfig,
} from './helpers';

describe('Plan Generation Smoke Test', () => {
  let config: SmokeTestConfig;
  let createdPlanId: string;

  beforeAll(() => {
    // Load configuration from environment variables
    config = {
      apiUrl: process.env.SMOKE_TEST_API_URL || 'http://localhost:3000',
      databaseUrl:
        process.env.SMOKE_TEST_DATABASE_URL || process.env.DATABASE_URL || '',
      apiKey: process.env.SMOKE_TEST_API_KEY || '',
    };

    // Validate configuration
    if (!config.apiUrl) {
      throw new Error('SMOKE_TEST_API_URL is required');
    }
    if (!config.databaseUrl) {
      throw new Error('SMOKE_TEST_DATABASE_URL is required');
    }
    if (!config.apiKey) {
      throw new Error('SMOKE_TEST_API_KEY is required');
    }
  });

  afterAll(async () => {
    // Cleanup test data if plan was created
    if (createdPlanId && config.databaseUrl) {
      await cleanupTestData(createdPlanId, config.databaseUrl);
    }
  });

  it('should create plan, process job, and generate modules/tasks', async () => {
    // Step 1: Create plan via API
    console.log('Step 1: Creating plan via API...');
    const planResponse = await createPlan(config, {
      topic: 'Smoke Test - TypeScript Basics',
      skillLevel: 'beginner',
      weeklyHours: 5,
    });

    expect(planResponse).toBeDefined();
    expect(planResponse.id).toBeDefined();

    createdPlanId = planResponse.id;

    console.log(`Plan created: ${createdPlanId}`);

    // Step 2: Wait for worker to process job
    console.log('Step 2: Waiting for worker to process job...');
    const jobCompleted = await waitForJobCompletion(
      createdPlanId,
      config.databaseUrl,
      60000 // 60 second timeout
    );

    expect(jobCompleted).toBe(true);
    console.log('Job completed successfully');

    // Step 3: Verify plan exists with modules and tasks
    console.log('Step 3: Verifying plan structure...');
    const { modulesCount, tasksCount } = await verifyPlanExists(
      createdPlanId,
      config.databaseUrl
    );

    expect(modulesCount).toBeGreaterThan(0);
    expect(tasksCount).toBeGreaterThan(0);

    console.log(`Plan verified: ${modulesCount} modules, ${tasksCount} tasks`);
    console.log('✅ Smoke test passed!');
  }, 90000); // 90 second test timeout
});
