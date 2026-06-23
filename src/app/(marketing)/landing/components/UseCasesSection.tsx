import { MarketingCard } from '@/app/(marketing)/_shared/MarketingCard';
import { MarketingSection } from '@/app/(marketing)/_shared/MarketingSection';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useId } from 'react';

interface ScenarioCardProps {
  scenario: string;
  persona: string;
  detail: string;
  avatarInitials: string;
}

const USE_CASES: ScenarioCardProps[] = [
  {
    scenario:
      "I kept bookmarking 'Learn Python' courses for months. Atlaris turned it into 3 focused hours a week and I actually stuck with it.",
    persona: 'Career Switcher',
    detail: 'Marketing → Data Science',
    avatarInitials: 'SK',
  },
  {
    scenario:
      'Between classes and a part-time job, I needed something that worked around my schedule, not the other way around.',
    persona: 'Student',
    detail: 'CS Junior',
    avatarInitials: 'JM',
  },
  {
    scenario:
      'I have maybe 5 hours a week. Atlaris figured out what I could actually cover and turned it into a plan I could follow.',
    persona: 'Busy Professional',
    detail: 'Product Manager',
    avatarInitials: 'RL',
  },
];

export function UseCasesSection() {
  const sectionId = useId();
  const headingId = `${sectionId}-heading`;

  return (
    <MarketingSection
      headingId={headingId}
      badge='Use Cases'
      badgeClassName='bg-accent/10 text-accent-foreground'
      title='Built for people with limited time'
      subtitle='Illustrative example scenarios — not verified customer testimonials.'
    >
      <div className='grid gap-6 md:grid-cols-3'>
        {USE_CASES.map((useCase) => (
          <ScenarioCard key={useCase.persona} {...useCase} />
        ))}
      </div>
    </MarketingSection>
  );
}

function ScenarioCard({
  scenario,
  persona,
  detail,
  avatarInitials,
}: ScenarioCardProps) {
  return (
    <MarketingCard className='flex flex-col p-8' showGlow={false}>
      <Badge
        variant='outline'
        className='mb-4 w-fit text-xs font-normal text-muted-foreground'
      >
        Example scenario
      </Badge>

      <p className='flex-1 text-lg leading-relaxed text-foreground'>
        {scenario}
      </p>

      <div className='mt-6 flex items-center gap-4 border-t border-primary/20 pt-6'>
        <div
          className={cn(
            'flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-primary to-accent text-sm font-bold text-white shadow-lg',
          )}
          aria-hidden='true'
        >
          {avatarInitials}
        </div>
        <div>
          <p className='font-semibold text-foreground'>{persona}</p>
          <p className='text-sm text-primary'>{detail}</p>
        </div>
      </div>
    </MarketingCard>
  );
}
