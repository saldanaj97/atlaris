'use client';

import { marketingPrimaryCtaClassName } from '@/app/(marketing)/_shared/marketing-cta';
import { MarketingHero } from '@/app/(marketing)/_shared/MarketingHero';
import { LandingHeroVisual } from '@/app/(marketing)/landing/components/LandingHeroVisual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

export function HeroSection() {
  const headingId = useId();

  return (
    <MarketingHero
      variant='landing'
      headingId={headingId}
      badge={
        <Badge variant='glassmorphic' className='px-4 py-2'>
          <span className='mr-2 size-2 rounded-full bg-linear-to-r from-primary to-accent' />
          Learning plans that land on your calendar
        </Badge>
      }
      title={
        <>
          Turn goals into a{' '}
          <span className='gradient-text'>scheduled plan</span>
        </>
      }
      subtitle='Atlaris builds module-by-module roadmaps, attaches resources to each session, and is built to sync your study blocks to your calendar (coming soon).'
      cta={
        <Button
          asChild
          variant='default'
          className={marketingPrimaryCtaClassName}
        >
          <Link href='/plans/new'>
            Get started free
            <ArrowRight className='ml-2 size-4 transition-transform group-hover:translate-x-1' />
          </Link>
        </Button>
      }
      visual={<LandingHeroVisual />}
    />
  );
}
