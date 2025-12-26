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
      className="relative min-h-screen overflow-hidden pt-32"
      aria-labelledby="hero-heading"
    >
      {/* Floating gradient orbs */}
      <div
        className="absolute top-20 -left-20 h-96 w-96 rounded-full bg-gradient-to-br from-purple-300 to-pink-200 opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="absolute top-40 -right-20 h-80 w-80 rounded-full bg-gradient-to-br from-cyan-200 to-blue-200 opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>
      <div
        className="absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br from-rose-200 to-orange-100 opacity-60 blur-3xl"
        aria-hidden="true"
      ></div>

      <div className="relative z-10 mx-auto flex flex-col items-center px-6 pt-16 text-center lg:pt-24">
        <div className="mb-8 inline-flex items-center rounded-full border border-purple-200/50 bg-white/50 px-4 py-2 shadow-lg backdrop-blur-sm">
          <span className="mr-2 h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500"></span>
          <span className="text-sm font-medium text-purple-700">
            Now with AI-powered insights
          </span>
        </div>

        <h1
          id="hero-heading"
          className="mb-8 max-w-4xl text-5xl leading-tight font-bold tracking-tight text-gray-900 md:text-6xl lg:text-7xl"
        >
          Learn with
          <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-rose-500 bg-clip-text text-transparent">
            {' '}
            crystal clarity
          </span>
        </h1>

        <p className="mb-12 max-w-2xl text-lg leading-relaxed text-gray-600 md:text-xl">
          Experience learning through a beautifully crafted interface
          that&apos;s as clear as glass and as powerful as the technology behind
          it.
        </p>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Button
            asChild
            className="group h-auto rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 px-8 py-4 text-white shadow-xl shadow-purple-500/25 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-purple-500/30"
          >
            <Link href="/plans/new" onClick={onCtaClick}>
              <span className="font-medium">Start Free Trial</span>
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
          <button
            type="button"
            className="rounded-2xl border border-white/60 bg-white/40 px-8 py-4 font-medium text-gray-700 shadow-lg backdrop-blur-sm transition hover:bg-white/60"
          >
            Watch Demo
          </button>
        </div>

        {/* Glassmorphism card preview */}
        <div className="relative mt-20 w-full max-w-5xl">
          {/* Background glow */}
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-purple-400/30 via-pink-400/30 to-rose-400/30 blur-xl"></div>

          <div className="relative overflow-hidden rounded-3xl border border-white/40 bg-white/30 p-2 shadow-2xl backdrop-blur-xl">
            <div className="rounded-2xl bg-gradient-to-br from-white/80 to-white/40 p-6">
              <div className="aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-purple-100/50 to-pink-100/50">
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-400 to-pink-400 shadow-lg">
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
                      [Interactive Dashboard Preview]
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
