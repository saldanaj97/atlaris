'use client';

import { Button } from '@/components/ui/button';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { getPlanStatus } from './plan-utils';
import { PlanRow } from './PlanRow';

import type { FilterStatus, PlanStatus } from '@/app/plans/types';
import type { PlanSummary } from '@/lib/types/db';

interface PlansListProps {
  summaries: PlanSummary[];
  limitsReached?: boolean;
  usage?: {
    tier: string;
    activePlans: { current: number; limit: number };
    regenerations: { used: number; limit: number };
    exports: { used: number; limit: number };
  };
}

export function PlansList({
  summaries,
  limitsReached: _limitsReached = false,
  usage: _usage,
}: PlansListProps) {
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
      const status = getPlanStatus(summary);
      const matchesStatus =
        filterStatus === 'all' ||
        status === filterStatus ||
        (filterStatus === 'inactive' && status === 'paused');

      return matchesSearch && matchesStatus;
    });
  }, [summaries, searchQuery, filterStatus]);

  const statusCounts = useMemo(() => {
    return summaries.reduce(
      (acc, summary) => {
        const status = getPlanStatus(summary);
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
  }, [summaries]);

  return (
    <div className="font-sans">
      {/* Header */}
      <header className="mb-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold">Your Plans</h1>
            <span className="bg-muted-foreground/10 text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
              {summaries.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button asChild>
              <Link href="/plans/new">
                <Plus className="h-4 w-4" />
                New Plan
              </Link>
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="border-border bg-muted-foreground/5 flex w-full items-center gap-3 rounded-xl border px-4 py-3">
          <Search className="text-muted-foreground h-4 w-4" />
          <input
            type="text"
            placeholder="Search plans..."
            className="text-foreground placeholder:text-muted-foreground flex-1 bg-transparent text-sm focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      {/* Filters Bar */}
      <div className="mb-6 flex items-center gap-4 border-b pb-4">
        <Button
          onClick={() => setFilterStatus('all')}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            filterStatus === 'all'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted-foreground/5 hover:text-foreground'
          }`}
        >
          All Plans
        </Button>
        <Button
          onClick={() => setFilterStatus('active')}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
            filterStatus === 'active'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted-foreground/5 hover:text-foreground'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Active ({statusCounts.active})
        </Button>
        <Button
          onClick={() => setFilterStatus('completed')}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
            filterStatus === 'completed'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted-foreground/5 hover:text-foreground'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          Completed ({statusCounts.completed})
        </Button>
        <Button
          onClick={() => setFilterStatus('inactive')}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
            filterStatus === 'inactive'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted-foreground/5 hover:text-foreground'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Inactive ({statusCounts.paused})
        </Button>
        <Button
          onClick={() => setFilterStatus('generating')}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
            filterStatus === 'generating'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted-foreground/5 hover:text-foreground'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-purple-500" />
          Generating ({statusCounts.generating})
        </Button>
        <Button
          onClick={() => setFilterStatus('failed')}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
            filterStatus === 'failed'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted-foreground/5 hover:text-foreground'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Failed ({statusCounts.failed})
        </Button>
      </div>

      {/* Main Content */}
      <div>
        {filteredPlans.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center">
            <p>No plans found matching your filters.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredPlans.map((summary, index) => (
              <PlanRow
                key={summary.plan.id}
                summary={summary}
                isSelected={index === selectedIndex}
                onSelect={() => setSelectedIndex(index)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
