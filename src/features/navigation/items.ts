import type { NavItem } from './navigation.types';
import { ROUTES } from './routes';

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
