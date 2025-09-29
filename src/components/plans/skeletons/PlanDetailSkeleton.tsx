/**
 * Loading skeleton for the plan detail page
 */
export function PlanDetailSkeleton() {
  return (
    <div className="container mx-auto max-w-5xl px-6 py-12">
      {/* Header section */}
      <div className="mb-8 space-y-3">
        <div className="bg-muted h-8 w-3/4 animate-pulse rounded-md" />
        <div className="bg-muted h-4 w-1/2 animate-pulse rounded-md" />
      </div>

      {/* Progress bar skeleton */}
      <div className="bg-muted mb-8 h-2 w-full animate-pulse rounded-full" />

      {/* Module cards skeleton */}
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <ModuleCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for individual module card
 */
function ModuleCardSkeleton() {
  return (
    <div className="bg-card rounded-lg border p-6 shadow-sm">
      {/* Module title skeleton */}
      <div className="bg-muted mb-4 h-6 w-2/3 animate-pulse rounded-md" />

      {/* Task items skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <TaskItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for individual task item
 */
function TaskItemSkeleton() {
  return (
    <div className="flex items-center gap-3">
      {/* Checkbox skeleton */}
      <div className="bg-muted h-4 w-4 flex-shrink-0 animate-pulse rounded border" />

      {/* Task text skeleton */}
      <div className="bg-muted h-4 flex-1 animate-pulse rounded-md" />
    </div>
  );
}
