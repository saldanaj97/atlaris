'use client';

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { TaskWithRelations } from '@/lib/db/queries/types/modules.types';
import { formatMinutes } from '@/lib/formatters';
import type { ProgressStatus, ResourceType } from '@/lib/types/db';
import {
  generatePlaceholderContent,
  hashString,
  type ContentBlock,
} from '@/lib/utils/placeholder-content';
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
import { useMemo } from 'react';
import { TaskStatusButton } from './TaskStatusButton';

interface LessonAccordionItemProps {
  lesson: TaskWithRelations;
  planId: string;
  moduleId: string;
  status: ProgressStatus;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
  /** Whether this lesson is locked (previous lessons/modules not complete) */
  isLocked?: boolean;
}

const RESOURCE_CONFIG: Record<
  ResourceType,
  { label: string; icon: React.ElementType; badgeClass: string }
> = {
  youtube: {
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
    badgeClass:
      'bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400',
  },
};

/**
 * Renders a content block with appropriate styling.
 */
function ContentBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'heading1':
      return (
        <h2 className="mb-4 text-xl font-bold text-stone-900 dark:text-stone-100">
          {block.content}
        </h2>
      );
    case 'heading2':
      return (
        <h3 className="mt-6 mb-3 text-lg font-semibold text-stone-800 dark:text-stone-200">
          {block.content}
        </h3>
      );
    case 'heading3':
      return (
        <h4 className="mt-4 mb-2 text-base font-medium text-stone-700 dark:text-stone-300">
          {block.content}
        </h4>
      );
    case 'paragraph':
      return (
        <p className="mb-4 leading-relaxed text-stone-600 dark:text-stone-400">
          {block.content}
        </p>
      );
    default: {
      // Exhaustive check - TypeScript will error at compile time if a new ContentBlockType is added
      // but this switch statement isn't updated. The _exhaustiveCheck ensures we handle all cases.
      const _exhaustiveCheck: never = block.type;
      return _exhaustiveCheck;
    }
  }
}

/**
 * Locked content overlay component.
 * Shows a blur effect with underlying text as fallback (cannot be bypassed by removing elements).
 */
