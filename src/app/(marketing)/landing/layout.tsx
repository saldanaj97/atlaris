import type { Metadata } from 'next';

export const LANDING_CANONICAL_URL = '/landing';
export const LANDING_CANONICAL_TITLE =
	'Atlaris — Turn learning goals into a scheduled plan';
export const LANDING_DESCRIPTION =
	'Atlaris turns what you want to learn into a time-blocked, resource-linked schedule that syncs directly to Google Calendar or Outlook.';

export const metadata: Metadata = {
	title: LANDING_CANONICAL_TITLE,
	description: LANDING_DESCRIPTION,
	openGraph: {
		title: LANDING_CANONICAL_TITLE,
		description: LANDING_DESCRIPTION,
		url: LANDING_CANONICAL_URL,
		images: [
			{
				url: '/og-landing.jpg',
				width: 1200,
				height: 630,
				alt: 'Atlaris - AI Learning Scheduler',
			},
		],
		type: 'website',
		siteName: 'Atlaris',
	},
	twitter: {
		card: 'summary_large_image',
		title: LANDING_CANONICAL_TITLE,
		description: LANDING_DESCRIPTION,
		images: ['/og-landing.jpg'],
		site: '@atlarisapp',
		creator: '@atlarisapp',
	},
};

/**
 * Nested under `(marketing)/layout.tsx`: SiteHeader, padded `<main>`, SiteFooter.
 * Root supplies `<html>`, `<body>`, fonts, auth/theme providers, Toaster.
 */
export default function LandingLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return <div className="w-full">{children}</div>;
}
