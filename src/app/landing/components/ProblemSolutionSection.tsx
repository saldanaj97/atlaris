import { ArrowDownCircle, Calendar, Check, X } from 'lucide-react';

/**
 * Problem vs Solution section highlighting the contrast between
 * manual learning struggles and the structured Pathfinder approach.
 * Glassmorphism design with soft gradients and transparency.
 */
export function ProblemSolutionSection() {
  return (
    <section
      className="relative py-24 lg:py-32"
      aria-labelledby="problem-solution-heading"
    >
      {/* Background decoration */}
      <div
        className="absolute top-20 left-1/4 h-64 w-64 rounded-full bg-gradient-to-br from-rose-200 to-orange-100 opacity-40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute right-1/4 bottom-20 h-56 w-56 rounded-full bg-gradient-to-br from-emerald-200 to-cyan-100 opacity-40 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-rose-100 px-4 py-1.5 text-sm font-medium text-rose-700">
            The Challenge
          </span>
          <h2
            id="problem-solution-heading"
            className="mb-4 text-4xl font-bold text-gray-900 md:text-5xl"
          >
            Most people don&apos;t fail to learn.{' '}
            <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              They fail to start.
            </span>
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Problem Card */}
          <div
            className="group relative overflow-hidden rounded-3xl border border-rose-200/50 bg-gradient-to-br from-rose-50/80 to-white/60 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl"
            role="region"
            aria-labelledby="problem-card-heading"
          >
            {/* Decorative glow */}
            <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br from-rose-300 to-orange-200 opacity-30 blur-2xl"></div>

            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-red-500 shadow-lg">
                <ArrowDownCircle
                  className="h-6 w-6 text-white"
                  aria-hidden="true"
                />
              </div>
              <h3
                id="problem-card-heading"
                className="text-2xl font-bold text-gray-900"
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
          </div>

          {/* Solution Card */}
          <div
            className="group relative overflow-hidden rounded-3xl border border-emerald-200/50 bg-gradient-to-br from-emerald-50/80 to-white/60 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl"
            role="region"
            aria-labelledby="solution-card-heading"
          >
            {/* Decorative glow */}
            <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br from-emerald-300 to-cyan-200 opacity-30 blur-2xl"></div>

            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 shadow-lg">
                <Calendar className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <h3
                id="solution-card-heading"
                className="text-2xl font-bold text-gray-900"
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
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-100 to-red-100 shadow-sm">
        <X className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
      </div>
      <span className="leading-relaxed text-gray-600">{children}</span>
    </li>
  );
}

function SolutionItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-green-100 shadow-sm">
        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
      </div>
      <span className="leading-relaxed text-gray-700">{children}</span>
    </li>
  );
}
