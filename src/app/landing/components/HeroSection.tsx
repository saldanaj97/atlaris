import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, PlayCircle } from 'lucide-react';

interface HeroSectionProps {
  onCtaClick?: () => void;
}

/**
 * Hero section with glassmorphism design, headline, and CTA.
 */
export function HeroSection({ onCtaClick }: HeroSectionProps) {
  return (
    <section className="relative" aria-labelledby="hero-heading">
      <div className="relative z-10 mx-auto flex flex-col items-center px-6 pt-6 pb-48 text-center sm:pt-8 lg:min-h-screen lg:justify-center lg:pt-16">
        {/* Heading Text Section - positioned in upper portion with balanced spacing */}
        <div className="flex flex-col items-center space-y-6 lg:flex-1 lg:justify-center lg:space-y-6">
          <Badge variant="glassmorphic" className="px-4 py-2">
            <span className="from-primary to-accent mr-2 h-2 w-2 rounded-full bg-gradient-to-r"></span>
            Now with AI-powered insights
          </Badge>

          <h1
            id="hero-heading"
            className="text-foreground marketing-h1 max-w-4xl leading-tight font-bold tracking-tight"
          >
            Learn with
            <span className="gradient-text"> crystal clarity</span>
          </h1>

          <p className="text-muted-foreground marketing-subtitle max-w-lg md:max-w-2xl">
            Experience learning through a beautifully crafted interface
            that&apos;s as clear as glass and as powerful as the technology
            behind it.
          </p>

          <Button
            asChild
            variant="default"
            className="group h-auto rounded-2xl px-8 py-4 font-semibold shadow-lg transition hover:shadow-xl"
          >
            <Link href="/plans/new" onClick={onCtaClick}>
              Start Free Trial
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>

        {/* Glassmorphism card preview - positioned halfway down the viewport */}
        {/* Negative margins pull the card down to overlap into the next section */}
        <div className="relative mt-12 -mb-32 w-full max-w-7xl md:mt-6 md:-mb-40 lg:mt-0 lg:-mb-48">
          {/* Background glow */}
          <div className="from-primary/30 via-accent/30 to-accent/30 absolute -inset-4 rounded-3xl bg-gradient-to-r blur-xl"></div>

          <div className="dark:bg-card/30 relative rounded-3xl border border-white/40 bg-white/30 p-2 shadow-2xl backdrop-blur-xl dark:border-white/10">
            <div className="dark:from-card/60 dark:to-card/40 rounded-2xl bg-gradient-to-br from-white/80 to-white/40 p-6">
              <div className="from-primary/20 to-accent/20 flex aspect-video items-center justify-center rounded-xl bg-gradient-to-br">
                <div className="text-center">
                  <div className="gradient-brand mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full shadow-lg">
                    <PlayCircle
                      className="h-8 w-8 text-white"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-muted-foreground">
                    See your personalized dashboard in action
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
