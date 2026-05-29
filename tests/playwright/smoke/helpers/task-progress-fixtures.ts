import {
  LOCAL_PRODUCT_BROWSER_FIXTURE_MODULE_ONE_ID,
  LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID,
  LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_TOPIC,
  LOCAL_PRODUCT_BROWSER_FIXTURE_TASK_TITLES,
} from '@tests/helpers/db/seed-local-product-fixtures';

export const TASK_PROGRESS_SMOKE_FIXTURE = {
  planId: LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID,
  moduleId: LOCAL_PRODUCT_BROWSER_FIXTURE_MODULE_ONE_ID,
  planTopic: LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_TOPIC,
  moduleTitle: 'Navigation batching basics',
  tasks: LOCAL_PRODUCT_BROWSER_FIXTURE_TASK_TITLES,
} as const;

export function fixturePlanPath(): string {
  return `/plans/${TASK_PROGRESS_SMOKE_FIXTURE.planId}`;
}

export function fixtureModulePath(): string {
  return `/plans/${TASK_PROGRESS_SMOKE_FIXTURE.planId}/modules/${TASK_PROGRESS_SMOKE_FIXTURE.moduleId}`;
}
