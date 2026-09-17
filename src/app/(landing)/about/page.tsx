import type { Metadata } from 'next';

import { About } from '@/app/(landing)/about/components/About';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';

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

export default function AboutPage() {
  return <About />;
}
