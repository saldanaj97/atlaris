import type { ReactNode } from 'react';

import { CelestialBackdrop } from '@/app/(landing)/_shared/CelestialBackdrop';
import { LandingPageShell } from '@/app/(landing)/_shared/LandingPageShell';
import { SectionOverline } from '@/components/ui/section-overline';

export const LEGAL_CONTACT_EMAIL = 'business@juansaldana.dev';
export const LEGAL_EFFECTIVE_DATE = 'October 14, 2026';

interface LegalDocumentProps {
  overline: string;
  title: string;
  children: ReactNode;
}

/** Shared marketing chrome for long-form legal pages (Terms, Privacy). */
export function LegalDocument({
  overline,
  title,
  children,
}: LegalDocumentProps): ReactNode {
  return (
    <LandingPageShell>
      <CelestialBackdrop variant='dusk' />
      <article
        className='relative z-10 mx-auto w-full max-w-3xl px-6 pt-12 pb-20 sm:pt-16 md:px-8'
        aria-labelledby='legal-heading'
      >
        <header>
          <SectionOverline>{overline}</SectionOverline>
          <h1
            id='legal-heading'
            className='mt-5 font-serif text-4xl leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:text-5xl'
          >
            {title}
          </h1>
          <p className='mt-4 text-sm text-muted-foreground'>
            Effective and last updated: {LEGAL_EFFECTIVE_DATE}
          </p>
        </header>
        <div className='mt-10 space-y-10'>{children}</div>
      </article>
    </LandingPageShell>
  );
}

interface LegalSectionProps {
  id: string;
  heading: string;
  children: ReactNode;
}

export function LegalSection({
  id,
  heading,
  children,
}: LegalSectionProps): ReactNode {
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className='font-serif text-2xl font-semibold tracking-tight text-foreground'
      >
        {heading}
      </h2>
      <div className='mt-3 space-y-3 font-sans text-base leading-relaxed text-muted-foreground [&_a]:text-link [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-link-hover [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5'>
        {children}
      </div>
    </section>
  );
}

export function LegalContactLink(): ReactNode {
  return <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>;
}
