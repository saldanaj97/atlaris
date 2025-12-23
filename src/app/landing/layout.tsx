import { type Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Atlaris - Turn Learning Goals into Scheduled Action',
  description:
    'Pathfinder turns what you want to learn into a time-blocked, resource-linked schedule that syncs directly to Google Calendar, Notion, or Outlook.',
  openGraph: {
    title: "Atlaris - Your learning plan isn't the problem. Your calendar is.",
    description:
      'Pathfinder turns what you want to learn into a time-blocked, resource-linked schedule that syncs directly to Google Calendar, Notion, or Outlook.',
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
    title: 'Atlaris - Turn Learning Goals into Scheduled Action',
    description:
      'Pathfinder turns what you want to learn into a time-blocked schedule that syncs to your calendar.',
    images: ['/og-landing.jpg'],
  },
};

/**
 * Note: This is a nested layout - the root layout already provides <html>, <body>,
 * ClerkProvider, fonts, Toaster, and ScrapbookDesignFilters.
 */
export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
