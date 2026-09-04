import type { Metadata } from 'next';

import { About } from '@/app/(marketing)/about/components/About';

const ABOUT_TITLE = 'About | Atlaris';
const ABOUT_DESCRIPTION =
  'Who builds Atlaris, why it borrows the night sky, and what the AI does and does not do when it charts your plan.';

export const metadata: Metadata = {
  title: ABOUT_TITLE,
  description: ABOUT_DESCRIPTION,
  openGraph: {
    title: ABOUT_TITLE,
    description: ABOUT_DESCRIPTION,
    url: '/about',
    images: [
      {
        url: '/og-landing.jpg',
        width: 1200,
        height: 630,
        alt: 'Atlaris',
      },
    ],
    type: 'website',
    siteName: 'Atlaris',
  },
  twitter: {
    card: 'summary_large_image',
    title: ABOUT_TITLE,
    description: ABOUT_DESCRIPTION,
    images: ['/og-landing.jpg'],
    site: '@atlarisapp',
    creator: '@atlarisapp',
  },
};

export default function AboutPage() {
  return <About />;
}
