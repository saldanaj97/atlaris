import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';

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
      <Surface
        padding="none"
        className="max-w-lg rounded-3xl p-8 text-center shadow-md"
      >
        <h1 className="mb-4 text-2xl font-bold text-red-600 dark:text-red-400">
          Error Loading Module
        </h1>
        <p className="mb-6 max-w-md text-foreground/90">
          {message ??
            'There was an error loading the module. Please try again later.'}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {planId && (
            <Button asChild>
              <Link href={`/plans/${planId}`}>
                <ArrowLeft className="h-4 w-4" />
                Back to Plan
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/plans">View All Plans</Link>
          </Button>
        </div>
      </Surface>
    </div>
  );
}
