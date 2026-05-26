import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Quote } from 'lucide-react';
import { useId } from 'react';

type AvatarGradient =
  | 'from-primary to-accent'
  | 'from-destructive to-destructive/80';

interface QuoteCardProps {
  quote: string;
  persona: string;
  detail: string;
  avatarInitials: string;
  gradient: AvatarGradient;
}

const TESTIMONIALS: QuoteCardProps[] = [
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
    gradient: 'from-destructive to-destructive/80',
  },
];

const DECORATIVE_STAR_KEYS = [
  'star-1',
  'star-2',
  'star-3',
  'star-4',
  'star-5',
] as const;

/**
 * Use cases section with testimonial-style quote cards
 * for different user personas. Glassmorphism design.
 */
export function UseCasesSection() {
  const sectionId = useId();
  const headingId = `${sectionId}-heading`;

  return (
    <section
      className='relative overflow-hidden lg:py-32'
      aria-labelledby={headingId}
    >
      <div className='relative z-10 mx-auto max-w-screen-xl px-6'>
        <div className='mb-16 text-center'>
          <Badge
            variant='glassmorphic'
            className='mb-4 bg-accent/10 px-4 py-1.5 text-accent-foreground'
          >
            Real Stories
          </Badge>
          <h2 id={headingId} className='marketing-h2 mb-4 text-foreground'>
            Built for people with{' '}
            <span className='gradient-text'>limited time</span>
          </h2>
          <p className='marketing-subtitle mx-auto max-w-2xl'>
            Not infinite motivation—just a schedule that actually works
          </p>
        </div>

        <div className='grid gap-6 md:grid-cols-3'>
          {TESTIMONIALS.map((testimonial) => (
            <QuoteCard key={testimonial.persona} {...testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}

function QuoteCard({
  quote,
  persona,
  detail,
  avatarInitials,
  gradient,
}: QuoteCardProps) {
  return (
    <figure className='group relative flex flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/50 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-white/10 dark:bg-card/40'>
      <div
        className='absolute -top-12 -right-12 size-32 rounded-full bg-linear-to-br from-primary/30 to-accent/30 opacity-20 blur-2xl transition group-hover:opacity-40 motion-reduce:transition-none'
        aria-hidden='true'
      ></div>

      <Quote
        className='absolute top-6 right-6 size-10 text-primary/30'
        aria-hidden='true'
      />

      <div className='mb-4'>
        <DecorativeStars />
      </div>

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
    </figure>
  );
}

function DecorativeStars() {
  return (
    <div className='flex' aria-hidden='true'>
      {DECORATIVE_STAR_KEYS.map((starKey) => (
        <svg
          key={starKey}
          className='size-5 text-amber-400'
          fill='currentColor'
          viewBox='0 0 20 20'
          aria-hidden='true'
          focusable='false'
        >
          <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
        </svg>
      ))}
    </div>
  );
}
