import { Card } from '@/components/ui/card';
import { planDetailPath, ROUTES } from '@/features/navigation/routes';
import Link from 'next/link';

const TITLE_ID = 'dashboard-suggested-next-steps-heading';

export type SuggestedNextStep = {
  title: string;
  detail: string;
  href: string;
};

export function buildSuggestedNextSteps(params: {
  resumePlanId?: string;
  resumeTopic?: string;
  canCreatePlan: boolean;
}): SuggestedNextStep[] {
  const primary: SuggestedNextStep = params.resumePlanId
    ? {
        title: 'Continue learning',
        detail: params.resumeTopic ?? 'Pick up your current plan.',
        href: planDetailPath(params.resumePlanId),
      }
    : params.canCreatePlan
      ? {
          title: 'Create a plan',
          detail: 'Start a learning map for a topic you care about.',
          href: ROUTES.PLANS.NEW,
        }
      : {
          title: 'See pricing',
          detail: 'Unlock another learning plan.',
          href: ROUTES.PRICING,
        };

  return [
    primary,
    {
      title: 'Your plans',
      detail: 'Review every route you have started.',
      href: ROUTES.PLANS.ROOT,
    },
    {
      title: 'Usage',
      detail: 'See the eight-week pulse and current metrics.',
      href: ROUTES.ANALYTICS.USAGE,
    },
  ];
}

export function SuggestedNextSteps({ steps }: { steps: SuggestedNextStep[] }) {
  return (
    <Card
      as='section'
      aria-labelledby={TITLE_ID}
      className='p-5 animate-dashboard-unfold [animation-delay:200ms] motion-reduce:animate-none sm:p-6'
    >
      <h2
        id={TITLE_ID}
        className='text-lg font-semibold text-foreground sm:text-xl'
      >
        Suggested next steps
      </h2>
      <p className='mt-2 text-sm text-muted-foreground'>
        Based on your current plans and available actions.
      </p>

      <ul className='mt-5 grid gap-3 md:grid-cols-3'>
        {steps.map((step) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className='flex h-full flex-col rounded-[12px] border border-panel-border bg-panel-muted/50 p-4 transition-colors hover:bg-panel-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'
            >
              <span className='text-sm font-medium text-foreground'>
                {step.title}
              </span>
              <span className='mt-2 text-sm text-muted-foreground'>
                {step.detail}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
