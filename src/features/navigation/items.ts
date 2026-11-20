import type { NavItem } from './navigation.types';

import { ROUTES } from './routes';

export const authenticatedNavItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: ROUTES.DASHBOARD,
  },
  {
    label: 'Plans',
    href: ROUTES.PLANS.ROOT,
  },
  {
    label: 'Analytics',
    href: ROUTES.ANALYTICS.ROOT,
  },
  {
    label: 'Settings',
    href: ROUTES.SETTINGS.ROOT,
  },
];

export const unauthenticatedNavItems: NavItem[] = [
  { label: 'Home', href: ROUTES.LANDING },
  { label: 'Pricing', href: ROUTES.PRICING },
];
