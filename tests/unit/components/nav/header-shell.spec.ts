import {
  desktopHeaderShellClass,
  getHeaderShellVariant,
  headerGlassIntensity,
  headerGlassSurfaceClass,
  mobileHeaderShellClass,
  usesLiquidGlassHeader,
} from '@/components/shared/nav/header-shell';
import { ROUTES } from '@/features/navigation';
import { describe, expect, it } from 'vitest';

describe('header shell variants', () => {
  it('uses glass variants for marketing and protected app routes', () => {
    expect(getHeaderShellVariant(ROUTES.LANDING)).toBe('marketing');
    expect(getHeaderShellVariant('/about')).toBe('marketing');
    expect(getHeaderShellVariant('/pricing')).toBe('pricing');
    expect(getHeaderShellVariant('/dashboard')).toBe('protected');
    expect(getHeaderShellVariant('/plans/plan_123')).toBe('protected');
    expect(getHeaderShellVariant('/settings/billing')).toBe('protected');
    expect(getHeaderShellVariant('/analytics/usage')).toBe('protected');
  });

  it('keeps auth and non-header product surfaces opaque', () => {
    expect(getHeaderShellVariant('/auth/sign-in')).toBe('opaque');
    expect(getHeaderShellVariant('/maintenance')).toBe('opaque');
    expect(getHeaderShellVariant('/api/v1/plans')).toBe('opaque');
  });

  it('maps only opaque routes away from liquid glass', () => {
    expect(usesLiquidGlassHeader('marketing')).toBe(true);
    expect(usesLiquidGlassHeader('pricing')).toBe(true);
    expect(usesLiquidGlassHeader('protected')).toBe(true);
    expect(usesLiquidGlassHeader('opaque')).toBe(false);
  });

  it('uses subtle liquid glass only on pricing', () => {
    expect(headerGlassIntensity('marketing')).toBe('default');
    expect(headerGlassIntensity('protected')).toBe('default');
    expect(headerGlassIntensity('pricing')).toBe('subtle');
  });

  it('keeps protected routes on the rounded glass shell classes', () => {
    expect(desktopHeaderShellClass('protected')).toContain('rounded-2xl');
    expect(desktopHeaderShellClass('protected')).toContain('border-primary/25');
    expect(desktopHeaderShellClass('protected')).toContain(
      'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
    );
    expect(desktopHeaderShellClass('protected')).not.toContain(
      'overflow-hidden',
    );
    expect(mobileHeaderShellClass('protected')).toContain('rounded-2xl');
    expect(mobileHeaderShellClass('protected')).not.toContain(
      'overflow-hidden',
    );
    expect(headerGlassSurfaceClass('protected', 'desktop')).toContain(
      'dark:bg-primary/15',
    );
  });
});
