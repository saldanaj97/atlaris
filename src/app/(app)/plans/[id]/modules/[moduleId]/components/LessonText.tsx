import type { LessonTextSegment } from '@/features/lesson-content/lesson-text';

import { getStableEntries } from './lessonAccordionStyles';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  parseLessonInline,
  parseLessonText,
} from '@/features/lesson-content/lesson-text';
import { cn } from '@/lib/utils';
import { Fragment } from 'react';

export function LessonInlineText({ text }: { text: string }) {
  return getStableEntries(
    parseLessonInline(text),
    (segment) => `${segment.type}-${segment.text}`,
  ).map(({ key, item }) => {
    switch (item.type) {
      case 'code':
        return (
          <code
            key={key}
            className='rounded-[4px] bg-muted px-1 py-0.5 type-code break-words'
          >
            {item.text}
          </code>
        );
      case 'strong':
        return (
          <strong key={key} className='font-semibold'>
            <LessonInlineText text={item.text} />
          </strong>
        );
      case 'text':
        return <Fragment key={key}>{item.text}</Fragment>;
      default: {
        const _exhaustiveCheck: never = item.type;
        return _exhaustiveCheck;
      }
    }
  });
}

function LessonTable({
  segment,
}: {
  segment: Extract<LessonTextSegment, { type: 'table' }>;
}) {
  return (
    <div className='min-w-0 overflow-hidden rounded-[8px] border border-panel-border bg-background text-foreground'>
      <Table>
        <TableHeader>
          <TableRow>
            {getStableEntries(segment.header, (cell) => cell).map(
              ({ key, item }) => (
                <TableHead key={key} className='whitespace-normal'>
                  <LessonInlineText text={item} />
                </TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {getStableEntries(segment.rows, (row) => row.join('|')).map(
            ({ key, item: row }) => (
              <TableRow key={key}>
                {getStableEntries(row, (cell) => cell).map(
                  ({ key: cellKey, item: cell }) => (
                    <TableCell key={cellKey} className='whitespace-normal'>
                      <LessonInlineText text={cell} />
                    </TableCell>
                  ),
                )}
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * One lesson block's text. `example` text is mostly code, so its prose keeps
 * indentation in the code role; `reading` text keeps line breaks only.
 */
export function LessonText({
  text,
  variant,
  className,
}: {
  text: string;
  variant: 'reading' | 'example';
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-3', className)}>
      {getStableEntries(
        parseLessonText(text),
        (segment) => `${segment.type}-${JSON.stringify(segment)}`,
      ).map(({ key, item }) => {
        switch (item.type) {
          case 'prose':
            return (
              <p
                key={key}
                className={cn(
                  'break-words text-foreground',
                  variant === 'example'
                    ? 'type-code whitespace-pre-wrap'
                    : 'type-reading whitespace-pre-line',
                )}
              >
                <LessonInlineText text={item.text} />
              </p>
            );
          case 'preformatted':
            return (
              <section
                key={key}
                aria-label='Code example'
                className='max-w-full overflow-x-auto rounded-[8px] border border-panel-border bg-background px-3 py-2.5 text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the named overflow region is tabbable so keyboard users can scroll wide code.
                tabIndex={0}
              >
                <pre className='type-code'>
                  <code>{item.text}</code>
                </pre>
              </section>
            );
          case 'table':
            return <LessonTable key={key} segment={item} />;
          default: {
            const _exhaustiveCheck: never = item;
            return _exhaustiveCheck;
          }
        }
      })}
    </div>
  );
}
