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
  { label: 'Home', href: '/' },
  { label: 'Explore', href: '/explore' },
  // {
  //   label: 'Plans',
  //   href: '',
  //   dropdown: [
  //     { label: 'My Plans', href: '/dashboard' },
  //     { label: 'Create a Plan', href: '/plans/new', highlight: true },
  //   ],
  // },
  { label: 'Integrations', href: '/integrations' },
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
