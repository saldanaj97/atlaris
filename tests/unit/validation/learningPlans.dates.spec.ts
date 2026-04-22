import { format } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onboardingFormSchema } from '@/features/plans/validation/learningPlans';

const FIXED_NOW = new Date('2026-03-09T12:00:00.000Z');

function baseInput() {
	return {
		topic: 'Learning AI',
		skillLevel: 'beginner',
		weeklyHours: 5,
		learningStyle: 'reading',
		notes: undefined as string | undefined,
	};
}

function yyyyMmDd(date: Date) {
	return format(date, 'yyyy-MM-dd');
}

function expectFieldError(
	result: ReturnType<typeof onboardingFormSchema.safeParse>,
	field: 'deadlineDate' | 'startDate',
	messageFragment: string,
) {
	expect(result.success).toBe(false);

	if (result.success) {
		throw new Error('Expected onboardingFormSchema.safeParse to fail');
	}

	const errors = result.error.flatten().fieldErrors[field] ?? [];
	expect(errors.some((message) => message?.includes(messageFragment))).toBe(
		true,
	);
}

describe('onboardingFormSchema date validations', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(FIXED_NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('accepts deadline today', () => {
		const today = new Date();
		const input = {
			...baseInput(),
			deadlineDate: yyyyMmDd(today),
		};
		const result = onboardingFormSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	it('rejects past deadline', () => {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		const input = {
			...baseInput(),
			deadlineDate: yyyyMmDd(yesterday),
		};
		const result = onboardingFormSchema.safeParse(input);
		expectFieldError(result, 'deadlineDate', 'past');
	});

	it('allows empty start date but enforces when provided', () => {
		const input = {
			...baseInput(),
			deadlineDate: yyyyMmDd(new Date()),
			startDate: undefined,
		};
		const result = onboardingFormSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	it('rejects start date in the past when provided', () => {
		const today = new Date();
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		const input = {
			...baseInput(),
			deadlineDate: yyyyMmDd(today),
			startDate: yyyyMmDd(yesterday),
		};
		const result = onboardingFormSchema.safeParse(input);
		expectFieldError(result, 'startDate', 'past');
	});

	it('enforces startDate <= deadlineDate', () => {
		const today = new Date();
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const input = {
			...baseInput(),
			deadlineDate: yyyyMmDd(today),
			startDate: yyyyMmDd(tomorrow),
		};
		const result = onboardingFormSchema.safeParse(input);
		expectFieldError(result, 'startDate', 'on or before');
	});

	it('requires YYYY-MM-DD format', () => {
		const input = {
			...baseInput(),
			deadlineDate: '2025-1-1', // invalid format
		};
		const result = onboardingFormSchema.safeParse(input);
		expectFieldError(result, 'deadlineDate', 'YYYY-MM-DD');
	});

	it('caps deadlines to within 1 year', () => {
		const farFuture = new Date();
		farFuture.setFullYear(farFuture.getFullYear() + 2);
		const input = {
			...baseInput(),
			deadlineDate: yyyyMmDd(farFuture),
		};
		const result = onboardingFormSchema.safeParse(input);
		expectFieldError(result, 'deadlineDate', '1 year');
	});

	it('preserves legacy rollover behavior for impossible calendar dates', () => {
		const input = {
			...baseInput(),
			deadlineDate: '2026-02-30',
		};
		const result = onboardingFormSchema.safeParse(input);
		expectFieldError(result, 'deadlineDate', 'past');
	});
});
