import { describe, expect, it } from 'vitest';
import { getLoggableErrorDetails, normalizeThrown } from '@/lib/errors';

class CustomTestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CustomTestError';
	}
}

describe('thrown normalization helpers', () => {
	describe('normalizeThrown', () => {
		it('returns Error instances unchanged', () => {
			const err = new Error('x');
			expect(normalizeThrown(err)).toBe(err);
		});

		it('maps plain objects with message', () => {
			expect(normalizeThrown({ message: 'm' })).toEqual({ message: 'm' });
			expect(normalizeThrown({ message: 'm', name: 'N' })).toEqual({
				message: 'm',
				name: 'N',
			});
		});

		it('drops non-string names from plain objects', () => {
			expect(normalizeThrown({ message: 'm', name: 123 })).toEqual({
				message: 'm',
			});
		});

		it.each([
			[42, { message: '42' }],
			[false, { message: 'false' }],
			['', { message: '' }],
			[Number.NaN, { message: 'NaN' }],
			[Number.POSITIVE_INFINITY, { message: 'Infinity' }],
			[null, { message: 'null' }],
			[undefined, { message: 'undefined' }],
			[[1, 'x'], { message: '[1,"x"]' }],
		])('maps unknown value %p via core message', (value, expected) => {
			expect(normalizeThrown(value)).toEqual(expected);
		});

		it('maps function and symbol throws to message-bearing objects', () => {
			const functionResult = normalizeThrown(function namedFn() {});
			expect(functionResult).toHaveProperty('message');
			expect(typeof functionResult.message).toBe('string');

			const symbolResult = normalizeThrown(Symbol.for('token'));
			expect(symbolResult).toHaveProperty('message');
			expect(typeof symbolResult.message).toBe('string');
		});
	});

	describe('getLoggableErrorDetails', () => {
		it('extracts message and stack from Error', () => {
			const err = new CustomTestError('boom');
			expect(getLoggableErrorDetails(err)).toEqual({
				errorMessage: 'boom',
				errorStack: err.stack,
			});
		});

		it('uses message and stack from plain objects when present', () => {
			expect(
				getLoggableErrorDetails({
					message: 'm',
					stack: 's',
				}),
			).toEqual({ errorMessage: 'm', errorStack: 's' });
		});

		it('omits errorStack when plain objects only provide a message', () => {
			const details = getLoggableErrorDetails({ message: 'm' });
			expect(details).toEqual({ errorMessage: 'm' });
			expect(details).not.toHaveProperty('errorStack');
		});

		it('uses Unknown error object when only stack is present', () => {
			const details = getLoggableErrorDetails({ stack: 'only-stack' });
			expect(details).toEqual({
				errorMessage: 'Unknown error object',
				errorStack: 'only-stack',
			});
			expect(details).toHaveProperty('errorStack', 'only-stack');
		});

		it('stringifies plain objects without message/stack via safe serializer', () => {
			const details = getLoggableErrorDetails({ a: 1 });
			expect(details).toEqual({
				errorMessage: '{"a":1}',
			});
			expect(details).not.toHaveProperty('errorStack');
		});

		it('serializes circular objects instead of failing', () => {
			const obj: Record<string, unknown> = { a: 1 };
			obj.self = obj;
			expect(getLoggableErrorDetails(obj).errorMessage).toBe(
				'{"a":1,"self":"[Circular]"}',
			);
		});
	});
});
