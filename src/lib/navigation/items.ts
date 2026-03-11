import { ROUTES } from './routes';

/**
 * Navigation configuration for authenticated and unauthenticated users.
 *
 * Authenticated users see: Dashboard, Plans, Analytics, Settings
 * Unauthenticated users see: Home, Pricing, About
 */

export type NavItem = {
  label: string;
  href: string;
  dropdown?: Array<{
    label: string;
    href: string;
  }>;
};

/**
 * Navigation items for authenticated users.
 */
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
    dropdown: [
      { label: 'Usage', href: ROUTES.ANALYTICS.USAGE },
      { label: 'Achievements', href: ROUTES.ANALYTICS.ACHIEVEMENTS },
    ],
  },
  {
    label: 'Settings',
    href: ROUTES.SETTINGS.ROOT,
  },
];

/**
 * Navigation items for unauthenticated users.
 */
export const unauthenticatedNavItems: NavItem[] = [
  { label: 'Home', href: ROUTES.HOME },
  { label: 'Pricing', href: ROUTES.PRICING },
  { label: 'About', href: ROUTES.ABOUT },
];
