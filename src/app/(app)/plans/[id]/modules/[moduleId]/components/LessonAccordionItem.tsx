'use client';

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { formatMinutes } from '@/features/plans/formatters';
import type { ModuleDetailTask } from '@/features/plans/read-projection/types';
import { cn } from '@/lib/utils';
import type { ProgressStatus, ResourceType } from '@/shared/types/db.types';
import type { LessonContentBlock } from '@/shared/types/lesson-content.types';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Lock,
  PlayCircle,
  Target,
} from 'lucide-react';
import { type ElementType, type JSX } from 'react';
import { TaskStatusButton } from './TaskStatusButton';

interface LessonAccordionItemProps {
  lesson: ModuleDetailTask;
  status: ProgressStatus;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
  isLocked?: boolean;
}

const RESOURCE_CONFIG: Record<
  ResourceType,
  { label: string; icon: ElementType; badgeClass: string }
> = {
  video: {
    label: 'Video',
    icon: PlayCircle,
    badgeClass:
      'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400',
  },
  article: {
    label: 'Article',
    icon: FileText,
    badgeClass:
      'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
  },
  course: {
    label: 'Course',
    icon: Target,
    badgeClass:
      'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
  },
  doc: {
    label: 'Documentation',
    icon: FileText,
    badgeClass:
      'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary',
  },
  other: {
    label: 'Resource',
    icon: LinkIcon,
    badgeClass: 'bg-muted text-muted-foreground dark:bg-muted/80',
  },
};

type LessonResources = NonNullable<ModuleDetailTask['resources']>;

function getCardClassName(isLocked: boolean, isCompleted: boolean): string {
  if (isLocked) {
    return 'border-stone-200/50 bg-stone-100/50 opacity-75 dark:border-stone-700/50 dark:bg-stone-800/30';
  }
  if (isCompleted) {
    return 'border-success/30 bg-success/5 dark:border-success/30 dark:bg-success/10';
  }
  return 'border-panel-border bg-panel shadow-sm hover:border-primary/30 hover:shadow-md dark:border-border dark:hover:border-primary/30';
}

function getMarkerClassName(isLocked: boolean, isCompleted: boolean): string {
  if (isLocked) {
    return 'bg-stone-200 text-stone-400 dark:bg-stone-700 dark:text-stone-500';
  }
  if (isCompleted) {
    return 'bg-success text-success-foreground';
  }
  return 'bg-primary/20 text-primary dark:bg-primary/20 dark:text-primary';
}

function getTitleClassName(isLocked: boolean, isCompleted: boolean): string {
  if (isLocked) {
    return 'text-stone-400 dark:text-stone-500';
  }
  if (isCompleted) {
    return 'text-success dark:text-success';
  }
  return 'text-stone-900 dark:text-stone-100';
}

function getMutedTextClassName(isLocked: boolean): string {
  return isLocked
    ? 'text-stone-400 dark:text-stone-500'
    : 'text-stone-500 dark:text-stone-400';
}

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

function getStableEntries<T>(
  items: readonly T[],
  getSignature: (item: T) => string,
): Array<{ key: string; item: T }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const signature = getSignature(item);
    const occurrence = seen.get(signature) ?? 0;
    seen.set(signature, occurrence + 1);
    return { key: `${signature}-${occurrence}`, item };
  });
}

