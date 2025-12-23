import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

interface FinalCtaSectionProps {
  onCtaClick?: () => void;
}

/**
 * Final call-to-action section with compelling headline and CTA button.
 */
export function FinalCtaSection({ onCtaClick }: FinalCtaSectionProps) {
  return (
    <section
      className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8"
      aria-labelledby="final-cta-heading"
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2
          id="final-cta-heading"
          className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl"
        >
          You don&apos;t need more motivation.{' '}
          <span className="text-slate-600">You need a schedule.</span>
        </h2>

        <p className="mt-4 text-lg text-slate-600">
          Tell us what you want to learn. We&apos;ll tell you when to do it.
        </p>

        <div className="mt-8 flex flex-col items-center gap-4">
          <Button
            asChild
            className="group inline-flex items-center justify-center gap-2 bg-slate-700 px-8 py-4 text-lg font-medium text-white shadow-lg transition-all hover:bg-slate-800 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2"
            onClick={onCtaClick}
          >
            <Link href="/plans/new">
              Generate My Schedule Now
              <ArrowRight
                className="h-5 w-5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </Button>

          <p className="text-sm text-slate-500">Free. Cancel anytime.</p>
        </div>
      </div>
    </section>
  );
}
