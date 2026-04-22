import { NeonAuthUIProvider } from '@neondatabase/auth/react';
import type { Metadata } from 'next';
import { Work_Sans, Young_Serif } from 'next/font/google';
import type { ComponentProps } from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/app/ThemeProvider';
import SiteFooter from '@/components/shared/SiteFooter';
import SiteHeader from '@/components/shared/SiteHeader';
import { authClient } from '@/lib/auth/client';
import './globals.css';

// `@neondatabase/auth` (alpha) bundles types from `better-auth@1.4.6` while we
// run the patched `~1.4.22` (closes GHSA two-factor cookie-cache bypass). The
// runtime API is identical inside the 1.4.x line; only the static type for
// `useActiveMember` shifted from a function to a nanostores atom. Cast at the
// boundary so the type system doesn't block a security patch we want shipped.
type NeonAuthUIProviderAuthClient = ComponentProps<
	typeof NeonAuthUIProvider
>['authClient'];

const workSans = Work_Sans({
	subsets: ['latin'],
	variable: '--font-work-sans',
});

const youngSerif = Young_Serif({
	subsets: ['latin'],
	weight: '400',
	variable: '--font-young-serif',
});

export const metadata: Metadata = {
	title: 'Atlaris - AI-Powered Learning Paths',
	description:
		'Create personalized learning plans with AI-generated modules and tasks. Track progress, sync to Google Calendar, and learn smarter.',
	openGraph: {
		title: 'Atlaris - AI-Powered Learning Paths',
		description:
			'Create personalized learning plans with AI-generated modules and tasks. Track progress, sync to Google Calendar, and learn smarter.',
		images: [
			{ url: '/og-default.jpg', width: 1200, height: 630, alt: 'Atlaris' },
			{
				url: '/og-landing.jpg',
				width: 1200,
				height: 630,
				alt: 'Atlaris Landing',
			},
		],
		type: 'website',
		siteName: 'Atlaris',
	},
	twitter: {
		card: 'summary_large_image',
		title: 'Atlaris - AI-Powered Learning Paths',
		description:
			'Create personalized learning plans with AI-generated modules and tasks.',
		images: ['/og-default.jpg'],
		site: '@atlarisapp',
		creator: '@atlarisapp',
	},
	metadataBase: new URL('https://atlaris.app'),
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${workSans.variable} ${youngSerif.variable} ${workSans.className} flex min-h-screen w-full flex-col antialiased`}
			>
				<NeonAuthUIProvider
					authClient={authClient as unknown as NeonAuthUIProviderAuthClient}
					redirectTo="/dashboard"
					emailOTP
					social={{ providers: ['google'] }}
					account={{
						basePath: '/settings',
						fields: ['image', 'name'],
						viewPaths: { SETTINGS: 'profile' },
					}}
				>
					<ThemeProvider>
						<SiteHeader />
						<main className="flex-1 pt-16">{children}</main>
						<Toaster />
						<SiteFooter />
					</ThemeProvider>
				</NeonAuthUIProvider>
			</body>
		</html>
	);
}
