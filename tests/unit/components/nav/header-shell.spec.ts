import {
  desktopHeaderShellClass,
  getHeaderShellVariant,
  isMarketingHeaderChrome,
  mobileHeaderShellClass,
} from '@/components/shared/nav/header-shell';
import { ROUTES } from '@/features/navigation';
import { describe, expect, it } from 'vitest';

describe('header shell variants', () => {
  it('maps marketing and protected app routes to their header variants', () => {
    expect(getHeaderShellVariant(ROUTES.LANDING)).toBe('marketing');
    expect(getHeaderShellVariant('/pricing')).toBe('pricing');
    expect(getHeaderShellVariant('/dashboard')).toBe('protected');
    expect(getHeaderShellVariant('/plans/plan_123')).toBe('protected');
    expect(getHeaderShellVariant('/settings')).toBe('protected');
    expect(getHeaderShellVariant('/analytics/usage')).toBe('protected');
  });

  it('treats marketing and pricing as marketing chrome surfaces', () => {
    expect(isMarketingHeaderChrome('marketing')).toBe(true);
    expect(isMarketingHeaderChrome('pricing')).toBe(true);
    expect(isMarketingHeaderChrome('protected')).toBe(false);
    expect(isMarketingHeaderChrome('opaque')).toBe(false);
  });

  it('keeps auth and non-header product surfaces opaque', () => {
    expect(getHeaderShellVariant('/about')).toBe('opaque');
    expect(getHeaderShellVariant('/auth/sign-in')).toBe('opaque');
    expect(getHeaderShellVariant('/maintenance')).toBe('opaque');
    expect(getHeaderShellVariant('/api/v1/plans')).toBe('opaque');
  });

  it('keeps the full-bleed flat bar shell without floating pill chrome', () => {
    expect(desktopHeaderShellClass('protected')).toContain('h-16');
    expect(desktopHeaderShellClass('protected')).toContain(
      'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
    );
    expect(desktopHeaderShellClass('protected')).not.toContain('rounded-2xl');
    expect(mobileHeaderShellClass('protected')).toContain('h-16');
    expect(mobileHeaderShellClass('protected')).not.toContain('rounded-2xl');
  });
});
