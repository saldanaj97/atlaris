import Link from 'next/link';
import { useId } from 'react';
import { Button } from '@/components/ui/button';

import { marketingPrimaryCtaClassName } from './marketing-cta';

interface FinalCtaSectionProps {
  onCtaClick?: () => void;
}

/**
 * Final call-to-action section with glassmorphism design.
 */
export function FinalCtaSection({ onCtaClick }: FinalCtaSectionProps) {
  const headingId = useId();

  return (
    <section
      className="relative overflow-hidden py-24 lg:py-32"
      aria-labelledby={headingId}
    >
      <div className="relative z-10 mx-auto max-w-screen-xl px-6 text-center">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/50 bg-white/40 p-12 shadow-xl backdrop-blur-sm dark:border-white/10 dark:bg-card/40">
          <h2 id={headingId} className="marketing-h2 mb-2 text-foreground">
            Ready for Clarity?
          </h2>
          <p className="marketing-subtitle mx-auto mb-6 max-w-xl text-muted-foreground lg:mb-10">
            Join thousands of learners who&apos;ve found their focus with
            Atlaris. Start your journey today—for free.
          </p>
          <Button
            asChild
            variant="default"
            className={marketingPrimaryCtaClassName}
          >
            <Link href="/plans/new" onClick={onCtaClick}>
              Start Free Trial
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
