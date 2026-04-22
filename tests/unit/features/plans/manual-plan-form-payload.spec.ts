import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanFormData } from '@/features/plans/plan-form.types';

const { mockMapOnboardingToCreateInput } = vi.hoisted(() => ({
	mockMapOnboardingToCreateInput: vi.fn(),
}));

vi.mock('@/features/plans/create-mapper', () => ({
	mapOnboardingToCreateInput: mockMapOnboardingToCreateInput,
}));

import { buildManualCreatePayloadFromPlanForm } from '@/features/plans/manual-plan-form-payload';

const baseFormData: PlanFormData = {
	topic: 'TypeScript',
	skillLevel: 'beginner',
	weeklyHours: '5',
	learningStyle: 'mixed',
	deadlineWeeks: '2',
};

describe('buildManualCreatePayloadFromPlanForm', () => {
	beforeEach(() => {
		mockMapOnboardingToCreateInput.mockReset();
	});

	it('normalizes mapper errors into a structured payload error', () => {
		mockMapOnboardingToCreateInput.mockImplementation(() => {
			throw new Error('validation failed');
		});

		const result = buildManualCreatePayloadFromPlanForm(baseFormData);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toEqual(
				expect.objectContaining({
					message: 'validation failed',
					name: 'Error',
					stack: expect.any(String),
				}),
			);
		}
	});

	it('normalizes non-Error failures into a structured payload error', () => {
		mockMapOnboardingToCreateInput.mockImplementation(() => {
			throw 'boom';
		});

		expect(buildManualCreatePayloadFromPlanForm(baseFormData)).toEqual({
			ok: false,
			error: {
				message: 'boom',
				name: 'Error',
			},
		});
	});
});
