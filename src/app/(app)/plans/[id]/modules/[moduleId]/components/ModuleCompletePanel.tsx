import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function ModuleCompletePanel({
  planId,
  nextModuleId,
}: {
  planId: string;
  nextModuleId: string | null;
}) {
  return (
    <section className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center shadow-sm dark:border-success/30 dark:bg-success/10">
      <CheckCircle2 className="mx-auto mb-3 size-12 text-success" />
      <h3 className="mb-2 text-xl font-semibold text-success">
        Module Completed!
      </h3>
      <p className="mb-4 text-success/90">
        Great work! You&apos;ve completed all lessons in this module.
      </p>
      {nextModuleId ? (
        <Button asChild variant="success" className="h-auto px-6 py-3">
          <Link href={`/plans/${planId}/modules/${nextModuleId}`}>
            Continue to Next Module
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      ) : (
        <Button asChild variant="success" className="h-auto px-6 py-3">
          <Link href={`/plans/${planId}`}>
            Back to Plan Overview
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      )}
    </section>
  );
}
