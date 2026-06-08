import { MarketingCard } from '@/app/(marketing)/_shared/MarketingCard';
import { MarketingSection } from '@/app/(marketing)/_shared/MarketingSection';
import { cn } from '@/lib/utils';
import { Quote } from 'lucide-react';
import { useId } from 'react';

type AvatarGradient = 'from-primary to-accent';

interface QuoteCardProps {
  quote: string;
  persona: string;
  detail: string;
  avatarInitials: string;
  gradient?: AvatarGradient;
}

const USE_CASES: QuoteCardProps[] = [
  {
    quote:
      "I kept bookmarking 'Learn Python' courses for months. Atlaris put 3 hours a week on my calendar and I actually stuck with it.",
    persona: 'Career Switcher',
    detail: 'Marketing → Data Science',
    avatarInitials: 'SK',
    gradient: 'from-primary to-accent',
  },
  {
    quote:
      'Between classes and a part-time job, I needed something that worked around my schedule, not the other way around.',
    persona: 'Student',
    detail: 'CS Junior',
    avatarInitials: 'JM',
    gradient: 'from-primary to-accent',
  },
  {
    quote:
      'I have maybe 5 hours a week. Atlaris figured out what I could actually cover and scheduled it around my meetings.',
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
      title={
        <>
          Built for people with{' '}
          <span className='gradient-text'>limited time</span>
        </>
      }
      subtitle='Example scenarios from learners balancing work, school, and real calendars.'
    >
      <div className='grid gap-6 md:grid-cols-3'>
        {USE_CASES.map((useCase) => (
          <QuoteCard key={useCase.persona} {...useCase} />
        ))}
      </div>
    </MarketingSection>
  );
}

function QuoteCard({
  quote,
  persona,
  detail,
  avatarInitials,
  gradient = 'from-primary to-accent',
}: QuoteCardProps) {
  return (
    <MarketingCard className='flex flex-col p-8' showGlow={false}>
      <Quote
        className='absolute top-6 right-6 size-10 text-primary/30'
        aria-hidden='true'
      />

      <blockquote className='relative flex-1'>
        <p className='text-lg leading-relaxed text-foreground'>
          &ldquo;{quote}&rdquo;
        </p>
      </blockquote>

      <figcaption className='mt-6 flex items-center gap-4 border-t border-primary/20 pt-6'>
        <div
          className={cn(
            'flex size-12 items-center justify-center rounded-xl bg-linear-to-br text-sm font-bold text-white shadow-lg',
            gradient,
          )}
          aria-hidden='true'
        >
          {avatarInitials}
        </div>
        <div>
          <p className='font-semibold text-foreground'>{persona}</p>
          <p className='text-sm text-primary'>{detail}</p>
        </div>
      </figcaption>
    </MarketingCard>
  );
}
