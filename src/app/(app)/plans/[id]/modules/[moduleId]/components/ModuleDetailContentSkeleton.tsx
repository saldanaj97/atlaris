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
                <Skeleton className='h-3.5 w-3.5' />
                <Skeleton className='h-4 w-32' />
              </div>
            </li>
            <li>
              <Skeleton className='h-4 w-4' />
            </li>
            <li>
              <Skeleton className='h-8 w-24 rounded-lg' />
            </li>
          </ol>
        </nav>

        {/* Hero Card skeleton */}
        <div className='relative overflow-hidden rounded-2xl border border-panel-border bg-panel p-6 shadow-sm sm:p-7'>
          <div className='flex min-h-62 flex-col justify-between'>
            <div className='flex items-start justify-between'>
              <div className='flex flex-wrap gap-2'>
                <Skeleton className='h-6 w-32 rounded-full' />
              </div>

              <div className='flex gap-2'>
                <Skeleton className='h-8 w-8 rounded-full' />
                <Skeleton className='h-8 w-8 rounded-full' />
              </div>
            </div>

            <div>
              <Skeleton className='mb-2 h-10 w-full max-w-md md:h-12' />
              <Skeleton className='h-6 w-full max-w-xl' />
            </div>
          </div>

          <div className='absolute right-0 bottom-0 left-0 h-1 bg-muted'>
            <Skeleton className='h-full w-1/4' />
          </div>
        </div>

        {/* Stats Grid skeleton */}
        <div className='mt-4 grid gap-4 sm:grid-cols-3'>
          {[1, 2, 3].map((statSkeletonId) => (
            <StatCardSkeleton key={`module-stat-skeleton-${statSkeletonId}`} />
          ))}
        </div>
      </article>

      {/* Lessons Section skeleton */}
      <section>
        <div className='mb-6 flex items-center justify-between'>
          <Skeleton className='h-8 w-24' />
          <Skeleton className='h-5 w-28' />
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

function StatCardSkeleton() {
  return (
    <Surface padding='compact'>
      <div className='mb-3 flex items-center gap-2'>
        <Skeleton className='h-5 w-5' />
        <Skeleton className='h-3 w-16' />
      </div>
      <Skeleton className='mb-1 h-8 w-20' />
      <Skeleton className='h-3 w-24' />
    </Surface>
  );
}

function LessonAccordionSkeleton() {
  return (
    <Surface>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-4'>
          {/* Checkbox/status skeleton */}
          <Skeleton className='h-6 w-6 rounded-full' />
          <div className='space-y-1.5'>
            <Skeleton className='h-5 w-56' />
            <div className='flex items-center gap-3'>
              <Skeleton className='h-3.5 w-16' />
              <Skeleton className='h-3.5 w-12' />
            </div>
          </div>
        </div>
        {/* Expand icon */}
        <Skeleton className='h-5 w-5' />
      </div>
    </Surface>
  );
}
