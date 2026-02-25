import { Badge } from '@/components/ui/badge';

/**
 * Hero section for the About page with mission statement.
 */
export function HeroSection() {
  return (
    <section
      className="relative py-24 lg:py-32"
      aria-labelledby="about-hero-heading"
    >
      <div className="relative z-10 mx-auto max-w-screen-xl px-6 text-center">
        <Badge variant="glassmorphic" className="mb-6 px-4 py-2">
          <span className="from-primary to-accent mr-2 h-2 w-2 rounded-full bg-gradient-to-r" />
          About Atlaris
        </Badge>

        <h1
          id="about-hero-heading"
          className="text-foreground marketing-h1 mx-auto max-w-4xl leading-tight font-bold tracking-tight"
        >
          Learning reimagined with{' '}
          <span className="gradient-text">AI precision</span>
        </h1>

        <p className="text-muted-foreground marketing-subtitle mx-auto mt-6 max-w-2xl">
          We believe everyone deserves a clear, personalized path to mastering
          new skills. Atlaris turns ambitious learning goals into structured,
          actionable plans — powered by AI.
        </p>
      </div>
    </section>
  );
}
