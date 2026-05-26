import type { ModuleDetailTask } from '@/features/plans/read-projection/types';
import type { LessonContentBlock } from '@/shared/types/lesson-content.types';

import { getStableEntries } from './lessonAccordionStyles';
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
        <h3 className='mt-6 mb-3 text-lg font-semibold text-foreground first:mt-0'>
          {block.text}
        </h3>
      );
    case 'paragraph':
      return (
        <p className='mb-4 leading-relaxed text-muted-foreground'>
          {block.text}
        </p>
      );
    case 'example':
      return (
        <section className='my-5 rounded-xl border border-primary/15 bg-primary/5 p-4'>
          <h4 className='mb-2 text-sm font-semibold text-primary'>
            {block.title}
          </h4>
          <p className='leading-relaxed text-muted-foreground'>{block.text}</p>
        </section>
      );
    case 'practice':
      return (
        <section className='my-5 rounded-xl border border-accent/20 bg-accent/10 p-4'>
          <h4 className='mb-2 text-sm font-semibold text-foreground'>
            Practice
          </h4>
          <p className='leading-relaxed text-muted-foreground'>{block.text}</p>
        </section>
      );
    case 'takeaways':
      return (
        <section className='my-5'>
          <h4 className='mb-2 text-sm font-semibold text-foreground'>
            Key takeaways
          </h4>
          <ul className='list-disc space-y-2 pl-5 text-muted-foreground'>
            {getStableEntries(block.items, (item) => item).map(
              ({ key, item }) => (
                <li key={key}>{item}</li>
              ),
            )}
          </ul>
        </section>
      );
    case 'completion_criteria':
      return (
        <section className='my-5'>
          <h4 className='mb-2 text-sm font-semibold text-foreground'>
            Completion criteria
          </h4>
          <ul className='space-y-2 text-muted-foreground'>
            {getStableEntries(block.items, (item) => item).map(
              ({ key, item }) => (
                <li key={key} className='flex gap-2'>
                  <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-success' />
                  <span>{item}</span>
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
    <div className='rounded-xl border border-panel-border bg-panel p-6 shadow-sm'>
      <div className='max-w-none'>
        {getStableEntries(lessonContent.blocks, getLessonBlockKey).map(
          ({ key, item }) => (
            <LessonContentBlockRenderer key={key} block={item} />
          ),
        )}
      </div>
    </div>
  );
}

function MissingLessonContentPanel() {
  return (
    <div className='rounded-xl border border-dashed border-primary/25 bg-primary/5 p-6 text-center'>
      <h4 className='mb-2 text-base font-semibold text-foreground'>
        Lesson content not generated yet
      </h4>
      <p className='mx-auto max-w-xl text-sm text-muted-foreground'>
        Use the module-level generate action to create and cache detailed
        learning material for every lesson in this module.
      </p>
    </div>
  );
}

export function LessonBodyPanel({ lesson }: { lesson: ModuleDetailTask }) {
  if (lesson.lessonContent) {
    return <GeneratedContentPanel lessonContent={lesson.lessonContent} />;
  }

  return <MissingLessonContentPanel />;
}
