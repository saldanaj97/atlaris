/**
 * Loading skeleton for the plans list page
 */
export function PlanListSkeleton() {
  return (
    <div className="container mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="bg-muted h-9 w-48 animate-pulse rounded-md" />
        <div className="bg-muted h-10 w-28 animate-pulse rounded-md" />
      </div>

      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <PlanCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for individual plan card
 */
function PlanCardSkeleton() {
  return (
    <div className="bg-card rounded-lg border p-6 shadow-sm">
      {/* Title skeleton */}
      <div className="bg-muted mb-2 h-6 w-3/4 animate-pulse rounded-md" />

      {/* Subtitle skeleton */}
      <div className="bg-muted mb-4 h-4 w-1/2 animate-pulse rounded-md" />

      {/* Progress bar skeleton */}
      <div className="bg-muted h-2 w-full animate-pulse rounded-full" />
    </div>
  );
}
