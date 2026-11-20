import type { PanelState } from './generationPanelState';
import type { ModuleDetailTask } from '@/features/plans/read-projection/types';
import type { LessonContentBlock } from '@/shared/types/lesson-content.types';

import { getStableEntries } from './lessonAccordionStyles';
import { LessonInlineText, LessonText } from './LessonText';
import { CheckCircle2 } from 'lucide-react';

function getLessonBlockKey(block: LessonContentBlock): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'practice':
      return `${block.type}-${block.text}`;
    case 'example':
      return `${block.type}-${block.title}-${block.text}`;
    case 'takeaways':
    case 'completion_criteria':
      return `${block.type}-${block.items.join('|')}`;
    default: {
      const _exhaustiveCheck: never = block;
      return _exhaustiveCheck;
    }
  }
}

function LessonContentBlockRenderer({ block }: { block: LessonContentBlock }) {
  switch (block.type) {
    case 'heading':
      return (
        <h3 className='mt-6 mb-3 type-section break-words text-foreground first:mt-0'>
          <LessonInlineText text={block.text} />
        </h3>
      );
    case 'paragraph':
      return (
        <LessonText text={block.text} variant='reading' className='mb-4' />
      );
    case 'example':
      return (
        <section className='my-5 min-w-0 rounded-[8px] border border-input bg-panel-muted px-3 py-2.5'>
          <h4 className='mb-2 type-meta font-medium break-words text-muted-foreground'>
            <LessonInlineText text={block.title} />
          </h4>
          <LessonText text={block.text} variant='example' />
        </section>
      );
    case 'practice':
      return (
        <section className='my-5 min-w-0 rounded-[8px] border border-accent/20 bg-accent/10 p-3'>
          <h4 className='mb-2 type-label font-semibold break-words text-foreground'>
            Practice
          </h4>
          <LessonText text={block.text} variant='reading' />
        </section>
      );
    case 'takeaways':
      return (
        <section className='my-5 rounded-[8px] border border-primary/40 bg-action-soft p-3'>
          <h4 className='mb-2 type-label text-primary'>Key takeaways</h4>
          <ul className='list-disc space-y-2 pl-5 type-body break-words text-foreground'>
            {getStableEntries(block.items, (item) => item).map(
              ({ key, item }) => (
                <li key={key}>
                  <LessonInlineText text={item} />
                </li>
              ),
            )}
          </ul>
        </section>
      );
    case 'completion_criteria':
      return (
        <section className='my-5'>
          <h4 className='mb-2 type-label font-semibold text-foreground'>
            Completion criteria
          </h4>
          <ul className='space-y-2 text-muted-foreground'>
            {getStableEntries(block.items, (item) => item).map(
              ({ key, item }) => (
                <li key={key} className='flex min-w-0 gap-2'>
                  <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-success' />
                  <span className='min-w-0 break-words'>
                    <LessonInlineText text={item} />
                  </span>
                </li>
              ),
            )}
          </ul>
        </section>
      );
    default: {
      const _exhaustiveCheck: never = block;
      return _exhaustiveCheck;
    }
  }
}

function GeneratedContentPanel({
  lessonContent,
}: {
  lessonContent: NonNullable<ModuleDetailTask['lessonContent']>;
}) {
  return (
    <div className='max-w-full min-w-0 overflow-hidden rounded-lg border border-panel-border bg-panel p-4 shadow-sm sm:p-6'>
      <div className='max-w-[70ch] min-w-0'>
        {getStableEntries(lessonContent.blocks, getLessonBlockKey).map(
          ({ key, item }) => (
            <LessonContentBlockRenderer key={key} block={item} />
          ),
        )}
      </div>
    </div>
  );
}

const MISSING_CONTENT_COPY: Record<
  PanelState | 'idle',
  { title: string; body: string }
> = {
  failed: {
    title: 'Lesson content could not be generated',
    body: 'Use Retry lesson generation above to try again.',
  },
  running: {
    title: 'Lesson content is being generated',
    body: 'It will appear here when generation finishes.',
  },
  idle: {
    title: 'Lesson content not generated yet',
    body: 'Detailed learning material for this lesson is not available yet.',
  },
};

function MissingLessonContentPanel({
  generationState,
}: {
  generationState: PanelState | undefined;
}) {
  const copy = MISSING_CONTENT_COPY[generationState ?? 'idle'];

  return (
    <div className='min-w-0 rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-center sm:p-6'>
      <h4 className='mb-2 type-reading font-semibold text-foreground'>
        {copy.title}
      </h4>
      <p className='mx-auto max-w-xl type-body break-words text-muted-foreground'>
        {copy.body}
      </p>
    </div>
  );
}

export function LessonBodyPanel({
  lesson,
  generationState,
}: {
  lesson: ModuleDetailTask;
  generationState?: PanelState;
}) {
  if (lesson.lessonContent) {
    return <GeneratedContentPanel lessonContent={lesson.lessonContent} />;
  }

  return <MissingLessonContentPanel generationState={generationState} />;
}
