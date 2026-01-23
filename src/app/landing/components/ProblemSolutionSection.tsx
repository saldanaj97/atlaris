import { ArrowDownCircle, Calendar, Check, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

/**
 * Problem vs Solution section highlighting the contrast between
 * manual learning struggles and the structured Pathfinder approach.
 * Glassmorphism design with soft gradients and transparency.
 */
export function ProblemSolutionSection() {
  return (
    <section
      className="relative lg:py-32"
      aria-labelledby="problem-solution-heading"
    >
      <div className="relative z-10 mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <Badge className="bg-destructive/10 text-destructive mb-4 px-4 py-1.5">
            The Challenge
          </Badge>
          <h2
            id="problem-solution-heading"
            className="text-foreground marketing-h2 mb-4"
          >
            Most people don&apos;t fail to learn.{' '}
            <span className="from-primary to-accent bg-gradient-to-r bg-clip-text text-transparent">
              They fail to start.
            </span>
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Problem Card */}
          <div
            className="group border-destructive/30 from-destructive/10 dark:border-destructive/20 dark:from-destructive/5 dark:to-card/40 relative overflow-hidden rounded-3xl border bg-gradient-to-br to-white/50 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl"
            role="region"
            aria-labelledby="problem-card-heading"
          >
            {/* Decorative glow */}
            <div className="from-destructive/30 to-destructive/20 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-30 blur-2xl"></div>

            <div className="mb-6 flex items-center gap-4">
              <div className="from-destructive to-destructive/80 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg">
                <ArrowDownCircle
                  className="h-6 w-6 text-white"
                  aria-hidden="true"
                />
              </div>
              <h3
                id="problem-card-heading"
                className="text-foreground text-2xl font-bold"
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
            className="group border-primary/30 from-primary/10 dark:border-primary/20 dark:from-primary/5 dark:to-card/40 relative overflow-hidden rounded-3xl border bg-gradient-to-br to-white/50 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl"
            role="region"
            aria-labelledby="solution-card-heading"
          >
            {/* Decorative glow */}
            <div className="from-primary/30 to-accent/20 absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-30 blur-2xl"></div>

            <div className="mb-6 flex items-center gap-4">
              <div className="from-primary to-accent flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg">
                <Calendar className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <h3
                id="solution-card-heading"
                className="text-foreground text-2xl font-bold"
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

interface ItemProps {
  children: React.ReactNode;
}

/**
 * Displays a problem item in the problem-solution comparison section.
 * Renders a list item with an X icon and the provided children content.
 *
 * @param children - The content to display as the problem description
 */
function ProblemItem({ children }: ItemProps) {
  return (
    <li className="flex items-start gap-3">
      <div className="bg-destructive/10 mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg shadow-sm">
        <X className="text-destructive h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <span className="text-muted-foreground leading-relaxed">{children}</span>
    </li>
  );
}

/**
 * Displays a solution item in the problem-solution comparison section.
 * Renders a list item with a checkmark icon and the provided children content.
 *
 * @param children - The content to display as the solution description
 */
function SolutionItem({ children }: ItemProps) {
  return (
    <li className="flex items-start gap-3">
      <div className="bg-primary/10 mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg shadow-sm">
        <Check className="text-primary h-3.5 w-3.5" aria-hidden="true" />
      </div>
      <span className="text-muted-foreground leading-relaxed">{children}</span>
    </li>
  );
}
