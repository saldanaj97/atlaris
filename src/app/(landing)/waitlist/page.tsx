import type { Metadata } from 'next';

import { CelestialBackdrop } from '@/app/(landing)/_shared/CelestialBackdrop';
import { LandingPageShell } from '@/app/(landing)/_shared/LandingPageShell';
import {
  WaitlistForm,
  WaitlistFormPreview,
} from '@/app/(landing)/waitlist/components/WaitlistForm';
import { SectionOverline } from '@/components/ui/section-overline';
import { shouldUseClerkUi } from '@/lib/auth/local-identity';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';

const WAITLIST_TITLE = 'Join the waitlist | Atlaris';
const WAITLIST_DESCRIPTION =
  'Atlaris is opening soon. Join the waitlist and we’ll email your invite when it opens.';

export const metadata: Metadata = {
  title: WAITLIST_TITLE,
  description: WAITLIST_DESCRIPTION,
  openGraph: {
    title: WAITLIST_TITLE,
    description: WAITLIST_DESCRIPTION,
    url: '/waitlist',
    images: [OG_DEFAULT_IMAGE],
  },
};

/** Copy keyed by the auth route the proxy redirected from (`?from=`). */
const COPY_BY_SOURCE = {
  'sign-in': {
    overline: 'Accounts open at launch',
    body: 'Atlaris isn’t open yet, so there’s no account to sign in to. Join the waitlist and we’ll email your invite when it opens.',
  },
  'sign-up': {
    overline: 'Sign-ups open soon',
    body: 'Atlaris isn’t open yet. Join the waitlist and we’ll email your invite when it opens.',
  },
  default: {
    overline: 'Opening soon',
    body: 'Atlaris is getting ready to open. Join the waitlist and we’ll email your invite when it does.',
  },
} as const;

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { from } = await searchParams;
  const copy =
    from === 'sign-in' || from === 'sign-up'
      ? COPY_BY_SOURCE[from]
      : COPY_BY_SOURCE.default;

  return (
    <LandingPageShell>
      <CelestialBackdrop variant='dusk' />
      <section
        aria-labelledby='waitlist-heading'
        className='relative z-10 mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-6 py-16 text-center'
      >
        <SectionOverline className='justify-center'>
          {copy.overline}
        </SectionOverline>
        <h1
          id='waitlist-heading'
          className='mt-6 font-serif text-[2.75rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance text-foreground sm:text-5xl'
        >
          Be first through the <span className='text-primary'>door.</span>
        </h1>
        <p className='mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg'>
          {copy.body}
        </p>
        {shouldUseClerkUi() ? <WaitlistForm /> : <WaitlistFormPreview />}
      </section>
    </LandingPageShell>
  );
}
