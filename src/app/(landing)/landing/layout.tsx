import type { Metadata } from 'next';

import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';

const LANDING_CANONICAL_URL = '/landing';
const LANDING_CANONICAL_TITLE =
  'Atlaris — Make space for the work that changes you';
const LANDING_DESCRIPTION =
  'Name a goal. Atlaris charts the plan and remembers where you left off.';

export const metadata: Metadata = {
  title: LANDING_CANONICAL_TITLE,
  description: LANDING_DESCRIPTION,
  openGraph: {
    title: LANDING_CANONICAL_TITLE,
    description: LANDING_DESCRIPTION,
    url: LANDING_CANONICAL_URL,
    images: [OG_DEFAULT_IMAGE],
    type: 'website',
    siteName: 'Atlaris',
  },
  twitter: {
    card: 'summary_large_image',
    title: LANDING_CANONICAL_TITLE,
    description: LANDING_DESCRIPTION,
    images: [OG_DEFAULT_IMAGE.url],
    site: '@atlarisapp',
    creator: '@atlarisapp',
  },
};

/**
 * Nested under `(landing)/layout.tsx`: SiteHeader, flush `<main>`, SiteFooter.
 * Root supplies `<html>`, `<body>`, fonts, auth/theme providers, Toaster.
 */
export default function LandingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
