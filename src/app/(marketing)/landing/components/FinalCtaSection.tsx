import { MarketingCta } from '@/app/(marketing)/_shared/MarketingCta';
import { useId } from 'react';

export function FinalCtaSection() {
  const headingId = useId();

  return (
    <MarketingCta
      headingId={headingId}
      title='Ready to schedule your next skill?'
      description='Create a free learning plan in minutes, with time-blocked sessions and resources ready to follow.'
    />
  );
}
