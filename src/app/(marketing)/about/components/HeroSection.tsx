import type { JSX } from 'react';

import { Badge } from '@/components/ui/badge';
import { useId } from 'react';

export function HeroSection(): JSX.Element {
  const headingId = useId();

  return (
    <section className='relative py-24 lg:py-32' aria-labelledby={headingId}>
      <div className='relative z-10 mx-auto max-w-screen-xl px-6 text-center'>
        <Badge variant='glassmorphic' className='mb-6 px-4 py-2'>
          <span className='mr-2 size-2 rounded-full bg-linear-to-r from-primary to-accent' />
          About Atlaris
        </Badge>

        <h1
          id={headingId}
          className='marketing-h1 mx-auto max-w-4xl text-foreground'
        >
          Learning plans built for{' '}
          <span className='gradient-text'>real schedules</span>
        </h1>

        <p className='marketing-subtitle mx-auto mt-6 max-w-2xl'>
          We help learners turn ambitious goals into structured, calendar-backed
          plans — with modules, resources, and progress tracking in one place.
        </p>
      </div>
    </section>
  );
}
