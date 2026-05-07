import { ArrowDownCircle, Calendar, Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId } from 'react';

import { Badge } from '@/components/ui/badge';

/**
 * Problem vs Solution section highlighting the contrast between
 * manual learning struggles and the structured Pathfinder approach.
 * Glassmorphism design with soft gradients and transparency.
 */
export function ProblemSolutionSection() {
  const sectionId = useId();
  const headingId = `${sectionId}-heading`;
  const problemCardHeadingId = `${sectionId}-problem-card-heading`;
  const solutionCardHeadingId = `${sectionId}-solution-card-heading`;

  return (
    <section className="relative lg:py-32" aria-labelledby={headingId}>
      <div className="relative z-10 mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <Badge
            variant="glassmorphic"
            className="mb-4 bg-destructive/10 px-4 py-1.5 text-destructive"
          >
            The Challenge
          </Badge>
          <h2 id={headingId} className="marketing-h2 mb-4 text-foreground">
            Most people don&apos;t fail to learn.{' '}
            <span className="gradient-text">They fail to start.</span>
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Problem Card */}
          <section
            className="group relative overflow-hidden rounded-3xl border border-destructive/30 bg-linear-to-br from-destructive/10 to-white/50 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-destructive/20 dark:from-destructive/5 dark:to-card/40"
            aria-labelledby={problemCardHeadingId}
          >
            {/* Decorative glow */}
            <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br from-destructive/30 to-destructive/20 opacity-30 blur-2xl"></div>

            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-destructive to-destructive/80 shadow-lg">
                <ArrowDownCircle
                  className="h-6 w-6 text-white"
                  aria-hidden="true"
                />
              </div>
              <h3 id={problemCardHeadingId} className="marketing-card-title">
                The Manual Spiral
              </h3>
            </div>

            <ul className="space-y-4">
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
          </section>

          {/* Solution Card */}
          <section
            className="group relative overflow-hidden rounded-3xl border border-primary/30 bg-linear-to-br from-primary/10 to-white/50 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-primary/20 dark:from-primary/5 dark:to-card/40"
            aria-labelledby={solutionCardHeadingId}
          >
            {/* Decorative glow */}
            <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br from-primary/30 to-accent/20 opacity-30 blur-2xl"></div>

            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-accent shadow-lg">
                <Calendar className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <h3 id={solutionCardHeadingId} className="marketing-card-title">
                Execution, Scheduled
              </h3>
            </div>

            <ul className="space-y-4">
              <SolutionItem>Coherent roadmap from day one</SolutionItem>
              <SolutionItem>Time-blocked in your calendar</SolutionItem>
              <SolutionItem>Resources attached to every session</SolutionItem>
              <SolutionItem>Progress visible at a glance</SolutionItem>
            </ul>
          </section>
        </div>
      </div>
    </section>
  );
}

interface ItemProps {
  children: ReactNode;
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
      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-destructive/10 shadow-sm">
        <X className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
      </div>
      <span className="leading-relaxed text-muted-foreground">{children}</span>
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
      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 shadow-sm">
        <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      </div>
      <span className="leading-relaxed text-muted-foreground">{children}</span>
    </li>
  );
}
