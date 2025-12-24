/**
 * Testimonials section featuring user feedback in glassmorphism cards.
 */

interface Testimonial {
  id: string;
  quote: string;
  name: string;
  role: string;
  avatar: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: 'testimonial-sarah-chen',
    quote:
      "The interface is so clean and intuitive. It's like learning through crystal—pure and undistracted.",
    name: 'Sarah Chen',
    role: 'Product Designer',
    avatar: '👩‍💼',
  },
  {
    id: 'testimonial-james-park',
    quote:
      "Finally, a learning platform that's as beautiful as it is functional. The glassmorphism design is stunning!",
    name: 'James Park',
    role: 'Frontend Developer',
    avatar: '👨‍💻',
  },
  {
    id: 'testimonial-emily-rose',
    quote:
      "The soft, airy design makes long learning sessions feel comfortable. Best UX I've experienced.",
    name: 'Emily Rose',
    role: 'UX Researcher',
    avatar: '👩‍🔬',
  },
];

export function TestimonialsSection() {
  return (
    <section
      className="relative overflow-hidden py-24 lg:py-32"
      aria-labelledby="testimonials-heading"
    >
      <div
        className="absolute top-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gradient-to-br from-purple-200 to-pink-200 opacity-50 blur-3xl"
        aria-hidden="true"
      ></div>

      <div className="relative z-10 mx-auto max-w-screen-xl px-6">
        <h2
          id="testimonials-heading"
          className="mb-16 text-center text-4xl font-bold text-gray-900 md:text-5xl"
        >
          Loved by{' '}
          <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
            Thousands
          </span>
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <div
              key={testimonial.id}
              className="rounded-3xl border border-white/50 bg-white/50 p-8 shadow-xl backdrop-blur-sm"
            >
              <div className="mb-6 flex" aria-hidden="true">
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
                &quot;{testimonial.quote}&quot;
              </p>
              <div className="flex items-center">
                <div
                  className="mr-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-pink-100 text-2xl"
                  aria-hidden="true"
                >
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
  );
}
