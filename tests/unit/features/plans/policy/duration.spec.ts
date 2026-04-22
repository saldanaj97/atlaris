import { describe, expect, it } from 'vitest';
import {
	calculateTotalWeeks,
	checkPlanDurationCap,
	normalizePlanDurationForTier,
} from '@/features/plans/policy/duration';

describe('calculateTotalWeeks', () => {
	it('returns default weeks when no deadline', () => {
		expect(
			calculateTotalWeeks({
				startDate: '2025-01-01',
				deadlineDate: null,
				today: new Date('2025-01-15T12:00:00Z'),
				defaultWeeks: 4,
			}),
		).toBe(4);
	});

	it('computes weeks from start to deadline in UTC', () => {
		expect(
			calculateTotalWeeks({
				startDate: '2025-01-01',
				deadlineDate: '2025-01-22',
				today: new Date('2025-01-01T12:00:00Z'),
			}),
		).toBe(3);
	});

	it('returns at least 1 week for same-day start and deadline', () => {
		expect(
			calculateTotalWeeks({
				startDate: '2025-01-01',
				deadlineDate: '2025-01-01',
				today: new Date('2025-01-01T12:00:00Z'),
			}),
		).toBe(1);
	});
});

describe('normalizePlanDurationForTier', () => {
	it('clamps deadline by maxWeeks for free tier', () => {
		const res = normalizePlanDurationForTier({
			tier: 'free',
			weeklyHours: 5,
			startDate: '2025-01-01',
			deadlineDate: '2025-06-01',
			today: new Date('2025-01-01T12:00:00Z'),
		});
		expect(res.startDate).toBe('2025-01-01');
		expect(res.deadlineDate).toBe('2025-01-15');
		expect(res.totalWeeks).toBe(2);
	});

	it('returns null start when no startDate passed', () => {
		const res = normalizePlanDurationForTier({
			tier: 'pro',
			weeklyHours: 10,
			deadlineDate: null,
			today: new Date('2025-01-15T12:00:00Z'),
		});
		expect(res.startDate).toBeNull();
	});
});

describe('checkPlanDurationCap', () => {
	it('blocks free > 2 weeks', () => {
		const weeks = 3;
		const res = checkPlanDurationCap({
			tier: 'free',
			weeklyHours: 5,
			totalWeeks: weeks,
		});
		expect(res.allowed).toBe(false);
		expect(res.reason).toMatch(/2-week/);
		expect(res.upgradeUrl).toBe('/pricing');
	});

	it('allows free == 2 weeks', () => {
		const res = checkPlanDurationCap({
			tier: 'free',
			weeklyHours: 5,
			totalWeeks: 2,
		});
		expect(res.allowed).toBe(true);
	});

	it('allows pro unlimited', () => {
		const res = checkPlanDurationCap({
			tier: 'pro',
			weeklyHours: 10,
			totalWeeks: 52,
		});
		expect(res.allowed).toBe(true);
	});

	it('blocks starter > 8 weeks', () => {
		const res = checkPlanDurationCap({
			tier: 'starter',
			weeklyHours: 5,
			totalWeeks: 9,
		});
		expect(res.allowed).toBe(false);
		expect(res.reason).toMatch(/8-week/);
		expect(res.upgradeUrl).toBe('/pricing');
	});

	it('allows starter == 8 weeks', () => {
		const res = checkPlanDurationCap({
			tier: 'starter',
			weeklyHours: 5,
			totalWeeks: 8,
		});
		expect(res.allowed).toBe(true);
	});

	it('allows starter < 8 weeks', () => {
		const res = checkPlanDurationCap({
			tier: 'starter',
			weeklyHours: 5,
			totalWeeks: 4,
		});
		expect(res.allowed).toBe(true);
	});

	it('returns upgradeUrl when blocked', () => {
		const res = checkPlanDurationCap({
			tier: 'free',
			weeklyHours: 5,
			totalWeeks: 3,
		});
		expect(res.allowed).toBe(false);
		expect(res.upgradeUrl).toBe('/pricing');
	});

	it('returns correct recommendation for plans > 8 weeks', () => {
		const res = checkPlanDurationCap({
			tier: 'free',
			weeklyHours: 5,
			totalWeeks: 10,
		});
		expect(res.allowed).toBe(false);
		expect(res.reason).toMatch(/starter/);
	});

	it('returns correct recommendation for plans <= 8 weeks', () => {
		const res = checkPlanDurationCap({
			tier: 'free',
			weeklyHours: 5,
			totalWeeks: 5,
		});
		expect(res.allowed).toBe(false);
		expect(res.reason).toMatch(/starter/);
	});
});
