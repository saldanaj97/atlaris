import { describe, expect, it } from 'vitest';

import * as lifecycle from '@/features/plans/lifecycle';

describe('plans lifecycle barrel surface', () => {
	it('exports only the shared lifecycle entry points', () => {
		expect(Object.keys(lifecycle).sort()).toEqual([
			'PlanLifecycleService',
			'createPlanLifecycleService',
			'isRetryableClassification',
		]);
	});
});
