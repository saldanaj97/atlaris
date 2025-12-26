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
    gradient: 'from-purple-400 to-purple-500',
    icon: '✨',
    title: 'AI-Powered Learning',
    description:
      'Smart algorithms that understand your learning style and adapt in real-time.',
  },
  {
    gradient: 'from-pink-400 to-rose-500',
    icon: '🎯',
    title: 'Goal Tracking',
    description:
      'Set milestones and watch your progress through beautiful visualizations.',
  },
  {
    gradient: 'from-cyan-400 to-blue-500',
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
      className="relative py-24 lg:py-32"
      aria-labelledby="features-heading"
    >
      <div className="mx-auto max-w-screen-xl px-6">
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-purple-100 px-4 py-1.5 text-sm font-medium text-purple-700">
            Features
          </span>
          <h2
            id="features-heading"
            className="mb-4 text-4xl font-bold text-gray-900 md:text-5xl"
          >
            Beautifully{' '}
            <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              Transparent
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-gray-600">
            Every element designed with clarity in mind, letting you focus on
            what matters most.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl"
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
              <h3 className="mb-3 text-xl font-semibold text-gray-900">
                {feature.title}
              </h3>
              <p className="leading-relaxed text-gray-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
