import type { JSX } from 'react';

/**
 * Core values section with glassmorphism cards.
 */
export function ValuesSection(): JSX.Element {
  return (
    <section
      className="relative py-24 lg:py-32"
      aria-labelledby="values-heading"
    >
      <div className="relative z-10 mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <h2 id="values-heading" className="text-foreground marketing-h2 mb-4">
            What We <span className="gradient-text">Believe</span>
          </h2>
          <p className="text-muted-foreground marketing-subtitle mx-auto max-w-2xl">
            The principles that guide every feature we build.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {VALUES.map((value) => (
            <div
              key={value.title}
              className="group dark:bg-card/40 relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl dark:border-white/10"
            >
              <div
                className="gradient-glow absolute -top-12 -right-12 h-32 w-32 opacity-30"
                aria-hidden="true"
              />

              <div className="gradient-brand-interactive mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-lg">
                {value.icon}
              </div>
              <h3 className="text-foreground marketing-h3 mb-3">
                {value.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {value.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface Value {
  icon: string;
  title: string;
  description: string;
}

const VALUES: Value[] = [
  {
    icon: '🔮',
    title: 'Clarity',
    description:
      "Learning shouldn't feel chaotic. We strip away noise and give you a crystal-clear path from where you are to where you want to be.",
  },
  {
    icon: '🎯',
    title: 'Personalization',
    description:
      'No two learners are the same. Every plan is tailored to your goals, schedule, and preferred learning style.',
  },
  {
    icon: '🌍',
    title: 'Accessibility',
    description:
      'Great education should be available to everyone. We curate free and open resources alongside premium content.',
  },
];