function LessonContentBlockRenderer({ block }: { block: LessonContentBlock }) {
  switch (block.type) {
    case 'heading':
      return (
        <h3 className="mt-6 mb-3 text-lg font-semibold text-stone-900 first:mt-0 dark:text-stone-100">
          {block.text}
        </h3>
      );
    case 'paragraph':
      return (
        <p className="mb-4 leading-relaxed text-stone-600 dark:text-stone-400">
          {block.text}
        </p>
      );
    case 'example':
      return (
        <section className="my-5 rounded-xl border border-primary/15 bg-primary/5 p-4">
          <h4 className="mb-2 text-sm font-semibold text-primary">
            {block.title}
          </h4>
          <p className="leading-relaxed text-stone-600 dark:text-stone-300">
            {block.text}
          </p>
        </section>
      );
    case 'practice':
      return (
        <section className="my-5 rounded-xl border border-accent/20 bg-accent/10 p-4">
          <h4 className="mb-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
            Practice
          </h4>
          <p className="leading-relaxed text-stone-600 dark:text-stone-300">
            {block.text}
          </p>
        </section>
      );
    case 'takeaways':
      return (
        <section className="my-5">
          <h4 className="mb-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
            Key takeaways
          </h4>
          <ul className="list-disc space-y-2 pl-5 text-stone-600 dark:text-stone-400">
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
        <section className="my-5">
          <h4 className="mb-2 text-sm font-semibold text-stone-800 dark:text-stone-100">
            Completion criteria
          </h4>
          <ul className="space-y-2 text-stone-600 dark:text-stone-400">
            {getStableEntries(block.items, (item) => item).map(
              ({ key, item }) => (
                <li key={key} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
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
    <div className="rounded-xl border border-panel-border bg-panel p-6 shadow-sm">
      <div className="max-w-none">
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
    <div className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-6 text-center">
      <h4 className="mb-2 text-base font-semibold text-stone-900 dark:text-stone-100">
        Lesson content not generated yet
      </h4>
      <p className="mx-auto max-w-xl text-sm text-stone-600 dark:text-stone-400">
        Use the module-level generate action to create and cache detailed
        learning material for every lesson in this module.
      </p>
    </div>
  );
}

function LessonBodyPanel({ lesson }: { lesson: ModuleDetailTask }) {
  if (lesson.lessonContent) {
    return <GeneratedContentPanel lessonContent={lesson.lessonContent} />;
  }

  return <MissingLessonContentPanel />;
}

function LessonMarker({
  lesson,
  isCompleted,
  isLocked,
}: {
  lesson: ModuleDetailTask;
  isCompleted: boolean;
  isLocked: boolean;
}) {
  return (
    <div
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full',
        getMarkerClassName(isLocked, isCompleted),
      )}
    >
      {isLocked ? (
        <Lock className="size-4" />
      ) : isCompleted ? (
        <CheckCircle2 className="size-5" />
      ) : (
        <span className="text-sm font-semibold">{lesson.order}</span>
      )}
    </div>
  );
}

function ResourceSummary({
  isLocked,
  resourceCount,
}: {
  isLocked: boolean;
  resourceCount: number;
}) {
  if (resourceCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'mb-3 ml-11 flex flex-wrap items-center gap-4 text-sm',
        getMutedTextClassName(isLocked),
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <LinkIcon className="size-4" />
        {resourceCount} resource{resourceCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

function LessonTriggerContent({
  lesson,
  isCompleted,
  isLocked,
  resourceCount,
}: {
  lesson: ModuleDetailTask;
  isCompleted: boolean;
  isLocked: boolean;
  resourceCount: number;
}) {
  return (
    <>
      <div className="flex-1 text-left">
        <div className="mb-2 flex items-center gap-3">
          <LessonMarker
            lesson={lesson}
            isCompleted={isCompleted}
            isLocked={isLocked}
          />
          <h3
            className={cn(
              'text-lg font-semibold',
              getTitleClassName(isLocked, isCompleted),
            )}
          >
            {lesson.title}
          </h3>
          {isLocked ? (
            <Badge variant="secondary" className="border-transparent">
              Locked
            </Badge>
          ) : null}
        </div>

        {lesson.description ? (
          <p
            className={cn(
              'mb-3 ml-11 text-sm leading-relaxed',
              getMutedTextClassName(isLocked),
            )}
          >
            {lesson.description}
          </p>
        ) : null}

        <ResourceSummary isLocked={isLocked} resourceCount={resourceCount} />
      </div>

      <span
        className={cn(
          'flex shrink-0 items-center text-sm',
          getMutedTextClassName(isLocked),
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4" />
          {formatMinutes(lesson.estimatedMinutes)}
        </span>
      </span>
    </>
  );
}

function LockedContentOverlay() {
  return (
    <div className="relative min-h-75 overflow-hidden rounded-xl border border-stone-200/50 dark:border-stone-700/50">
      <div className="flex min-h-75 items-center justify-center bg-background/90 p-8 dark:bg-background/85">
        <div className="max-w-sm rounded-2xl border border-panel-border bg-panel p-8 text-center text-panel-foreground shadow-sm">
          <div className="mb-4 flex justify-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
              <Lock className="size-8 text-stone-400 dark:text-stone-500" />
            </div>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-stone-700 dark:text-stone-300">
            Lesson Locked
          </h3>
          <p className="max-w-xs text-sm text-stone-500 dark:text-stone-400">
            Complete the previous lessons to unlock this content.
          </p>
        </div>
      </div>
    </div>
  );
}

function LearningResourceCard({
  resource,
}: {
  resource: LessonResources[number];
}) {
  const config = RESOURCE_CONFIG[resource.type];
  const Icon = config.icon;

  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/resource flex items-start gap-3 rounded-xl border border-panel-border bg-panel p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md dark:hover:border-primary/30"
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          config.badgeClass,
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="truncate font-medium text-stone-800 group-hover/resource:text-primary dark:text-stone-200 dark:group-hover/resource:text-primary">
            {resource.title}
          </span>
          <ExternalLink className="size-3 shrink-0 opacity-50" />
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
          <Badge
            className={cn(
              'rounded border-transparent px-1.5',
              config.badgeClass,
            )}
          >
            {config.label}
          </Badge>
          {resource.durationMinutes ? (
            <span>{formatMinutes(resource.durationMinutes)}</span>
          ) : null}
        </div>
        {resource.notes ? (
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            {resource.notes}
          </p>
        ) : null}
      </div>
    </a>
  );
}

function LearningResources({ resources }: { resources: LessonResources }) {
  if (resources.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h4 className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-300">
        Learning Resources
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {resources.map((resource) => (
          <LearningResourceCard key={resource.id} resource={resource} />
        ))}
      </div>
    </div>
  );
}

function LessonContent({
  lesson,
  onStatusChange,
  resources,
  status,
}: {
  lesson: ModuleDetailTask;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
  resources: LessonResources;
  status: ProgressStatus;
}) {
  return (
    <>
      <LearningResources resources={resources} />
      <LessonBodyPanel lesson={lesson} />

      <div className="mt-6 flex justify-end">
        <TaskStatusButton
          taskId={lesson.id}
          status={status}
          onStatusChange={onStatusChange}
        />
      </div>
    </>
  );
}

export function LessonAccordionItem({
  lesson,
  status,
  onStatusChange,
  isLocked = false,
}: LessonAccordionItemProps): JSX.Element {
  const isCompleted = status === 'completed';
  const resources = lesson.resources ?? [];

  return (
    <AccordionItem
      value={lesson.id}
      disabled={isLocked}
      className={cn(
        'rounded-2xl border transition-all duration-300',
        getCardClassName(isLocked, isCompleted),
      )}
    >
      <AccordionTrigger
        hideChevron={false}
        className={cn(
          'items-center px-6 py-4 hover:no-underline [&[data-state=open]>svg]:rotate-180',
          isLocked && 'cursor-not-allowed',
        )}
      >
        <LessonTriggerContent
          lesson={lesson}
          isCompleted={isCompleted}
          isLocked={isLocked}
          resourceCount={resources.length}
        />
      </AccordionTrigger>

      <AccordionContent className="px-6 pb-6">
        <div className="border-t border-stone-200/50 pt-6 dark:border-stone-700/50">
          {isLocked ? (
            <LockedContentOverlay />
          ) : (
            <LessonContent
              lesson={lesson}
              status={status}
              onStatusChange={onStatusChange}
              resources={resources}
            />
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
