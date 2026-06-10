'use client';

import type { UsageData } from '@/app/_shared/usage-formatting';
import type {
  FilterStatus,
  PlanReadStatus,
} from '@/features/plans/read-projection/types';
import type { PlanSummary } from '@/shared/types/db.types';

import { EmptyPlansList } from '@/app/(app)/plans/components/EmptyPlansList';
import { getPlanStatus } from '@/app/(app)/plans/components/plan-utils';
import { PlanRow } from '@/app/(app)/plans/components/PlanRow';
import { getPlanStatusDotClassName } from '@/app/(app)/plans/plan-status-theme';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

interface PlansListProps {
  summaries: PlanSummary[];
  usage?: UsageData;
  referenceTimestamp: string;
}

const FILTER_TABS: {
  id: FilterStatus;
  label: string;
  status?: PlanReadStatus;
}[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active', status: 'active' },
  { id: 'completed', label: 'Completed', status: 'completed' },
  { id: 'inactive', label: 'Inactive', status: 'paused' },
  { id: 'generating', label: 'Generating', status: 'generating' },
  { id: 'failed', label: 'Failed', status: 'failed' },
];

export function PlansList({
  summaries,
  usage: _usage,
  referenceTimestamp,
}: PlansListProps) {
  const [effectiveReferenceTimestamp] = useState(() => referenceTimestamp);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  const normalizedSearchQuery = searchQuery.toLowerCase();
  const { filteredPlans, statusCounts } = useMemo(() => {
    const statusCounts = {
      active: 0,
      paused: 0,
      completed: 0,
      generating: 0,
      failed: 0,
    } as Record<PlanReadStatus, number>;

    const plansWithStatus = summaries.map((summary) => ({
      summary,
      status: getPlanStatus(summary, effectiveReferenceTimestamp),
    }));

    for (const { status } of plansWithStatus) {
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    const filteredPlans = plansWithStatus
      .filter(({ summary, status }) => {
        const matchesSearch =
          searchQuery === '' ||
          summary.plan.topic.toLowerCase().includes(normalizedSearchQuery);

        const matchesStatus =
          filterStatus === 'all' ||
          status === filterStatus ||
          (filterStatus === 'inactive' && status === 'paused');

        return matchesSearch && matchesStatus;
      })
      .map(({ summary }) => summary);

    return { filteredPlans, statusCounts };
  }, [
    summaries,
    effectiveReferenceTimestamp,
    searchQuery,
    normalizedSearchQuery,
    filterStatus,
  ]);

  function getFilterCount(tab: (typeof FILTER_TABS)[number]): number | null {
    if (tab.id === 'all') return summaries.length;
    if (tab.id === 'inactive') return statusCounts.paused;
    if (tab.status) return statusCounts[tab.status];
    return null;
  }

  return (
    <>
      <div className='relative mb-6'>
        <Search
          className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground'
          aria-hidden='true'
        />
        <Input
          type='search'
          placeholder='Search plans…'
          aria-label='Search learning plans'
          className='h-11 border-border bg-muted/50 pl-9 dark:bg-muted/30'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className='mb-6 flex items-center gap-2 border-b border-border pb-4'>
        <Tabs
          value={filterStatus}
          onValueChange={(value) => setFilterStatus(value as FilterStatus)}
        >
          <TabsList className='h-auto flex-wrap gap-1 bg-transparent p-0'>
            {FILTER_TABS.map((tab) => {
              const count = getFilterCount(tab);
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className='rounded-lg px-3 py-1.5'
                >
                  {tab.status ? (
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        getPlanStatusDotClassName(tab.status),
                      )}
                      aria-hidden='true'
                    />
                  ) : null}
                  {tab.label}
                  {count != null ? (
                    <span className='text-muted-foreground tabular-nums'>
                      ({count})
                    </span>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      <div>
        {filteredPlans.length === 0 ? (
          <EmptyPlansList
            searchQuery={searchQuery}
            filterStatus={filterStatus}
          />
        ) : (
          <div className='space-y-2'>
            {filteredPlans.map((summary, index) => (
              <PlanRow
                key={summary.plan.id}
                summary={summary}
                isSelected={index === selectedIndex}
                onSelect={() => setSelectedIndex(index)}
                referenceTimestamp={effectiveReferenceTimestamp}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
