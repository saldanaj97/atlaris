import type { JSX } from 'react';

import { MarketingHero } from '@/app/(marketing)/_shared/MarketingHero';
import { Badge } from '@/components/ui/badge';
import { useId } from 'react';

export function HeroSection(): JSX.Element {
  const headingId = useId();

  return (
    <MarketingHero
      headingId={headingId}
      badge={
        <Badge variant='glassmorphic' className='px-4 py-2'>
          <span className='mr-2 size-2 rounded-full bg-linear-to-r from-primary to-accent' />
          About Atlaris
        </Badge>
      }
      title={
        <>
          Learning plans built for{' '}
          <span className='gradient-text'>real schedules</span>
        </>
      }
      subtitle='We help learners turn ambitious goals into structured, calendar-backed plans — with modules, resources, and progress tracking in one place.'
    />
  );
}
