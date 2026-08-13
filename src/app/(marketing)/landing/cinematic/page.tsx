import type { Metadata } from 'next';

import { CinematicAtlasHero } from '@/app/(marketing)/landing/components/CinematicAtlasHero';

export const metadata: Metadata = {
  title: 'Atlaris — A map for the quiet hours',
  description:
    'Name a goal and the hours you actually have. Atlaris charts a week-by-week plan for the quiet hours.',
};

export default function CinematicLandingPage() {
  return <CinematicAtlasHero />;
}
