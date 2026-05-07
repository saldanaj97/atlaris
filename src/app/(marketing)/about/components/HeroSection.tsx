import type { JSX } from 'react';
import { useId } from 'react';

import { Badge } from '@/components/ui/badge';

/**
 * Hero section for the About page with mission statement.
 */
export function HeroSection(): JSX.Element {
  const headingId = useId();

  return (
    <section className="relative py-24 lg:py-32" aria-labelledby={headingId}>
      <div className="relative z-10 mx-auto max-w-screen-xl px-6 text-center">
        <Badge variant="glassmorphic" className="mb-6 px-4 py-2">
          <span className="mr-2 h-2 w-2 rounded-full bg-gradient-to-r from-primary to-accent" />
          About Atlaris
        </Badge>

        <h1
          id={headingId}
          className="marketing-h1 mx-auto max-w-4xl leading-tight font-bold tracking-tight text-foreground"
        >
          Learning reimagined with{' '}
          <span className="gradient-text">AI precision</span>
        </h1>

        <p className="marketing-subtitle mx-auto mt-6 max-w-2xl text-muted-foreground">
          We believe everyone deserves a clear, personalized path to mastering
          new skills. Atlaris turns ambitious learning goals into structured,
          actionable plans — powered by AI.
        </p>
      </div>
    </section>
  );
}
