'use client';

import type { JSX } from 'react';

import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPlansList } from '@/app/plans/components/EmptyPlansList';
import { getPlanStatus } from '@/app/plans/components/plan-utils';
import { PlanRow } from '@/app/plans/components/PlanRow';

import type { FilterStatus, PlanStatus } from '@/app/plans/types';
import type { PlanSummary } from '@/lib/types/db';

interface UsageData {
  tier: string;
  activePlans: { current: number; limit: number };
  regenerations: { used: number; limit: number };
  exports: { used: number; limit: number };
}

interface PlansListProps {
  summaries: PlanSummary[];
  usage?: UsageData;
  referenceTimestamp: string;
}

export function PlansList({
  summaries,
  usage: _usage,
  referenceTimestamp,
}: PlansListProps): JSX.Element {
  const [effectiveReferenceTimestamp] = useState(() => referenceTimestamp);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  const filteredPlans = useMemo(() => {
    return summaries.filter((summary) => {
      // Search filter
      const matchesSearch =
        searchQuery === '' ||
        summary.plan.topic.toLowerCase().includes(searchQuery.toLowerCase());

      // Status filter
      const status = getPlanStatus(summary, effectiveReferenceTimestamp);
      const matchesStatus =
        filterStatus === 'all' ||
        status === filterStatus ||
        (filterStatus === 'inactive' && status === 'paused');

      return matchesSearch && matchesStatus;
    });
  }, [summaries, searchQuery, filterStatus, effectiveReferenceTimestamp]);

  const statusCounts = useMemo(() => {
    return summaries.reduce(
      (acc, summary) => {
        const status = getPlanStatus(summary, effectiveReferenceTimestamp);
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {
        active: 0,
        paused: 0,
        completed: 0,
        generating: 0,
        failed: 0,
      } as Record<PlanStatus, number>
    );
  }, [summaries, effectiveReferenceTimestamp]);

  return (
    <div className="font-sans">
      {/* Search Bar */}
      <div className="border-border bg-muted-foreground/5 dark:bg-foreground/5 mb-8 flex w-full items-center gap-3 rounded-xl border px-4 py-3">
        <Search className="text-muted-foreground h-4 w-4" aria-hidden="true" />
        <input
          type="text"
          placeholder="Search plans..."
          aria-label="Search learning plans"
          className="text-foreground placeholder:text-muted-foreground flex-1 bg-transparent text-sm focus:outline-none"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Filters Bar */}
      <div className="border-border mb-6 flex items-center gap-4 border-b pb-4">
        <Button
          onClick={() => setFilterStatus('all')}
          variant={filterStatus === 'all' ? 'default' : 'outline'}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition"
        >
          All Plans
        </Button>
        <Button
          onClick={() => setFilterStatus('active')}
          variant={filterStatus === 'active' ? 'default' : 'outline'}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Active ({statusCounts.active})
        </Button>
        <Button
          onClick={() => setFilterStatus('completed')}
          variant={filterStatus === 'completed' ? 'default' : 'outline'}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition"
        >
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          Completed ({statusCounts.completed})
        </Button>
        <Button
          onClick={() => setFilterStatus('inactive')}
          variant={filterStatus === 'inactive' ? 'default' : 'outline'}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Inactive ({statusCounts.paused})
        </Button>
        <Button
          onClick={() => setFilterStatus('generating')}
          variant={filterStatus === 'generating' ? 'default' : 'outline'}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition"
        >
          <span className="bg-primary h-2 w-2 rounded-full" />
          Generating ({statusCounts.generating})
        </Button>
        <Button
          onClick={() => setFilterStatus('failed')}
          variant={filterStatus === 'failed' ? 'default' : 'outline'}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition"
        >
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Failed ({statusCounts.failed})
        </Button>
      </div>

      {/* Main Content */}
      <div>
        {filteredPlans.length === 0 ? (
          <EmptyPlansList
            searchQuery={searchQuery}
            filterStatus={filterStatus}
          />
        ) : (
          <div className="space-y-1">
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
    </div>
  );
}