function LockedContentOverlay() {
  return (
    <div className="relative min-h-[300px] overflow-hidden rounded-xl border border-stone-200/50 dark:border-stone-700/50">
      {/* Fallback text layer - visible if blur is removed via dev tools */}
      <div className="absolute inset-0 flex items-center justify-center bg-stone-100 p-8 text-center dark:bg-stone-800">
        <div className="max-w-md">
          <Lock className="mx-auto mb-4 h-12 w-12 text-stone-400 dark:text-stone-500" />
          <p className="text-lg font-medium text-stone-500 dark:text-stone-400">
            This lesson is locked
          </p>
          <p className="mt-2 text-sm text-stone-400 dark:text-stone-500">
            Complete the previous lessons to unlock this content. Learning is
            most effective when you follow the structured path.
          </p>
        </div>
      </div>

      {/* Blur overlay layer */}
      <div className="absolute inset-0 flex items-center justify-center backdrop-blur-md">
        <div className="rounded-2xl border border-stone-200/50 bg-white/80 p-8 text-center shadow-lg dark:border-stone-700/50 dark:bg-stone-900/80">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
              <Lock className="h-8 w-8 text-stone-400 dark:text-stone-500" />
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

/**
 * Accordion item for a lesson with expandable content.
 * Displays lesson info, status toggle, resources, and placeholder learning content.
 * Supports locked state for enforcing lesson progression.
 */
export function LessonAccordionItem({
  lesson,
  planId,
  moduleId,
  status,
  onStatusChange,
  isLocked = false,
}: LessonAccordionItemProps) {
  const isCompleted = status === 'completed';
  const resources = lesson.resources ?? [];

  // Generate deterministic placeholder content based on lesson ID
  const placeholderContent = useMemo(() => {
    return generatePlaceholderContent({
      seed: hashString(lesson.id),
      topic: lesson.title,
      minSections: 2,
      maxSections: 3,
      minParagraphsPerSection: 1,
      maxParagraphsPerSection: 2,
    });
  }, [lesson.id, lesson.title]);

  // Determine card styling based on state
  const getCardClassName = () => {
    if (isLocked) {
      return 'border-stone-200/50 bg-stone-100/50 opacity-75 dark:border-stone-700/50 dark:bg-stone-800/30';
    }
    if (isCompleted) {
      return 'border-green-200/50 bg-green-50/30 backdrop-blur-sm dark:border-green-800/30 dark:bg-green-950/20';
    }
    return 'border-white/40 bg-white/30 shadow-lg backdrop-blur-xl hover:border-primary/30 hover:shadow-xl dark:border-stone-800/50 dark:bg-stone-900/30 dark:hover:border-primary/30';
  };

  return (
    <AccordionItem
      value={lesson.id}
      disabled={isLocked}
      className={`rounded-2xl border transition-all duration-300 ${getCardClassName()}`}
    >
      <AccordionTrigger
        hideChevron={false}
        className={`items-center px-6 py-4 hover:no-underline [&[data-state=open]>svg]:rotate-180 ${
          isLocked ? 'cursor-not-allowed' : ''
        }`}
      >
        <div className="flex-1 text-left">
          {/* Lesson Header */}
          <div className="mb-2 flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                isLocked
                  ? 'bg-stone-200 text-stone-400 dark:bg-stone-700 dark:text-stone-500'
                  : isCompleted
                    ? 'bg-green-500 text-white'
                    : 'bg-primary/20 text-primary dark:bg-primary/20 dark:text-primary'
              }`}
            >
              {isLocked ? (
                <Lock className="h-4 w-4" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <span className="text-sm font-semibold">{lesson.order}</span>
              )}
            </div>
            <h3
              className={`text-lg font-semibold ${
                isLocked
                  ? 'text-stone-400 dark:text-stone-500'
                  : isCompleted
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-stone-900 dark:text-stone-100'
              }`}
            >
              {lesson.title}
            </h3>
            {isLocked && (
              <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-500 dark:bg-stone-700 dark:text-stone-400">
                Locked
              </span>
            )}
          </div>

          {/* Lesson Description */}
          {lesson.description && (
            <p
              className={`mb-3 ml-11 text-sm leading-relaxed ${
                isLocked
                  ? 'text-stone-400 dark:text-stone-500'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              {lesson.description}
            </p>
          )}

          {/* Lesson Meta */}
          {resources.length > 0 && (
            <div
              className={`mb-3 ml-11 flex flex-wrap items-center gap-4 text-sm ${
                isLocked
                  ? 'text-stone-400 dark:text-stone-500'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <LinkIcon className="h-4 w-4" />
                {resources.length} resource
                {resources.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Estimated Time */}
        <span
          className={`flex shrink-0 items-center text-sm ${
            isLocked
              ? 'text-stone-400 dark:text-stone-500'
              : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {formatMinutes(lesson.estimatedMinutes)}
          </span>
        </span>
      </AccordionTrigger>

      <AccordionContent className="px-6 pb-6">
        <div className="border-t border-stone-200/50 pt-6 dark:border-stone-700/50">
          {isLocked ? (
            /* Locked content overlay */
            <LockedContentOverlay />
          ) : (
            <>
              {/* Learning Resources Section */}
              {resources.length > 0 && (
                <div className="mb-6">
                  <h4 className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-300">
                    Learning Resources
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {resources.map((taskResource) => {
                      const resource = taskResource.resource;
                      const config = RESOURCE_CONFIG[resource.type];
                      const Icon = config.icon;

                      return (
                        <a
                          key={taskResource.id}
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group/resource hover:border-primary/30 dark:hover:border-primary/30 flex items-start gap-3 rounded-xl border border-white/40 bg-white/50 p-4 transition-all hover:bg-white/70 hover:shadow-md dark:border-stone-700/50 dark:bg-stone-800/50 dark:hover:bg-stone-800/70"
                        >
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.badgeClass}`}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="group-hover/resource:text-primary dark:group-hover/resource:text-primary truncate font-medium text-stone-800 dark:text-stone-200">
                                {resource.title}
                              </span>
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                            </div>
                            <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                              <span
                                className={`rounded px-1.5 py-0.5 ${config.badgeClass}`}
                              >
                                {config.label}
                              </span>
                              {resource.durationMinutes && (
                                <span>
                                  {formatMinutes(resource.durationMinutes)}
                                </span>
                              )}
                            </div>
                            {taskResource.notes && (
                              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                                {taskResource.notes}
                              </p>
                            )}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Placeholder Learning Content */}
              <div className="rounded-xl border border-stone-200/50 bg-white/50 p-6 dark:border-stone-700/50 dark:bg-stone-800/30">
                <div className="prose prose-stone dark:prose-invert max-w-none">
                  {placeholderContent.map((block, index) => (
                    <ContentBlockRenderer key={index} block={block} />
                  ))}
                </div>

                {/* Placeholder notice */}
                <div className="mt-6 rounded-lg bg-amber-50/50 p-3 text-center text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
                  This content is placeholder text. AI-generated learning
                  material will appear here.
                </div>
              </div>

              {/* Status Button - At the bottom of the lesson */}
              <div className="mt-6 flex justify-end">
                <TaskStatusButton
                  planId={planId}
                  moduleId={moduleId}
                  taskId={lesson.id}
                  status={status}
                  onStatusChange={onStatusChange}
                />
              </div>
            </>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
