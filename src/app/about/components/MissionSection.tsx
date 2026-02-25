/**
 * Mission section explaining what Atlaris does.
 */
export function MissionSection() {
  return (
    <section
      className="relative py-24 lg:py-32"
      aria-labelledby="mission-heading"
    >
      <div className="relative z-10 mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <h2
            id="mission-heading"
            className="text-foreground marketing-h2 mb-4"
          >
            Our <span className="gradient-text">Mission</span>
          </h2>
          <p className="text-muted-foreground marketing-subtitle mx-auto max-w-2xl">
            Bridging the gap between ambition and execution.
          </p>
        </div>

        <div className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <p className="text-muted-foreground mb-4 text-lg leading-relaxed">
              Most people know <em>what</em> they want to learn but struggle
              with <em>how</em> to get there. Generic courses and scattered
              resources leave learners overwhelmed and without direction.
            </p>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Atlaris transforms your learning goals into structured,
              time-blocked plans tailored to your schedule. Our AI analyzes
              thousands of resources, curates the best ones, and maps out a
              day-by-day path — synced directly to your calendar so nothing
              falls through the cracks.
            </p>
          </div>

          <div className="dark:bg-card/40 relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm dark:border-white/10">
            <div
              className="gradient-glow absolute -top-12 -right-12 h-32 w-32 opacity-30"
              aria-hidden="true"
            />

            <div className="space-y-6">
              {HIGHLIGHTS.map((item) => (
                <div key={item.title} className="flex items-start gap-4">
                  <div className="gradient-brand-interactive inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl shadow-lg">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="text-foreground marketing-h3 mb-1">
                      {item.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface Highlight {
  icon: string;
  title: string;
  description: string;
}

const HIGHLIGHTS: Highlight[] = [
  {
    icon: '✨',
    title: 'AI-Powered Plans',
    description:
      'Intelligent scheduling that adapts to your pace, goals, and availability.',
  },
  {
    icon: '📅',
    title: 'Calendar Sync',
    description:
      'Plans sync directly to Google Calendar so learning fits your life.',
  },
  {
    icon: '📚',
    title: 'Curated Resources',
    description:
      'Top-ranked videos, articles, and docs selected for each topic.',
  },
];
