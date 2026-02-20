import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PlanCountBadgeContent,
  PlansContent,
  PlansContentSkeleton,
} from '@/app/plans/components/PlansContent';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Your Plans | Atlaris',
  description:
    'View, search, and manage your learning plans and track your progress in Atlaris.',
  openGraph: {
    title: 'Your Plans | Atlaris',
    description:
      'View, search, and manage your learning plans and track your progress in Atlaris.',
    url: '/plans',
    images: ['/og-default.jpg'],
  },
};

/**
 * Plans list page with Suspense boundaries for data-dependent content.
 *
 * Static elements (title, "New Plan" button) render immediately.
 * Data-dependent elements (plan count badge, search bar, filters, plans list) are wrapped in Suspense.
 */
export default function PlansPage() {
  return (
    <div className="mx-auto min-h-screen max-w-7xl">
      {/* Static header - renders immediately */}
      <header className="mb-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1>Your Plans</h1>
            {/* Plan count badge - data-dependent */}
            <Suspense fallback={<Skeleton className="h-6 w-16 rounded-full" />}>
              <PlanCountBadgeContent />
            </Suspense>
          </div>

          <Button asChild>
            <Link href="/plans/new">
              <Plus className="h-4 w-4" />
              New Plan
            </Link>
          </Button>
        </div>
      </header>

      {/* Data-dependent content (search, filters, list) - wrapped in Suspense */}
      <Suspense fallback={<PlansContentSkeleton />}>
        <PlansContent />
      </Suspense>
    </div>
  );
}
