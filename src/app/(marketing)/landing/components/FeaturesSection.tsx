import { useId } from 'react';
import { Badge } from '@/components/ui/badge';

/**
 * Features section with glassmorphism cards and AI-powered insights.
 */

interface Feature {
  icon: string;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: '✨',
    title: 'AI-Powered Learning',
    description:
      'Smart algorithms that understand your learning style and adapt in real-time.',
  },
  {
    icon: '🎯',
    title: 'Goal Tracking',
    description:
      'Set milestones and watch your progress through beautiful visualizations.',
  },
  {
    icon: '🔮',
    title: 'Predictive Insights',
    description:
      'Know exactly what to learn next based on your goals and industry trends.',
  },
];

export function FeaturesSection() {
  const sectionId = useId();
  const headingId = `${sectionId}-heading`;

  return (
    <section
      id={sectionId}
      className="relative lg:py-32"
      aria-labelledby={headingId}
    >
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <Badge
            variant="glassmorphic"
            className="mb-4 bg-primary/10 px-4 py-1.5 text-primary"
          >
            Features
          </Badge>
          <h2 id={headingId} className="marketing-h2 mb-4 text-foreground">
            Beautifully <span className="gradient-text">Transparent</span>
          </h2>
          <p className="marketing-subtitle mx-auto max-w-2xl text-muted-foreground">
            Every element designed with clarity in mind, letting you focus on
            what matters most.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10 dark:bg-card/40"
            >
              <div
                className="gradient-glow absolute -top-12 -right-12 h-32 w-32 opacity-30"
                aria-hidden="true"
              ></div>

              <div className="brand-fill-interactive mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-lg">
                {feature.icon}
              </div>
              <h3 className="marketing-card-title mb-3">{feature.title}</h3>
              <p className="leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
