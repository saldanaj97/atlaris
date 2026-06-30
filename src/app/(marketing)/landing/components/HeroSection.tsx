'use client';

import { LiquidGlassButton } from '@/app/(marketing)/_shared/LiquidGlassButton';
import { MarketingHero } from '@/app/(marketing)/_shared/MarketingHero';
import { LandingHeroVisual } from '@/app/(marketing)/landing/components/LandingHeroVisual';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

export function HeroSection() {
  const headingId = useId();

  return (
    <MarketingHero
      variant='landing'
      headingId={headingId}
      title={
        <>
          Turn goals into a{' '}
          <span className='gradient-text'>scheduled plan</span>
        </>
      }
      subtitle='Atlaris builds module-by-module roadmaps and attaches resources to each time-blocked session, with calendar sync coming soon.'
      cta={
        <LiquidGlassButton asChild>
          <Link href='/plans/new'>
            Get started free
            <ArrowRight className='ml-2 size-4 transition-transform group-hover:translate-x-1' />
          </Link>
        </LiquidGlassButton>
      }
      visual={<LandingHeroVisual />}
    />
  );
}
