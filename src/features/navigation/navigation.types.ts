export type NavItem = {
	label: string;
	href: string;
	dropdown?: Array<{
		label: string;
		href: string;
	}>;
};
