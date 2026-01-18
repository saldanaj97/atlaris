import { Quote } from 'lucide-react';
import { StarRating } from './StarRating';

interface QuoteCardProps {
  quote: string;
  persona: string;
  detail: string;
  avatarInitials: string;
  gradient: string;
}

const TESTIMONIALS: QuoteCardProps[] = [
  {
    quote:
      "I kept bookmarking 'Learn Python' courses for months. Pathfinder put 3 hours a week on my calendar and I actually stuck with it.",
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
    gradient: 'from-cyan-400 to-blue-500',
  },
  {
    quote:
      'I have maybe 5 hours a week. Pathfinder figured out what I could actually cover and scheduled it around my meetings.',
    persona: 'Busy Professional',
    detail: 'Product Manager',
    avatarInitials: 'RL',
    gradient: 'from-amber-400 to-orange-500',
  },
];

/**
 * Use cases section with testimonial-style quote cards
 * for different user personas. Glassmorphism design.
 */
export function UseCasesSection() {
  return (
    <section
      className="relative overflow-hidden py-24 lg:py-32"
      aria-labelledby="use-cases-heading"
    >
      {/* Background decorations */}
      <div
        className="from-primary/30 to-accent/30 absolute top-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gradient-to-br opacity-50 blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="absolute right-10 bottom-20 h-48 w-48 rounded-full bg-gradient-to-br from-cyan-200 to-blue-200 opacity-40 blur-3xl"
        aria-hidden="true"
      ></div>

      <div className="relative z-10 mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-700">
            Real Stories
          </span>
          <h2
            id="use-cases-heading"
            className="mb-4 text-4xl font-bold text-gray-900 md:text-5xl"
          >
            Built for people with{' '}
            <span className="from-primary to-accent bg-gradient-to-r bg-clip-text text-transparent">
              limited time
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-gray-600">
            Not infinite motivation—just a schedule that actually works
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <QuoteCard key={testimonial.persona} {...testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * QuoteCard component displays a testimonial-style quote card with
 * glassmorphism design. Shows a quote, persona information, avatar with
 * gradient background, and star rating.
 *
 * @param quote - The testimonial quote text to display
 * @param persona - The persona or role of the person giving the testimonial (e.g., "Career Switcher", "Student")
 * @param detail - Additional detail about the persona (e.g., "Marketing → Data Science", "CS Junior")
 * @param avatarInitials - Initials to display in the avatar circle (e.g., "SK", "JM")
 * @param gradient - Tailwind gradient classes for the avatar background (e.g., "from-primary to-accent")
 * @returns JSX.Element - A styled quote card component
 */
function QuoteCard({
  quote,
  persona,
  detail,
  avatarInitials,
  gradient,
}: QuoteCardProps) {
  return (
    <figure className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/50 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl">
      {/* Decorative glow */}
      <div
        className="from-primary/30 to-accent/30 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition group-hover:opacity-40"
        aria-hidden="true"
      ></div>

      {/* Quote icon */}
      <Quote
        className="text-primary/30 absolute top-6 right-6 h-10 w-10"
        aria-hidden="true"
      />

      {/* Star rating */}
      <div className="mb-4">
        <StarRating count={5} />
      </div>

      <blockquote className="relative flex-1">
        <p className="text-lg leading-relaxed text-gray-700">
          &ldquo;{quote}&rdquo;
        </p>
      </blockquote>

      <figcaption className="border-primary/20 mt-6 flex items-center gap-4 border-t pt-6">
        {/* Avatar */}
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-sm font-bold text-white shadow-lg`}
          aria-hidden="true"
        >
          {avatarInitials}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{persona}</p>
          <p className="text-primary text-sm">{detail}</p>
        </div>
      </figcaption>
    </figure>
  );
}
