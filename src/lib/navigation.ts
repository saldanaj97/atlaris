/**
 * Navigation configuration for authenticated and unauthenticated users.
 *
 * Authenticated users see: Dashboard, Plans, Analytics, Settings
 * Unauthenticated users see: Home, Pricing, About
 */

export type NavItem = {
  label: string;
  href: string;
  highlight?: boolean;
  dropdown?: Array<{
    label: string;
    href: string;
    highlight?: boolean;
  }>;
};

/**
 * Navigation items for authenticated users.
 */
export const authenticatedNavItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    // dropdown: [
    //   { label: 'Create a Plan', href: '/plans/new' },
    //   { label: 'My Plans', href: '/plans' },
    //   { label: 'Calendar', href: '/calendar' },
    // ],
  },
  {
    label: 'Plans',
    href: '/plans',
  },
  {
    label: 'Analytics',
    href: '/analytics',
    dropdown: [
      { label: 'Usage', href: '/analytics/usage' },
      { label: 'Achievements', href: '/analytics/achievements' },
    ],
  },
  {
    label: 'Settings',
    href: '/settings',
  },
];

/**
 * Navigation items for unauthenticated users.
 */
export const unauthenticatedNavItems: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
];
