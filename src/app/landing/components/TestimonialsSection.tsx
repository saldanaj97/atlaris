/**
 * Testimonials section featuring user feedback in glassmorphism cards.
 */

import { StarRating } from './StarRating';

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

interface TestimonialCardProps {
  testimonial: Testimonial;
}

function TestimonialCard({ testimonial }: TestimonialCardProps) {
  return (
    <figure className="rounded-3xl border border-white/50 bg-white/50 p-8 shadow-xl backdrop-blur-sm">
      <div className="mb-6">
        <span className="sr-only">5 out of 5 stars</span>
        <StarRating count={5} />
      </div>
      <blockquote className="mb-6">
        <p className="text-lg leading-relaxed text-gray-700">
          &quot;{testimonial.quote}&quot;
        </p>
      </blockquote>
      <figcaption className="flex items-center">
        <div
          className="mr-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-pink-100 text-2xl"
          aria-hidden="true"
        >
          {testimonial.avatar}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{testimonial.name}</p>
          <p className="text-sm text-purple-600">{testimonial.role}</p>
        </div>
      </figcaption>
    </figure>
  );
}

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
            <TestimonialCard key={testimonial.id} testimonial={testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}
