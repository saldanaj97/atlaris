'use client';

import { Filter } from 'lucide-react';

interface ActivityFilterTabsProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  tabs?: FilterTab[];
}

interface FilterTab {
  id: string;
  label: string;
}

const DEFAULT_FILTER_TABS: FilterTab[] = [
  { id: 'all', label: 'All Activity' },
  { id: 'session', label: 'Sessions' },
  { id: 'milestone', label: 'Milestones' },
  { id: 'progress', label: 'Progress' },
];

export function ActivityFilterTabs({
  activeFilter,
  onFilterChange,
}: ActivityFilterTabsProps) {
  return (
    <div className="mb-6 flex items-center gap-2 border-b border-slate-200 pb-4">
      {DEFAULT_FILTER_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onFilterChange(tab.id)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeFilter === tab.id
              ? 'bg-slate-900 text-white'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          {tab.label}
        </button>
      ))}
      <button
        type="button"
        className="ml-auto flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-100"
      >
        <Filter className="h-4 w-4" />
      </button>
    </div>
  );
}
