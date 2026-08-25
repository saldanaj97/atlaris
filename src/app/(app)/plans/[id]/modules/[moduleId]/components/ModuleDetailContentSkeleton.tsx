import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';

/**
 * Skeleton for the module detail content.
 * Shown while the async component is loading.
 */
export function ModuleDetailContentSkeleton() {
  return (
    <div className='space-y-8'>
      {/* ModuleHeader skeleton */}
      <article className='mb-8'>
        {/* Breadcrumb Navigation skeleton */}
        <nav className='mb-6'>
          <ol className='flex items-center gap-1 text-sm'>
            <li>
              <div className='flex items-center gap-1.5 rounded-lg px-2.5 py-1.5'>
                <Skeleton className='size-3.5' />
                <Skeleton className='h-4 w-32' />
              </div>
            </li>
            <li>
              <Skeleton className='size-4' />
            </li>
            <li>
              <Skeleton className='h-8 w-24 rounded-lg' />
            </li>
          </ol>
        </nav>

        {/* Hero Card skeleton */}
        <div className='relative overflow-hidden rounded-2xl border border-panel-border bg-panel p-5 shadow-sm sm:p-6'>
          <div className='flex flex-col gap-6 sm:flex-row sm:items-stretch sm:justify-between'>
            <div className='min-w-0 flex-1'>
              <Skeleton className='mb-4 h-3 w-32 bg-secondary' />
              <Skeleton className='mb-2 h-8 w-full max-w-md' />
              <Skeleton className='h-4 w-full max-w-xl bg-muted' />
            </div>

            <div className='hidden shrink-0 flex-col items-end justify-between gap-6 border-l border-border/50 py-1 pl-7 sm:flex'>
              <div className='flex gap-2'>
                <Skeleton className='size-8 rounded-full' />
                <Skeleton className='size-8 rounded-full' />
              </div>
              <div className='space-y-1.5'>
                <Skeleton className='h-9 w-16' />
                <Skeleton className='ml-auto h-3 w-14 bg-muted' />
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* Lessons Section skeleton */}
      <section>
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
    </div>
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
