import type { Metadata } from 'next';

import { resolveAboutPageEnabled } from '@/app/(landing)/about/about-flag';
import { About } from '@/app/(landing)/about/components/About';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

const ABOUT_TITLE = 'About | Atlaris';
const ABOUT_DESCRIPTION =
  'Why Atlaris borrows the night sky, and what the AI does and does not do when it charts your plan.';

export const metadata: Metadata = {
  title: ABOUT_TITLE,
  description: ABOUT_DESCRIPTION,
  openGraph: {
    title: ABOUT_TITLE,
    description: ABOUT_DESCRIPTION,
    url: '/about',
    images: [OG_DEFAULT_IMAGE],
    type: 'website',
    siteName: 'Atlaris',
  },
  twitter: {
    card: 'summary_large_image',
    title: ABOUT_TITLE,
    description: ABOUT_DESCRIPTION,
    images: [OG_DEFAULT_IMAGE.url],
    site: '@atlarisapp',
    creator: '@atlarisapp',
  },
};

/** Retired: answers 404 unless the `about-page` flag is on. The code stays. */
export default async function AboutPage() {
  // Read the flag per request, not once at build time.
  await connection();
  if (!(await resolveAboutPageEnabled())) notFound();
  return <About />;
}
