import { describe, expect, it, vi } from 'vitest';
import { throwPlanCreationFailureError } from '@/app/api/v1/plans/plan-creation-failure';
import type {
	PermanentFailure,
	RetryableFailure,
} from '@/features/plans/lifecycle/types';
import { AppError } from '@/lib/api/errors';

vi.mock('@/lib/logging/logger', () => ({
	logger: {
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Lazy import so the mock is active when the module loads
const { logger } = await import('@/lib/logging/logger');

describe('throwPlanCreationFailureError', () => {
	const cases: {
		label: string;
		input: PermanentFailure | RetryableFailure;
		expectedStatus: number;
		expectedCode: string;
	}[] = [
		{
			label: 'validation → 400 PLAN_CREATION_VALIDATION_FAILED',
			input: {
				status: 'permanent_failure',
				classification: 'validation',
				error: new Error('bad input'),
			},
			expectedStatus: 400,
			expectedCode: 'PLAN_CREATION_VALIDATION_FAILED',
		},
		{
			label: 'capped → 403 PLAN_CREATION_CAPPED',
			input: {
				status: 'permanent_failure',
				classification: 'capped',
				error: new Error('capped'),
			},
			expectedStatus: 403,
			expectedCode: 'PLAN_CREATION_CAPPED',
		},
		{
			label: 'conflict → 409 PLAN_CREATION_CONFLICT',
			input: {
				status: 'retryable_failure',
				classification: 'conflict',
				error: new Error('conflict'),
			},
			expectedStatus: 409,
			expectedCode: 'PLAN_CREATION_CONFLICT',
		},
		{
			label: 'rate_limit → 429 PLAN_CREATION_RATE_LIMITED',
			input: {
				status: 'retryable_failure',
				classification: 'rate_limit',
				error: new Error('rate limited'),
			},
			expectedStatus: 429,
			expectedCode: 'PLAN_CREATION_RATE_LIMITED',
		},
		{
			label: 'timeout → 504 PLAN_CREATION_TIMEOUT',
			input: {
				status: 'retryable_failure',
				classification: 'timeout',
				error: new Error('timed out'),
			},
			expectedStatus: 504,
			expectedCode: 'PLAN_CREATION_TIMEOUT',
		},
		{
			label: 'provider_error → 503 PLAN_CREATION_PROVIDER_ERROR',
			input: {
				status: 'retryable_failure',
				classification: 'provider_error',
				error: new Error('provider down'),
			},
			expectedStatus: 503,
			expectedCode: 'PLAN_CREATION_PROVIDER_ERROR',
		},
		{
			label: 'unknown (permanent) → 500 PLAN_CREATION_FAILED',
			input: {
				status: 'permanent_failure',
				classification: 'unknown',
				error: new Error('???'),
			},
			expectedStatus: 500,
			expectedCode: 'PLAN_CREATION_FAILED',
		},
		{
			label: 'unknown (retryable) → 500 PLAN_CREATION_FAILED',
			input: {
				status: 'retryable_failure',
				classification: 'unknown',
				error: new Error('???'),
			},
			expectedStatus: 500,
			expectedCode: 'PLAN_CREATION_FAILED',
		},
	];

	it.each(cases)('maps $label', ({ input, expectedStatus, expectedCode }) => {
		expect(() => throwPlanCreationFailureError(input)).toThrow(AppError);

		try {
			throwPlanCreationFailureError(input);
		} catch (e) {
			expect(e).toBeInstanceOf(AppError);
			const appErr = e as AppError;
			expect(appErr.status()).toBe(expectedStatus);
			expect(appErr.code()).toBe(expectedCode);
		}
	});

	it('preserves the original error message', () => {
		const input: PermanentFailure = {
			status: 'permanent_failure',
			classification: 'validation',
			error: new Error('field X is required'),
		};

		try {
			throwPlanCreationFailureError(input);
		} catch (e) {
			expect((e as AppError).message).toBe('field X is required');
		}
	});

	it('logs a warning with status, classification, and error message', () => {
		const input: RetryableFailure = {
			status: 'retryable_failure',
			classification: 'timeout',
			error: new Error('timed out'),
		};

		try {
			throwPlanCreationFailureError(input);
		} catch {
			// expected throw
		}

		expect(logger.warn).toHaveBeenCalledWith(
			{
				status: 'retryable_failure',
				classification: 'timeout',
				error: 'timed out',
			},
			'Plan creation failure',
		);
	});

	it('throws an instance of AppError', () => {
		const input: PermanentFailure = {
			status: 'permanent_failure',
			classification: 'capped',
			error: new Error('capped'),
		};

		expect(() => throwPlanCreationFailureError(input)).toThrow(AppError);
	});

	it('passes cause to AppError for error chaining', () => {
		const original = new Error('root cause');
		const input: PermanentFailure = {
			status: 'permanent_failure',
			classification: 'validation',
			error: original,
		};

		try {
			throwPlanCreationFailureError(input);
		} catch (e) {
			expect((e as AppError).cause).toBe(original);
		}
	});

	it('sets classification on AppError (omits for unknown)', () => {
		const knownInput: PermanentFailure = {
			status: 'permanent_failure',
			classification: 'validation',
			error: new Error('bad'),
		};

		try {
			throwPlanCreationFailureError(knownInput);
		} catch (e) {
			expect((e as AppError).classification()).toBe('validation');
		}

		const unknownInput: PermanentFailure = {
			status: 'permanent_failure',
			classification: 'unknown',
			error: new Error('???'),
		};

		try {
			throwPlanCreationFailureError(unknownInput);
		} catch (e) {
			expect((e as AppError).classification()).toBeUndefined();
		}
	});
});
