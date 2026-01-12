import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface ModuleDetailPageErrorProps {
  message?: string;
  planId?: string;
}

/**
 * Renders a full-screen error UI for the module detail page.
 *
 * Displays a prominent "Error Loading Module" heading, a provided error message or a default
 * fallback message, and navigation options back to the plan or plans list.
 *
 * @param message - Optional custom error message to display instead of the default text
 * @param planId - Optional plan ID for navigation back to the plan
 * @returns The React element representing the error page UI
 */
export function ModuleDetailPageError({
  message,
  planId,
}: ModuleDetailPageErrorProps) {
  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center p-4"
    >
      <div className="rounded-3xl border border-white/50 bg-white/60 p-8 text-center shadow-xl backdrop-blur-xl dark:border-stone-800 dark:bg-stone-900/60">
        <h1 className="mb-4 text-2xl font-bold text-red-600 dark:text-red-400">
          Error Loading Module
        </h1>
        <p className="mb-6 max-w-md text-stone-600 dark:text-stone-400">
          {message ??
            'There was an error loading the module. Please try again later.'}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {planId && (
            <Link
              href={`/plans/${planId}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-white transition hover:bg-purple-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Plan
            </Link>
          )}
          <Link
            href="/plans"
            className="inline-flex items-center justify-center rounded-xl border border-stone-200 bg-white px-4 py-2 text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            View All Plans
          </Link>
        </div>
      </div>
    </div>
  );
}
