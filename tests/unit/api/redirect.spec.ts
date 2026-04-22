import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config/env', () => ({
	appEnv: { url: 'https://myapp.com' },
}));

import {
	isValidRedirectUrl,
	resolveRedirectUrl,
} from '@/app/api/v1/stripe/_shared/redirect';

describe('isValidRedirectUrl', () => {
	it.each([
		[undefined, true],
		['', true],
		['/dashboard', true],
		['/success?foo=bar', true],
		['//evil.com', false],
		['//evil.com/path', false],
		['https://myapp.com/success', true],
		['https://evil.com/path', false],
		['http://myapp.com/path', false],
		['javascript:alert(1)', false],
		['data:text/html,<h1>hi</h1>', false],
		['not-a-url', false],
	])('isValidRedirectUrl(%j) → %s', (input, expected) => {
		expect(isValidRedirectUrl(input)).toBe(expected);
	});
});

describe('resolveRedirectUrl', () => {
	it.each([
		[undefined, 'https://myapp.com/default'],
		['/dashboard', 'https://myapp.com/dashboard'],
		['//evil.com', 'https://myapp.com/default'],
		['https://myapp.com/success', 'https://myapp.com/success'],
		['https://evil.com/path', 'https://myapp.com/default'],
	])('resolveRedirectUrl(%j, "/default") → %s', (input, expected) => {
		expect(resolveRedirectUrl(input, '/default')).toBe(expected);
	});
});
