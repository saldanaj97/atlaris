import { RevealAnimation } from './RevealAnimation';
import { SectionOverline } from '@/components/ui/section-overline';
import { BarChart3, BookOpen, Route } from 'lucide-react';
import Image from 'next/image';

import styles from './landing.module.css';

const EXPERIENCE_POINTS = [
  {
    title: 'Structured learning paths',
    copy: 'Step-by-step routes built for real outcomes.',
    icon: Route,
  },
  {
    title: 'Curated resources',
    copy: 'High-quality materials, all in one place.',
    icon: BookOpen,
  },
  {
    title: 'Track your progress',
    copy: 'Stay oriented with a clear view of your journey.',
    icon: BarChart3,
  },
] as const;

export function DriftSection() {
  return (
    <section
      className='mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-drift-heading'
    >
      <RevealAnimation>
        <div className='grid items-center gap-12 md:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] md:gap-14 lg:gap-20'>
          <div className={styles.revealFromLeft}>
            <SectionOverline className='justify-start'>
              The Atlaris experience
            </SectionOverline>
            <h2
              id='landing-drift-heading'
              className='mt-5 max-w-[14ch] font-serif text-3xl leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-foreground sm:text-4xl'
            >
              A clearer way to learn{' '}
              <span className='text-primary italic'>and grow.</span>
            </h2>
            <p className='mt-6 max-w-md font-sans text-base leading-relaxed text-muted-foreground'>
              You&apos;ve started before. The course, the book, the
              certification. Atlaris holds the route with structured learning
              paths, curated resources, and progress tracking.
            </p>
            <ul className='mt-8 space-y-4'>
              {EXPERIENCE_POINTS.map(
                ({ title, copy: pointCopy, icon: Icon }) => (
                  <li key={title} className='flex items-start gap-3'>
                    <span className='grid size-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-card/70 text-primary'>
                      <Icon className='size-4' aria-hidden='true' />
                    </span>
                    <span>
                      <span className='block font-serif text-sm font-semibold text-foreground'>
                        {title}
                      </span>
                      <span className='mt-1 block text-sm leading-relaxed text-muted-foreground'>
                        {pointCopy}
                      </span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>

          <LandingPreview
            src='/previews/landing-dashboard-preview.svg'
            alt=''
            caption='Illustrative dashboard example showing a learning route, current focus, and progress context.'
            className={styles.revealFromRight}
          />
        </div>
      </RevealAnimation>
    </section>
  );
}

export function LandingPreview({
  src,
  alt,
  caption,
  className,
}: {
  src: string;
  alt: string;
  caption: string;
  className?: string;
}) {
  return (
    <figure
      className={`relative aspect-[4/3] w-full overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/80 p-2 shadow-xl shadow-black/10 sm:p-3 ${styles.previewFrame} ${className ?? ''}`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes='(max-width: 767px) 100vw, 60vw'
        className='rounded-[1rem] object-contain'
        unoptimized
      />
      <figcaption className='sr-only'>{caption}</figcaption>
    </figure>
  );
}
