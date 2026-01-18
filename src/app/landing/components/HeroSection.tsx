import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

interface HeroSectionProps {
  onCtaClick?: () => void;
}

/**
 * Hero section with glassmorphism design, headline, and CTA.
 */
export function HeroSection({ onCtaClick }: HeroSectionProps) {
  return (
    <section
      className="relative overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* Floating gradient orbs */}
      <div
        className="from-primary/40 to-accent/30 absolute top-20 -left-20 h-96 w-96 rounded-full bg-gradient-to-br opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="from-primary/30 to-accent/20 absolute top-40 -right-20 h-80 w-80 rounded-full bg-gradient-to-br opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="from-destructive/20 to-accent/20 absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>

      <div className="relative z-10 mx-auto flex flex-col items-center px-6 pt-4 text-center lg:pt-8">
        <div className="border-primary/30 mb-8 inline-flex items-center rounded-full border bg-white/50 px-4 py-2 shadow-lg backdrop-blur-sm">
          <span className="from-primary to-accent mr-2 h-2 w-2 rounded-full bg-gradient-to-r"></span>
          <span className="text-primary text-sm font-medium">
            Now with AI-powered insights
          </span>
        </div>

        <h1
          id="hero-heading"
          className="mb-8 max-w-4xl text-5xl leading-tight font-bold tracking-tight text-gray-900 md:text-6xl lg:text-7xl"
        >
          Learn with
          <span className="from-primary via-accent to-destructive bg-gradient-to-r bg-clip-text text-transparent">
            {' '}
            crystal clarity
          </span>
        </h1>

        <p className="mb-12 max-w-2xl text-lg leading-relaxed text-gray-600 md:text-xl">
          Experience learning through a beautifully crafted interface
          that&apos;s as clear as glass and as powerful as the technology behind
          it.
        </p>

        <Button asChild variant="cta" className="group h-auto px-8 py-4">
          <Link href="/plans/new" onClick={onCtaClick}>
            <span className="font-medium">Start Free Trial</span>
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>

        {/* Glassmorphism card preview */}
        <div className="relative mt-20 w-full max-w-5xl">
          {/* Background glow */}
          <div className="from-primary/30 via-accent/30 to-accent/30 absolute -inset-4 rounded-3xl bg-gradient-to-r blur-xl"></div>

          <div className="relative overflow-hidden rounded-3xl border border-white/40 bg-white/30 p-2 shadow-2xl backdrop-blur-xl">
            <div className="rounded-2xl bg-gradient-to-br from-white/80 to-white/40 p-6">
              <div className="from-primary/20 to-accent/20 aspect-video overflow-hidden rounded-xl bg-gradient-to-br">
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="from-primary to-accent mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg">
                      <svg
                        className="h-8 w-8 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <p className="text-gray-500">
                      See your personalized dashboard in action
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
