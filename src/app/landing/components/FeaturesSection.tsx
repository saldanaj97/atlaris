import { Badge } from '@/components/ui/badge';

/**
 * Features section with glassmorphism cards and AI-powered insights.
 */

interface Feature {
  gradient: string;
  icon: string;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    gradient: 'from-primary to-primary-dark',
    icon: '✨',
    title: 'AI-Powered Learning',
    description:
      'Smart algorithms that understand your learning style and adapt in real-time.',
  },
  {
    gradient: 'from-destructive to-destructive/80',
    icon: '🎯',
    title: 'Goal Tracking',
    description:
      'Set milestones and watch your progress through beautiful visualizations.',
  },
  {
    gradient: 'from-primary to-accent',
    icon: '🔮',
    title: 'Predictive Insights',
    description:
      'Know exactly what to learn next based on your goals and industry trends.',
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative lg:py-32"
      aria-labelledby="features-heading"
    >
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <Badge className="bg-primary/10 text-primary mb-4 px-4 py-1.5">
            Features
          </Badge>
          <h2
            id="features-heading"
            className="text-foreground marketing-h2 mb-4"
          >
            Beautifully <span className="gradient-text">Transparent</span>
          </h2>
          <p className="text-muted-foreground marketing-subtitle mx-auto max-w-2xl">
            Every element designed with clarity in mind, letting you focus on
            what matters most.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group dark:bg-card/40 relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10"
            >
              <div
                className={`absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br ${feature.gradient} opacity-30 blur-2xl`}
                aria-hidden="true"
              ></div>

              <div
                className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient} text-2xl shadow-lg`}
              >
                {feature.icon}
              </div>
              <h3 className="text-foreground mb-3 text-xl font-semibold">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
