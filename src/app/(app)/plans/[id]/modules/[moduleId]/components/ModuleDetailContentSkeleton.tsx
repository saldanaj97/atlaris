import { LoadingStatus } from '@/components/ui/loading-status';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';

/**
 * Skeleton for the module detail content.
 * Shown while the async component is loading.
 */
export function ModuleDetailContentSkeleton() {
  return (
    <section aria-label='Loading module' aria-busy='true' className='space-y-8'>
      <LoadingStatus>Loading module</LoadingStatus>
      {/* ModuleHeader skeleton */}
      <article className='mb-8'>
        {/* Breadcrumb Navigation skeleton */}
        <nav className='mb-6 min-w-0' aria-hidden='true'>
          <ol className='flex max-w-full min-w-0 flex-wrap items-center gap-1 type-body'>
            <li className='max-w-full min-w-0'>
              <div className='flex items-center gap-1.5 rounded-lg px-2.5 py-1.5'>
                <Skeleton className='size-3.5' />
                <Skeleton className='h-4 w-32' />
              </div>
            </li>
            <li className='shrink-0'>
              <Skeleton className='size-4' />
            </li>
            <li className='max-w-full min-w-0'>
              <Skeleton className='h-8 w-24 rounded-lg' />
            </li>
          </ol>
        </nav>

        {/* Hero Card skeleton */}
        <div className='rounded-lg border border-panel-border bg-panel p-5 shadow-sm sm:p-6'>
          <div className='flex min-w-0 items-start justify-between gap-4'>
            <Skeleton className='h-9 w-full max-w-md' />
            <div className='flex shrink-0 gap-2'>
              <Skeleton className='size-8 rounded-full' />
              <Skeleton className='size-8 rounded-full' />
            </div>
          </div>
          <Skeleton className='mt-3 h-6 w-full max-w-xl bg-muted' />
          <div className='mt-4 flex min-w-0 flex-wrap gap-x-5 gap-y-2'>
            <Skeleton className='h-4 w-20 bg-muted' />
            <Skeleton className='h-4 w-20 bg-muted' />
            <Skeleton className='h-4 w-28 bg-muted' />
          </div>
        </div>
      </article>

      {/* Lessons Section skeleton */}
      <section aria-hidden='true'>
        <div className='mb-6 flex items-baseline justify-between border-b border-border pb-2'>
          <Skeleton className='h-3 w-20 bg-secondary' />
          <Skeleton className='h-3 w-24' />
        </div>

        {/* Lesson accordion items skeleton */}
        <div className='space-y-4'>
          {[1, 2, 3, 4, 5].map((lessonSkeletonId) => (
            <LessonAccordionSkeleton
              key={`module-lesson-skeleton-${lessonSkeletonId}`}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

function LessonAccordionSkeleton() {
  return (
    <Surface>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-4'>
          {/* Checkbox/status skeleton */}
          <Skeleton className='size-6 rounded-full' />
          <div className='space-y-1.5'>
            <Skeleton className='h-5 w-56' />
            <div className='flex items-center gap-3'>
              <Skeleton className='h-3.5 w-16' />
              <Skeleton className='h-3.5 w-12' />
            </div>
          </div>
        </div>
        {/* Expand icon */}
        <Skeleton className='size-5' />
      </div>
    </Surface>
  );
}
