import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface FinalCtaSectionProps {
  onCtaClick?: () => void;
}

/**
 * Final call-to-action section with glassmorphism design.
 */
export function FinalCtaSection({ onCtaClick }: FinalCtaSectionProps) {
  return (
    <section
      className="relative overflow-hidden py-24 lg:py-32"
      aria-labelledby="final-cta-heading"
    >
      <div className="relative z-10 mx-auto max-w-screen-xl px-6 text-center">
        <div className="dark:bg-card/40 mx-auto max-w-3xl rounded-3xl border border-white/50 bg-white/40 p-12 shadow-xl backdrop-blur-sm dark:border-white/10">
          <h2
            id="final-cta-heading"
            className="text-foreground marketing-h2 mb-2"
          >
            Ready for Clarity?
          </h2>
          <p className="text-muted-foreground marketing-subtitle mx-auto mb-6 max-w-xl lg:mb-10">
            Join thousands of learners who&apos;ve found their focus with
            Atlaris. Start your journey today—for free.
          </p>
          <Button asChild className="h-auto px-8 py-4 font-semibold">
            <Link href="/plans/new" onClick={onCtaClick}>
              Start Free Trial
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
