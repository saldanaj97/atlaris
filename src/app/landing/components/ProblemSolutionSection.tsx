import { ArrowDownCircle, Calendar, Check, X } from 'lucide-react';

/**
 * Problem vs Solution section highlighting the contrast between
 * manual learning struggles and the structured Pathfinder approach.
 */
export function ProblemSolutionSection() {
  return (
    <section
      className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
      aria-labelledby="problem-solution-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2
            id="problem-solution-heading"
            className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl"
          >
            Most people don&apos;t fail to learn.{' '}
            <span className="text-slate-500">
              They fail to start consistently.
            </span>
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
          {/* Problem Card */}
          <div
            className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
            role="region"
            aria-labelledby="problem-card-heading"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <ArrowDownCircle
                  className="h-5 w-5 text-red-500"
                  aria-hidden="true"
                />
              </div>
              <h3
                id="problem-card-heading"
                className="text-xl font-semibold text-slate-900"
              >
                The Manual Spiral
              </h3>
            </div>

            <ul className="space-y-4" role="list">
              <ProblemItem>
                Endless searches across YouTube, blogs, and courses
              </ProblemItem>
              <ProblemItem>
                Conflicting advice from different sources
              </ProblemItem>
              <ProblemItem>
                Plans that never make it to your calendar
              </ProblemItem>
              <ProblemItem>Motivation dies by week two</ProblemItem>
            </ul>

            {/* Subtle background decoration */}
            <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-red-50/50" />
          </div>

          {/* Solution Card */}
          <div
            className="relative overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm sm:p-8"
            role="region"
            aria-labelledby="solution-card-heading"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <Calendar
                  className="h-5 w-5 text-emerald-600"
                  aria-hidden="true"
                />
              </div>
              <h3
                id="solution-card-heading"
                className="text-xl font-semibold text-slate-900"
              >
                Execution, Scheduled
              </h3>
            </div>

            <ul className="space-y-4" role="list">
              <SolutionItem>Coherent roadmap from day one</SolutionItem>
              <SolutionItem>Time-blocked in your calendar</SolutionItem>
              <SolutionItem>Resources attached to every session</SolutionItem>
              <SolutionItem>Progress visible at a glance</SolutionItem>
            </ul>

            {/* Subtle background decoration */}
            <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-emerald-100/50" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
        <X className="h-3 w-3 text-red-500" aria-hidden="true" />
      </div>
      <span className="text-slate-600">{children}</span>
    </li>
  );
}

function SolutionItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-200">
        <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
      </div>
      <span className="text-slate-700">{children}</span>
    </li>
  );
}
