import type { LessonSource } from '@/features/plans/read-projection/types';

import { ExternalLink } from 'lucide-react';

// Fixed locale and time zone so server and client render the same date.
const RETRIEVED_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

export function LessonSourceList({ sources }: { sources: LessonSource[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <section className='mt-6'>
      <h4 className='mb-3 type-label font-semibold text-foreground'>Sources</h4>
      <ol className='space-y-3'>
        {sources.map((source) => (
          <li key={source.citationKey} className='min-w-0'>
            {/* Matches the inline `[S1]` markers in the lesson text. */}
            <span className='mr-1.5 type-meta font-mono text-muted-foreground'>
              [{source.citationKey}]
            </span>
            <a
              href={source.url}
              target='_blank'
              rel='noopener noreferrer'
              className='type-body break-words text-link underline underline-offset-2 hover:text-link-hover'
            >
              {source.title}
              <span className='sr-only'> (opens in a new tab)</span>
              <ExternalLink
                aria-hidden='true'
                className='ml-1 inline size-3.5 align-[-0.125em]'
              />
            </a>
            <p className='mt-0.5 type-meta break-words text-muted-foreground'>
              {source.publisher ? `${source.publisher} · ` : null}
              Retrieved{' '}
              <time dateTime={source.retrievedAt.toISOString()}>
                {RETRIEVED_DATE_FORMATTER.format(source.retrievedAt)}
              </time>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
