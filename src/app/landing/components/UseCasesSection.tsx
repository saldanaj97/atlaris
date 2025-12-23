import { Quote } from 'lucide-react';

/**
 * Use cases section with testimonial-style quote cards
 * for different user personas.
 */
export function UseCasesSection() {
  return (
    <section
      className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
      aria-labelledby="use-cases-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2
            id="use-cases-heading"
            className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl"
          >
            Built for people with limited time—
            <span className="text-slate-500">not infinite motivation</span>
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
          <QuoteCard
            quote="I kept bookmarking 'Learn Python' courses for months. Pathfinder put 3 hours a week on my calendar and I actually stuck with it."
            persona="Career Switcher"
            detail="Marketing → Data Science"
            avatarInitials="SK"
          />

          <QuoteCard
            quote="Between classes and a part-time job, I needed something that worked around my schedule, not the other way around."
            persona="Student"
            detail="CS Junior"
            avatarInitials="JM"
          />

          <QuoteCard
            quote="I have maybe 5 hours a week. Pathfinder figured out what I could actually cover and scheduled it around my meetings."
            persona="Busy Professional"
            detail="Product Manager"
            avatarInitials="RL"
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
}

function QuoteCard({ quote, persona, detail, avatarInitials }: QuoteCardProps) {
  return (
    <figure
      className="relative flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      role="blockquote"
    >
      {/* Quote icon */}
      <Quote
        className="absolute top-4 right-4 h-8 w-8 text-slate-100"
        aria-hidden="true"
      />

      <blockquote className="relative flex-1">
        <p className="leading-relaxed text-slate-700">&ldquo;{quote}&rdquo;</p>
      </blockquote>

      <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
        {/* Avatar */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-white"
          aria-hidden="true"
        >
          {avatarInitials}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{persona}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
      </figcaption>
    </figure>
  );
}
