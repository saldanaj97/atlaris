/**
 * Navigation configuration for authenticated and unauthenticated users.
 *
 * Authenticated users see: Explore, Dashboard (dropdown), Integrations
 * Unauthenticated users see: Explore, Pricing, About
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
 * Dashboard is clickable and has a dropdown with My Plans and Create a Plan.
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
    dropdown: [
      { label: 'Profile', href: '/settings/profile' },
      { label: 'Notifications', href: '/settings/notifications' },
      { label: 'Integrations', href: '/settings/integrations' },
      { label: 'Billing', href: '/settings/billing' },
    ],
  },
];

/**
 * Navigation items for unauthenticated users.
 */
export const unauthenticatedNavItems: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Explore', href: '/explore' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
];
