import { MarketingCta } from '@/app/(marketing)/_shared/MarketingCta';
import { useId } from 'react';

export function CtaSection() {
  const headingId = useId();

  return (
    <MarketingCta
      headingId={headingId}
      title='Ready to Start Learning?'
      description='Create your first structured learning plan in minutes — completely free.'
      buttonLabel='Get Started'
    />
  );
}
