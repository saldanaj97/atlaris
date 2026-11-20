import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/features/navigation/items';
import { describe, expect, it } from 'vitest';

describe('Navigation', () => {
  it('shows signed-in users Dashboard, Plans, Analytics and Settings without submenus', () => {
    expect(authenticatedNavItems).toEqual([
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Plans', href: '/plans' },
      { label: 'Analytics', href: '/analytics' },
      { label: 'Settings', href: '/settings' },
    ]);
  });

  it('shows signed-out users Home and Pricing only', () => {
    expect(unauthenticatedNavItems).toEqual([
      { label: 'Home', href: '/landing' },
      { label: 'Pricing', href: '/pricing' },
    ]);
  });
});
