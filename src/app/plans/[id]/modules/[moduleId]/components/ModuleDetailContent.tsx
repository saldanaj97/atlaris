import { Skeleton } from '@/components/ui/skeleton';
import { logger } from '@/lib/logging/logger';
import { redirect } from 'next/navigation';

import { getModuleForPage } from '../actions';
import { getModuleError, isModuleSuccess } from '../helpers';

import { ModuleDetailPageError } from './Error';
import { ModuleDetail } from './ModuleDetail';

interface ModuleDetailContentProps {
  planId: string;
  moduleId: string;
}

/**
 * Async component that fetches module data and renders the appropriate view.
 * Wrapped in Suspense boundary by the parent page.
 */
export async function ModuleDetailContent({
  planId,
  moduleId,
}: ModuleDetailContentProps) {
  const moduleResult = await getModuleForPage(moduleId);

  // Handle module access errors with explicit error codes
  if (!isModuleSuccess(moduleResult)) {
    const error = getModuleError(moduleResult);
    const code = error.code;
    const message = error.message;

    logger.warn(
      { moduleId, planId, errorCode: code },
      `Module access denied: ${message}`
    );

    switch (code) {
      case 'UNAUTHORIZED':
        // User needs to authenticate - redirect to sign-in
        redirect(`/sign-in?redirect_url=/plans/${planId}/modules/${moduleId}`);

      case 'NOT_FOUND':
        // Module doesn't exist or user doesn't have access
        return (
          <ModuleDetailPageError
            message="This module does not exist or you do not have access to it."
            planId={planId}
          />
        );

      case 'FORBIDDEN':
        // User is authenticated but explicitly not allowed
        return (
          <ModuleDetailPageError
            message="You do not have permission to view this module."
            planId={planId}
          />
        );

      case 'INTERNAL_ERROR':
      default:
        // Unexpected error - show generic message
        return (
          <ModuleDetailPageError
            message="Something went wrong. Please try again later."
            planId={planId}
          />
        );
    }
  }

  // TypeScript now knows moduleResult.success is true, so data exists
  return <ModuleDetail moduleData={moduleResult.data} />;
}

/**
 * Skeleton for the module detail content.
 * Shown while the async component is loading.
 */
export function ModuleDetailContentSkeleton() {
  return (
    <div className="space-y-8">
      {/* ModuleHeader skeleton */}
      <article className="mb-8">
        {/* Breadcrumb Navigation skeleton */}
        <nav className="mb-6">
          <ol className="flex items-center gap-1 text-sm">
            <li>
              <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
                <Skeleton className="h-3.5 w-3.5" />
                <Skeleton className="h-4 w-32" />
              </div>
            </li>
            <li>
              <Skeleton className="h-4 w-4" />
            </li>
            <li>
              <Skeleton className="h-8 w-24 rounded-lg" />
            </li>
          </ol>
        </nav>

        {/* Hero Card skeleton */}
        <div className="from-primary/20 via-accent/20 to-primary/20 relative overflow-hidden rounded-3xl bg-gradient-to-br p-8 shadow-2xl">
          <div className="relative z-10 flex min-h-[200px] flex-col justify-between">
            {/* Top Row: Module Badge and Navigation */}
            <div className="flex items-start justify-between">
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-32 rounded-full bg-white/30" />
              </div>

              {/* Module Navigation skeleton */}
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded-full bg-white/30" />
                <Skeleton className="h-8 w-8 rounded-full bg-white/30" />
              </div>
            </div>

            {/* Module Title and Description skeleton */}
            <div>
              <Skeleton className="mb-2 h-10 w-full max-w-md bg-white/30 md:h-12" />
              <Skeleton className="h-6 w-full max-w-xl bg-white/30" />
            </div>
          </div>

          {/* Progress bar overlay */}
          <div className="absolute right-0 bottom-0 left-0 h-1 bg-black/20">
            <Skeleton className="h-full w-1/4 bg-white/50" />
          </div>
        </div>

        {/* Stats Grid skeleton */}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      </article>

      {/* Lessons Section skeleton */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-5 w-28" />
        </div>

        {/* Lesson accordion items skeleton */}
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <LessonAccordionSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/30 p-4 shadow-lg backdrop-blur-xl dark:border-stone-800/50 dark:bg-stone-900/30">
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="mb-1 h-8 w-20" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

function LessonAccordionSkeleton() {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/30 p-5 shadow-lg backdrop-blur-xl dark:border-stone-800/50 dark:bg-stone-900/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Checkbox/status skeleton */}
          <Skeleton className="h-6 w-6 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-56" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-3.5 w-12" />
            </div>
          </div>
        </div>
        {/* Expand icon */}
        <Skeleton className="h-5 w-5" />
      </div>
    </div>
  );
}
