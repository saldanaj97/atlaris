import { Quote } from 'lucide-react';

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
      <div className="absolute top-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gradient-to-br from-purple-200 to-pink-200 opacity-50 blur-3xl"></div>
      <div className="absolute right-10 bottom-20 h-48 w-48 rounded-full bg-gradient-to-br from-cyan-200 to-blue-200 opacity-40 blur-3xl"></div>

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
            <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              limited time
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-gray-600">
            Not infinite motivation—just a schedule that actually works
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <QuoteCard
            quote="I kept bookmarking 'Learn Python' courses for months. Pathfinder put 3 hours a week on my calendar and I actually stuck with it."
            persona="Career Switcher"
            detail="Marketing → Data Science"
            avatarInitials="SK"
            gradient="from-purple-400 to-pink-500"
          />

          <QuoteCard
            quote="Between classes and a part-time job, I needed something that worked around my schedule, not the other way around."
            persona="Student"
            detail="CS Junior"
            avatarInitials="JM"
            gradient="from-cyan-400 to-blue-500"
          />

          <QuoteCard
            quote="I have maybe 5 hours a week. Pathfinder figured out what I could actually cover and scheduled it around my meetings."
            persona="Busy Professional"
            detail="Product Manager"
            avatarInitials="RL"
            gradient="from-amber-400 to-orange-500"
          />
        </div>
      </div>
    </section>
  );
}

interface QuoteCardProps {
  quote: string;
  persona: string;
  detail: string;
  avatarInitials: string;
  gradient: string;
}

function QuoteCard({
  quote,
  persona,
  detail,
  avatarInitials,
  gradient,
}: QuoteCardProps) {
  return (
    <figure
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/50 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl"
      role="blockquote"
    >
      {/* Decorative glow */}
      <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br from-purple-200 to-pink-200 opacity-20 blur-2xl transition group-hover:opacity-40"></div>

      {/* Quote icon */}
      <Quote
        className="absolute top-6 right-6 h-10 w-10 text-purple-200"
        aria-hidden="true"
      />

      {/* Star rating */}
      <div className="mb-4 flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className="h-5 w-5 text-amber-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>

      <blockquote className="relative flex-1">
        <p className="text-lg leading-relaxed text-gray-700">
          &ldquo;{quote}&rdquo;
        </p>
      </blockquote>

      <figcaption className="mt-6 flex items-center gap-4 border-t border-purple-100/50 pt-6">
        {/* Avatar */}
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-sm font-bold text-white shadow-lg`}
          aria-hidden="true"
        >
          {avatarInitials}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{persona}</p>
          <p className="text-sm text-purple-600">{detail}</p>
        </div>
      </figcaption>
    </figure>
  );
}
