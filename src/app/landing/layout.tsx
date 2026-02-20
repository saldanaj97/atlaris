import { type Metadata } from 'next';

const LANDING_CANONICAL_TITLE =
  'Atlaris — Turn learning goals into a scheduled plan';
const LANDING_DESCRIPTION =
  'Atlaris turns what you want to learn into a time-blocked, resource-linked schedule that syncs directly to Google Calendar or Outlook.';

export const metadata: Metadata = {
  title: LANDING_CANONICAL_TITLE,
  description: LANDING_DESCRIPTION,
  openGraph: {
    title: LANDING_CANONICAL_TITLE,
    description: LANDING_DESCRIPTION,
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
 * Note: This is a nested layout - the root layout already provides <html>, <body>,
 * global providers, fonts, Toaster, and <main>
 */
export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="w-full">{children}</div>;
}
