import type { ModuleStatus } from '@/app/(app)/plans/plans-progress-theme';
import type { CSSProperties } from 'react';

import { TimelineModuleConnector } from '@/app/(app)/plans/[id]/components/TimelineModuleConnector';
import { TimelineModuleMarker } from '@/app/(app)/plans/[id]/components/TimelineModuleMarker';
import {
  getTimelineCardClassName,
  getTimelineTitleClassName,
} from '@/app/(app)/plans/plans-progress-theme';
import { buttonVariants } from '@/components/ui/button';
import { PageHero } from '@/components/ui/page-hero';
import { Surface } from '@/components/ui/surface';
import {
  buildPlanOverviewDescription,
  formatMinutes,
} from '@/features/plans/formatters';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
} from 'lucide-react';

interface ExampleModule {
  title: string;
  description: string;
  status: ModuleStatus;
  tasks: ReadonlyArray<{ title: string; minutes: number; done: boolean }>;
}

/**
 * Illustrative plan for the landing preview: the hero's example (two weeks,
 * 4 hrs a week, 2 hrs a module). The first two modules are done; Generics in
 * practice has started, and its tasks are the hero's "Current module" rows.
 */
const EXAMPLE_ROADMAP: { topic: string; modules: readonly ExampleModule[] } = {
  topic: 'TypeScript for React',
  modules: [
    {
      title: 'Types that scale',
      description: 'Model props, unions and shared types for components.',
      status: 'completed',
      tasks: [
        { title: 'Read: typing component props', minutes: 40, done: true },
        { title: 'Exercise: discriminated unions', minutes: 40, done: true },
        { title: 'Build: a typed form field', minutes: 40, done: true },
      ],
    },
    {
      title: 'Props and state',
      description: 'Type state, reducers and context without casts.',
      status: 'completed',
      tasks: [
        {
          title: 'Read: typing useState and useReducer',
          minutes: 30,
          done: true,
        },
        {
          title: 'Exercise: a typed context provider',
          minutes: 40,
          done: true,
        },
        { title: 'Build: a typed reducer', minutes: 50, done: true },
      ],
    },
    {
      title: 'Generics in practice',
      description: 'Write reusable components and helpers with generics.',
      status: 'active',
      tasks: [
        { title: 'Read: generic constraints', minutes: 40, done: true },
        { title: 'Exercise: type a fetch helper', minutes: 50, done: true },
        { title: 'Review: Module 3 notes', minutes: 30, done: false },
      ],
    },
    {
      title: 'Typed hooks',
      description: 'Type custom hooks and their return values.',
      status: 'locked',
      tasks: [
        { title: 'Build: a typed useQuery hook', minutes: 90, done: false },
        { title: 'Exercise: a typed useToggle', minutes: 30, done: false },
      ],
    },
  ],
};

const modules = EXAMPLE_ROADMAP.modules;
const tasks = modules.flatMap((module) => module.tasks);
const totalMinutes = tasks.reduce((sum, task) => sum + task.minutes, 0);
const completionPercentage = Math.round(
  (tasks.filter((task) => task.done).length / tasks.length) * 100,
);
const completedModules = modules.filter(
  (module) => module.status === 'completed',
).length;

/** The example plan's size, for the how-it-works step that describes the draft. */
export const EXAMPLE_ROADMAP_SUMMARY = `${modules.length} modules · ${tasks.length} tasks · ${formatMinutes(totalMinutes)} planned`;

/**
 * Static copy of the plan page (overview header and learning path), drawn with
 * the app's tokens and timeline components so it follows the page's theme.
 * Decorative: the caller hides it from assistive technology and describes it.
 */
