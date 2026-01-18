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
      <div className="from-primary via-accent absolute inset-0 bg-gradient-to-br to-rose-500"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>

      {/* Glass overlay pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-10 left-10 h-64 w-64 rounded-full bg-white blur-3xl"></div>
        <div className="absolute right-10 bottom-10 h-48 w-48 rounded-full bg-white blur-3xl"></div>
      </div>

      <div className="relative z-10 mx-auto max-w-screen-xl px-6 text-center">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/30 bg-white/10 p-12 backdrop-blur-xl">
          <h2
            id="final-cta-heading"
            className="mb-6 text-4xl font-bold text-white md:text-5xl"
          >
            Ready for Clarity?
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-lg text-white/90">
            Join thousands of learners who&apos;ve found their focus with
            Atlaris. Start your journey today—for free.
          </p>
          <Button
            asChild
            className="text-primary h-auto rounded-2xl bg-white px-8 py-4 font-semibold shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl"
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
