'use client';

import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ActivityFilter, ActivityFilterTab } from '../types';

interface ActivityFilterTabsProps {
	activeFilter: ActivityFilter;
	onFilterChange: (filter: ActivityFilter) => void;
}

const DEFAULT_FILTER_TABS: ActivityFilterTab[] = [
	{ id: 'all', label: 'All' },
	{ id: 'session', label: 'Sessions' },
	{ id: 'milestone', label: 'Milestones' },
	{ id: 'progress', label: 'Progress' },
	{ id: 'export', label: 'Exports' },
];

export function ActivityFilterTabs({
	activeFilter,
	onFilterChange,
}: ActivityFilterTabsProps) {
	return (
		<div className="mb-6 flex items-center gap-2 border-b border-border pb-4">
			<Tabs
				value={activeFilter}
				onValueChange={(v) => onFilterChange(v as ActivityFilter)}
			>
				<TabsList className="h-auto gap-1 bg-transparent p-0">
					{DEFAULT_FILTER_TABS.map((tab) => (
						<TabsTrigger key={tab.id} value={tab.id} className="rounded-lg">
							{tab.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			<Button
				variant="ghost"
				size="icon-sm"
				className="ml-auto rounded-lg text-muted-foreground"
				aria-label="Filter options"
			>
				<Filter className="h-4 w-4" />
			</Button>
		</div>
	);
}
