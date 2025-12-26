export default function GlassmorphismLight() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-100 via-purple-50 to-cyan-100 font-sans text-gray-800">
      {/* Navigation */}
      <nav className="fixed start-0 top-0 z-50 w-full">
        <div className="mx-auto max-w-screen-xl px-6 py-4">
          <div className="flex items-center justify-between rounded-2xl border border-white/40 bg-white/30 px-6 py-3 shadow-lg backdrop-blur-xl">
            <button type="button" className="flex items-center space-x-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-400 to-pink-400 text-white shadow-lg">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-xl font-semibold text-transparent">
                Atlaris
              </span>
            </button>
            <div className="hidden items-center space-x-8 md:flex">
              <button
                type="button"
                className="text-sm font-medium text-gray-600 transition hover:text-purple-600"
              >
                Features
              </button>
              <button
                type="button"
                className="text-sm font-medium text-gray-600 transition hover:text-purple-600"
              >
                About
              </button>
              <button
                type="button"
                className="text-sm font-medium text-gray-600 transition hover:text-purple-600"
              >
                Pricing
              </button>
              <button
                type="button"
                className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-purple-500/25 transition hover:shadow-xl hover:shadow-purple-500/30"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen overflow-hidden pt-32">
        {/* Floating gradient orbs */}
        <div className="absolute top-20 -left-20 h-96 w-96 rounded-full bg-gradient-to-br from-purple-300 to-pink-200 opacity-60 blur-3xl"></div>
        <div className="absolute top-40 -right-20 h-80 w-80 rounded-full bg-gradient-to-br from-cyan-200 to-blue-200 opacity-60 blur-3xl"></div>
        <div className="absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br from-rose-200 to-orange-100 opacity-60 blur-3xl"></div>

        <div className="relative z-10 mx-auto flex max-w-screen-xl flex-col items-center px-6 pt-16 text-center lg:pt-24">
          <div className="mb-8 inline-flex items-center rounded-full border border-purple-200/50 bg-white/50 px-4 py-2 shadow-lg backdrop-blur-sm">
            <span className="mr-2 h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500"></span>
            <span className="text-sm font-medium text-purple-700">
              Now with AI-powered insights
            </span>
          </div>

          <h1 className="mb-8 max-w-4xl text-5xl leading-tight font-bold tracking-tight text-gray-900 md:text-6xl lg:text-7xl">
            Learn with
            <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-rose-500 bg-clip-text text-transparent">
              {' '}
              crystal clarity
            </span>
          </h1>

          <p className="mb-12 max-w-2xl text-lg leading-relaxed text-gray-600 md:text-xl">
            Experience learning through a beautifully crafted interface that's
            as clear as glass and as powerful as the technology behind it.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              className="group flex items-center justify-center rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 px-8 py-4 text-white shadow-xl shadow-purple-500/25 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-purple-500/30"
            >
              <span className="font-medium">Start Free Trial</span>
              <svg
                className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </button>
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

      {/* Features Section */}
      <section className="relative py-24 lg:py-32">
        <div className="mx-auto max-w-screen-xl px-6">
          <div className="mb-16 text-center">
            <span className="mb-4 inline-block rounded-full bg-purple-100 px-4 py-1.5 text-sm font-medium text-purple-700">
              Features
            </span>
            <h2 className="mb-4 text-4xl font-bold text-gray-900 md:text-5xl">
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
            {[
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
            ].map((feature, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-3xl border border-white/50 bg-white/40 p-8 shadow-xl backdrop-blur-sm transition hover:-translate-y-1 hover:shadow-2xl"
              >
                <div
                  className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-30 blur-2xl"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))`,
                  }}
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

      {/* Testimonials */}
      <section className="relative overflow-hidden py-24 lg:py-32">
        <div className="absolute top-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gradient-to-br from-purple-200 to-pink-200 opacity-50 blur-3xl"></div>

        <div className="relative z-10 mx-auto max-w-screen-xl px-6">
          <h2 className="mb-16 text-center text-4xl font-bold text-gray-900 md:text-5xl">
            Loved by{' '}
            <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              Thousands
            </span>
          </h2>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                quote:
                  "The interface is so clean and intuitive. It's like learning through crystal—pure and undistracted.",
                name: 'Sarah Chen',
                role: 'Product Designer',
                avatar: '👩‍💼',
              },
              {
                quote:
                  "Finally, a learning platform that's as beautiful as it is functional. The glassmorphism design is stunning!",
                name: 'James Park',
                role: 'Frontend Developer',
                avatar: '👨‍💻',
              },
              {
                quote:
                  "The soft, airy design makes long learning sessions feel comfortable. Best UX I've experienced.",
                name: 'Emily Rose',
                role: 'UX Researcher',
                avatar: '👩‍🔬',
              },
            ].map((testimonial, i) => (
              <div
                key={i}
                className="rounded-3xl border border-white/50 bg-white/50 p-8 shadow-xl backdrop-blur-sm"
              >
                <div className="mb-6 flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <svg
                      key={star}
                      className="h-5 w-5 text-amber-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="mb-6 text-lg leading-relaxed text-gray-700">
                  "{testimonial.quote}"
                </p>
                <div className="flex items-center">
                  <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-pink-100 text-2xl">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      {testimonial.name}
                    </div>
                    <div className="text-sm text-purple-600">
                      {testimonial.role}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden py-24 lg:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>

        {/* Glass overlay pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 left-10 h-64 w-64 rounded-full bg-white blur-3xl"></div>
          <div className="absolute right-10 bottom-10 h-48 w-48 rounded-full bg-white blur-3xl"></div>
        </div>

        <div className="relative z-10 mx-auto max-w-screen-xl px-6 text-center">
          <div className="mx-auto max-w-3xl rounded-3xl border border-white/30 bg-white/10 p-12 backdrop-blur-xl">
            <h2 className="mb-6 text-4xl font-bold text-white md:text-5xl">
              Ready for Clarity?
            </h2>
            <p className="mx-auto mb-10 max-w-xl text-lg text-white/90">
              Join thousands of learners who've found their focus with Atlaris.
              Start your journey today—for free.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <button
                type="button"
                className="rounded-2xl bg-white px-8 py-4 font-semibold text-purple-600 shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl"
              >
                Start Free Trial
              </button>
              <button
                type="button"
                className="rounded-2xl border border-white/40 bg-white/10 px-8 py-4 font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                Schedule Demo
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
