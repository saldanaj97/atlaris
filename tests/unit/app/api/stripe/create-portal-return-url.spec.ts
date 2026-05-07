import { describe, expect, it } from 'vitest';

import { getReturnUrlForLog } from '@/app/api/v1/stripe/create-portal/route';

describe('getReturnUrlForLog', () => {
  it('returns string returnUrl when body is shaped', () => {
    expect(getReturnUrlForLog({ returnUrl: 'https://example.com/x' })).toBe(
      'https://example.com/x',
    );
  });

  it('returns undefined when returnUrl missing or not string', () => {
    expect(getReturnUrlForLog({})).toBeUndefined();
    expect(getReturnUrlForLog({ returnUrl: 1 })).toBeUndefined();
    expect(getReturnUrlForLog(null)).toBeUndefined();
  });
});
