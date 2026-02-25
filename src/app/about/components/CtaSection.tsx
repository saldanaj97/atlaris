import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Bottom call-to-action section.
 */
export function CtaSection() {
  return (
    <section
      className="relative overflow-hidden py-24 lg:py-32"
      aria-labelledby="about-cta-heading"
    >
      <div className="relative z-10 mx-auto max-w-screen-xl px-6 text-center">
        <div className="dark:bg-card/40 mx-auto max-w-3xl rounded-3xl border border-white/50 bg-white/40 p-12 shadow-xl backdrop-blur-sm dark:border-white/10">
          <h2
            id="about-cta-heading"
            className="text-foreground marketing-h2 mb-2"
          >
            Ready to Start <span className="gradient-text">Learning</span>?
          </h2>
          <p className="text-muted-foreground marketing-subtitle mx-auto mb-8 max-w-xl">
            Create your first AI-powered learning plan in minutes — completely
            free.
          </p>
          <Button
            asChild
            variant="default"
            className="group h-auto rounded-2xl px-8 py-4 font-semibold shadow-lg transition hover:shadow-xl"
          >
            <Link href="/plans/new">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
