import { SectionOverline } from './SectionOverline';

export function DriftSection() {
  return (
    <section
      className='mx-auto max-w-3xl px-6 py-16 text-center md:px-8 md:py-24'
      aria-labelledby='landing-drift-heading'
    >
      <SectionOverline>The drift</SectionOverline>
      <h2
        id='landing-drift-heading'
        className='mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl'
      >
        Ambition isn&apos;t your problem.
        <span className='block font-medium text-muted-foreground italic'>
          Drift is.
        </span>
      </h2>
      <p className='mx-auto mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg'>
        You&apos;ve started before. The course, the book, the certification. Two
        good weeks — then one busy Thursday, and the map goes dark. Not because
        you stopped caring. Because nothing was holding the route.
      </p>
      <p className='mx-auto mt-4 max-w-xl font-serif text-base font-medium text-foreground sm:text-lg'>
        Atlaris holds the route.
      </p>
    </section>
  );
}
