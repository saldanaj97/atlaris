import { MarketingCard } from '@/app/(marketing)/_shared/MarketingCard';
import { MarketingSection } from '@/app/(marketing)/_shared/MarketingSection';
import { BookOpen, CalendarCheck, Route } from 'lucide-react';
import { useId } from 'react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: <Route className='size-7 text-white' aria-hidden='true' />,
    title: 'Structured Roadmaps',
    description:
      'Turn a learning goal into modules and lessons sized to your weekly hours.',
  },
  {
    icon: <CalendarCheck className='size-7 text-white' aria-hidden='true' />,
    title: 'Calendar-Ready Plans',
    description:
      'Calendar-ready sessions so study time can show up where you already look (Google Calendar sync coming soon).',
  },
  {
    icon: <BookOpen className='size-7 text-white' aria-hidden='true' />,
    title: 'Curated Resources',
    description:
      'Each lesson links to articles, videos, and exercises chosen for that topic.',
  },
];

export function FeaturesSection() {
  const sectionId = useId();
  const headingId = `${sectionId}-heading`;

  return (
    <MarketingSection
      id={sectionId}
      headingId={headingId}
      badge='Features'
      badgeClassName='bg-primary/10 text-primary'
      title='Built for follow-through'
      subtitle='Plan generation, scheduling, and progress tracking in one product surface.'
    >
      <div className='grid gap-6 md:grid-cols-3'>
        {FEATURES.map((feature) => (
          <MarketingCard key={feature.title}>
            <div className='brand-fill-interactive mb-6 inline-flex size-14 items-center justify-center rounded-2xl shadow-lg'>
              {feature.icon}
            </div>
            <h3 className='marketing-card-title mb-3'>{feature.title}</h3>
            <p className='leading-relaxed text-muted-foreground'>
              {feature.description}
            </p>
          </MarketingCard>
        ))}
      </div>
    </MarketingSection>
  );
}
