import { getSupportedLocale } from '@/lib/i18n/locale';
import { describe, expect, it } from 'vitest';

describe('getSupportedLocale', () => {
  it('returns the first supported locale from Accept-Language', () => {
    expect(getSupportedLocale('fr-CA, en-US;q=0.9')).toBe('fr-CA');
  });

  it('ignores malformed locale tags without throwing', () => {
    expect(() => getSupportedLocale('en_US, *, en-US;q=0.9')).not.toThrow();
    expect(getSupportedLocale('en_US, *, en-US;q=0.9')).toBe('en-US');
  });
});
