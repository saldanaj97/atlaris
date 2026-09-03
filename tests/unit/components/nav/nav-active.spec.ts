import {
  isNavItemActive,
  normalizeNavPathname,
} from '@/components/shared/nav/nav-active';
import { describe, expect, it } from 'vitest';

describe('normalizeNavPathname', () => {
  it('keeps the root slash', () => {
    expect(normalizeNavPathname('/')).toBe('/');
  });

  it('strips a trailing slash on marketing routes', () => {
    expect(normalizeNavPathname('/landing/')).toBe('/landing');
    expect(normalizeNavPathname('/pricing/')).toBe('/pricing');
    expect(normalizeNavPathname('/about/')).toBe('/about');
  });
});

describe('isNavItemActive', () => {
  it('treats a trailing slash as the same route', () => {
    expect(
      isNavItemActive('/landing/', { href: '/landing', label: 'Home' }),
    ).toBe(true);
    expect(isNavItemActive('/about/', { href: '/about', label: 'About' })).toBe(
      true,
    );
  });
});
