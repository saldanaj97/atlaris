import type { Metadata } from 'next';

import { LANDING_CANONICAL_TITLE, LANDING_DESCRIPTION } from './layout';
import { Landing } from '@/app/(marketing)/landing/components/Landing';

export const metadata: Metadata = {
  title: LANDING_CANONICAL_TITLE,
  description: LANDING_DESCRIPTION,
};

export default function LandingPage() {
  return <Landing />;
}