export function RoadmapPreview() {
  return (
    <div className='flex flex-col gap-4 text-left'>
      <PageHero className='rounded-2xl border border-panel-border bg-panel px-5 py-6'>
        <div className='relative z-10'>
          <p className='type-title-hero text-balance text-foreground'>
            {EXAMPLE_ROADMAP.topic}
          </p>
          <p className='mt-3 type-body text-muted-foreground'>
            {buildPlanOverviewDescription(EXAMPLE_ROADMAP.topic)}
          </p>
          <div className='mt-5 flex flex-wrap items-center gap-3'>
            <span className={buttonVariants({ variant: 'cta' })}>
              Continue learning
              <ArrowRight aria-hidden='true' />
            </span>
            <span className={buttonVariants({ variant: 'outline' })}>
              View roadmap
            </span>
            <span className='type-meta text-muted-foreground tabular-nums'>
              {completionPercentage}% complete · {formatMinutes(totalMinutes)}{' '}
              planned · {completedModules} of {modules.length} modules
            </span>
          </div>
        </div>
        <div className='absolute right-0 bottom-0 left-0 h-1 bg-muted'>
          <div
            className='h-full w-(--plan-progress-width) bg-action-primary'
            style={
              {
                '--plan-progress-width': `${completionPercentage}%`,
              } as CSSProperties
            }
          />
        </div>
      </PageHero>

      <Surface padding='none' className='overflow-hidden'>
        <div className='flex items-end justify-between gap-3 border-b border-border/60 px-5 py-5'>
          <div className='min-w-0'>
            <p className='type-eyebrow text-muted-foreground'>Route</p>
            <p className='mt-1 type-card text-foreground'>Your learning path</p>
            <p className='mt-1 type-body text-muted-foreground'>
              {modules.length} modules · {formatMinutes(totalMinutes)} estimated
            </p>
          </div>
          <span className='shrink-0 type-meta text-muted-foreground'>
            Keep moving at your pace
          </span>
        </div>

        <div className='relative px-3 py-5'>
          <div className='absolute top-8 bottom-8 left-8 w-px -translate-x-1/2 bg-border/70' />
          <ol className='m-0 list-none space-y-4 p-0'>
            {modules.map((module, index) => (
              <ExampleModuleCard
                key={module.title}
                module={module}
                order={index + 1}
              />
            ))}
          </ol>
        </div>
      </Surface>
    </div>
  );
}

function ExampleModuleCard({
  module,
  order,
}: {
  module: ExampleModule;
  order: number;
}) {
  const isOpen = module.status === 'active';
  const minutes = module.tasks.reduce((sum, task) => sum + task.minutes, 0);
  const completedTasks = module.tasks.filter((task) => task.done).length;

  return (
    <li className='relative flex items-stretch'>
      <TimelineModuleConnector status={module.status} />
      <div className='relative flex w-16 shrink-0 items-center justify-center'>
        <TimelineModuleMarker status={module.status} />
      </div>
      {/* oxlint-disable-next-line shadcn/require-static-classes -- Module-state classes come from the finite plan timeline theme. */}
      <div
        className={cn(
          'flex flex-1 flex-col rounded-2xl border',
          getTimelineCardClassName(module.status),
        )}
      >
        <div className='flex gap-4 p-4'>
          <div className='min-w-0 flex-1'>
            <p className='mb-2 type-eyebrow text-muted-foreground'>
              <span
                className={
                  module.status === 'active' ? 'text-primary' : undefined
                }
              >
                Module {order}
              </span>
              {' · '}
              {formatMinutes(minutes)}
              {' · '}
              <span className='tabular-nums'>
                {completedTasks}/{module.tasks.length} tasks
              </span>
            </p>
            {/* oxlint-disable-next-line shadcn/require-static-classes -- Module-state classes come from the finite plan timeline theme. */}
            <p
              className={cn(
                'font-semibold',
                getTimelineTitleClassName(module.status),
              )}
            >
              {module.title}
            </p>
            <p
              className={cn(
                'mt-1 type-body text-muted-foreground',
                !isOpen && 'line-clamp-1',
              )}
            >
              {module.description}
            </p>
          </div>
          <ChevronRight
            size={20}
            className={cn(
              'mt-0.5 shrink-0 text-muted-foreground',
              isOpen ? '-rotate-90' : 'rotate-90',
            )}
          />
        </div>

        {isOpen ? (
          <div className='px-4 pb-4'>
            <ul className='m-0 list-none space-y-3 border-t border-border p-0 pt-4'>
              {module.tasks.map((task) => (
                <li
                  key={task.title}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-4',
                    task.done
                      ? 'border-success/30 bg-success/5 dark:bg-success/10'
                      : 'border-border bg-muted/30 dark:bg-muted/25',
                  )}
                >
                  <CheckCircle2
                    size={18}
                    className={cn(
                      'shrink-0',
                      task.done
                        ? 'fill-success/20 text-success'
                        : 'text-muted-foreground/50',
                    )}
                  />
                  <span className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
                    <span
                      className={cn(
                        'font-medium',
                        task.done ? 'text-success' : 'text-foreground',
                      )}
                    >
                      {task.title}
                    </span>
                    <span className='type-meta text-muted-foreground'>
                      {formatMinutes(task.minutes)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      buttonVariants(),
                      'shrink-0 rounded-md px-4',
                      task.done
                        ? 'border-success bg-success text-success-foreground'
                        : 'border-border bg-secondary text-secondary-foreground',
                    )}
                  >
                    {task.done ? (
                      <CheckCircle2 className='size-5' />
                    ) : (
                      <CircleDashed className='size-5' />
                    )}
                    {task.done ? 'Completed' : 'Mark complete'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  );
}
