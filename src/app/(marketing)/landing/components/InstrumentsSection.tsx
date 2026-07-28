import { SectionOverline } from './SectionOverline';
import { BarChart3, ImageIcon } from 'lucide-react';

export function InstrumentsSection() {
  return (
    <section
      className='mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24'
      aria-labelledby='landing-instruments-heading'
    >
      <div className='text-center'>
        <SectionOverline>The instruments</SectionOverline>
        <h2
          id='landing-instruments-heading'
          className='mt-5 font-serif text-3xl font-semibold tracking-[-0.025em] text-balance text-foreground sm:text-4xl'
        >
          Built for the nights you show up.
        </h2>
      </div>

      <div className='mt-16 grid items-center gap-10 md:grid-cols-2 md:gap-14'>
        <div>
          <h3 className='font-serif text-2xl font-semibold tracking-[-0.02em] text-foreground'>
            A plan that remembers where you left off
          </h3>
          <p className='mt-4 font-sans text-base leading-relaxed text-muted-foreground'>
            Modules hold the tasks. Tasks hold the resources. Open Atlaris at
            9pm and tonight&apos;s work is already laid out — no re-deciding, no
            re-searching, no twenty open tabs.
          </p>
          <p className='mt-4 font-serif text-sm font-medium text-primary'>
            Sit down. Start where you stopped.
          </p>
        </div>
        <ScreenshotPlaceholder
          icon={ImageIcon}
          label='Screenshot: plan detail'
          description='The plan detail page showing a learning plan expanded into modules, with tasks and attached resources visible under the active module.'
        />
      </div>

      <div className='mt-16 grid items-center gap-10 md:grid-cols-2 md:gap-14'>
        <ScreenshotPlaceholder
          icon={BarChart3}
          label='Screenshot: progress analytics'
          description='The analytics dashboard with weekly activity, completed modules, and usage trends charted over the past month.'
        />
        <div>
          <h3 className='font-serif text-2xl font-semibold tracking-[-0.02em] text-foreground'>
            Watch your sky fill in
          </h3>
          <p className='mt-4 font-sans text-base leading-relaxed text-muted-foreground'>
            Every finished task becomes a fixed point. Analytics turn scattered
            evenings into a visible trail — what you covered, when you covered
            it, and how far the route still runs.
          </p>
          <p className='mt-4 font-serif text-sm font-medium text-primary'>
            Momentum you can look at.
          </p>
        </div>
      </div>
    </section>
  );
}

function ScreenshotPlaceholder({
  label,
  description,
  icon: Icon,
}: {
  label: string;
  description: string;
  icon: typeof ImageIcon;
}) {
  return (
    <figure className='flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 rounded-4xl border border-dashed border-panel-border/80 bg-card/60 px-8 text-center shadow-sm backdrop-blur-sm'>
      <Icon className='size-6 text-primary/70' aria-hidden='true' />
      <figcaption className='font-serif text-sm font-semibold text-foreground'>
        {label}
      </figcaption>
      <p className='max-w-sm font-sans text-xs leading-relaxed text-muted-foreground'>
        {description}
      </p>
    </figure>
  );
}
