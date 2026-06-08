import type { JSX, ReactNode } from 'react';

import { MarketingCard } from '@/app/(marketing)/_shared/MarketingCard';
import { MarketingSection } from '@/app/(marketing)/_shared/MarketingSection';
import { Eye, Globe, Target } from 'lucide-react';
import { useId } from 'react';

export function ValuesSection(): JSX.Element {
  const headingId = useId();

  return (
    <MarketingSection
      headingId={headingId}
      title='What We Believe'
      subtitle='The principles that guide every feature we build.'
    >
      <div className='grid gap-6 md:grid-cols-3'>
        {VALUES.map((value) => (
          <MarketingCard key={value.title}>
            <div className='brand-fill-interactive mb-6 inline-flex size-14 items-center justify-center rounded-2xl shadow-lg'>
              {value.icon}
            </div>
            <h3 className='marketing-card-title mb-3'>{value.title}</h3>
            <p className='leading-relaxed text-muted-foreground'>
              {value.description}
            </p>
          </MarketingCard>
        ))}
      </div>
    </MarketingSection>
  );
}

interface Value {
  icon: ReactNode;
  title: string;
  description: string;
}

const VALUES: Value[] = [
  {
    icon: <Eye className='size-6 text-white' aria-hidden='true' />,
    title: 'Clarity',
    description:
      'Learning should not feel chaotic. We show the next module, lesson, and session on one timeline.',
  },
  {
    icon: <Target className='size-6 text-white' aria-hidden='true' />,
    title: 'Personalization',
    description:
      'Every plan reflects your goals, schedule, and preferred learning pace.',
  },
  {
    icon: <Globe className='size-6 text-white' aria-hidden='true' />,
    title: 'Accessibility',
    description:
      'We prioritize open resources and keep a free tier so anyone can start.',
  },
];
