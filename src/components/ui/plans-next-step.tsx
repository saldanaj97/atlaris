import { Button } from '@/components/ui/button';
import { CtaBanner } from '@/components/ui/cta-banner';
import { SectionOverline } from '@/components/ui/section-overline';
import { ROUTES } from '@/features/navigation/routes';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

/** Plan-library CTA that continues from the shared mountain banner treatment. */
export function PlansNextStep({ canCreatePlan }: { canCreatePlan: boolean }) {
  return (
    <CtaBanner aria-labelledby='plans-next-step' artwork='mountain'>
      <div className='relative flex min-h-[14rem] flex-col justify-center gap-5 px-5 py-7 sm:min-h-[12rem] sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8'>
        <div className='max-w-xl'>
          <SectionOverline>Ready for what&apos;s next?</SectionOverline>
          <h2
            id='plans-next-step'
            className='font-heading mt-2 text-2xl tracking-[-0.02em] text-foreground sm:text-[28px]'
          >
            Chart another learning path.
          </h2>
          <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
            Name a new goal and Atlaris will shape the next route around your
            time.
          </p>
        </div>
        <Button asChild variant='cta' className='shrink-0'>
          <Link href={canCreatePlan ? ROUTES.PLANS.NEW : ROUTES.PRICING}>
            {canCreatePlan ? 'Create new plan' : 'View pricing'}
            <ArrowRight aria-hidden='true' />
          </Link>
        </Button>
      </div>
    </CtaBanner>
  );
}
