'use client';

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { TimelineModule } from '@/app/(app)/plans/[id]/components/TimelineModuleCard';
import { TimelineModuleCard } from '@/app/(app)/plans/[id]/components/TimelineModuleCard';
import { getStatusesFromModules } from '@/app/(app)/plans/[id]/helpers';
import { Accordion } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { formatMinutes } from '@/features/plans/formatters';
import {
	deriveActiveModuleId,
	deriveCompletedModuleIds,
	deriveModuleProgressState,
} from '@/features/plans/task-progress/client';

import type { ClientModule } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';

interface ModuleTimelineProps {
	planId: string;
	modules: ClientModule[];
	statuses?: Record<string, ProgressStatus>;
	onStatusChange: (taskId: string, newStatus: ProgressStatus) => void;
}

export function PlanTimeline({
	planId,
	modules,
	statuses,
	onStatusChange,
}: ModuleTimelineProps): JSX.Element {
	const effectiveStatuses = useMemo(
		() => statuses ?? getStatusesFromModules(modules),
		[statuses, modules],
	);

	const timelineModules: TimelineModule[] = useMemo(() => {
		return modules.map((mod, index) => {
			const tasks = mod.tasks;
			const previousModulesCompleted = modules
				.slice(0, index)
				.every((prevMod) => {
					const prevTasks = prevMod.tasks;
					return prevTasks.every(
						(task) =>
							(effectiveStatuses[task.id] ?? task.status) === 'completed',
					);
				});
			const completedCount = tasks.filter(
				(task) => (effectiveStatuses[task.id] ?? task.status) === 'completed',
			).length;
			const status = deriveModuleProgressState(
				mod,
				effectiveStatuses,
				previousModulesCompleted,
			);

			return {
				id: mod.id,
				order: index + 1,
				title: mod.title,
				description: mod.description,
				status,
				duration: formatMinutes(mod.estimatedMinutes),
				tasks,
				completedTasks: completedCount,
			};
		});
	}, [modules, effectiveStatuses]);

	const activeModuleId = useMemo(
		() => deriveActiveModuleId(modules, effectiveStatuses),
		[modules, effectiveStatuses],
	);

	const [expandedModuleIds, setExpandedModuleIds] = useState<string[]>(() => {
		return activeModuleId ? [activeModuleId] : [];
	});
	const visibleExpandedModuleIds =
		activeModuleId === null || expandedModuleIds.includes(activeModuleId)
			? expandedModuleIds
			: [...expandedModuleIds, activeModuleId];

	const handleModuleToggle = (moduleId: string) => {
		setExpandedModuleIds((prev) =>
			prev.includes(moduleId)
				? prev.filter((id) => id !== moduleId)
				: [...prev, moduleId],
		);
	};

	const handleTaskStatusChange = (
		taskId: string,
		nextStatus: ProgressStatus,
	) => {
		const currentStatus = effectiveStatuses[taskId] ?? 'not_started';
		const nextStatuses =
			currentStatus === nextStatus
				? effectiveStatuses
				: {
						...effectiveStatuses,
						[taskId]: nextStatus,
					};
		const completedModuleIds = deriveCompletedModuleIds(modules, nextStatuses);
		const nextActiveModuleId = deriveActiveModuleId(modules, nextStatuses);

		setExpandedModuleIds((prev) => {
			const prevWithoutCompleted = prev.filter(
				(moduleId) => !completedModuleIds.has(moduleId),
			);

			if (
				nextActiveModuleId === null ||
				prevWithoutCompleted.includes(nextActiveModuleId)
			) {
				return prevWithoutCompleted;
			}

			return [...prevWithoutCompleted, nextActiveModuleId];
		});

		onStatusChange(taskId, nextStatus);
	};

	if (modules.length === 0) {
		return (
			<Card className="rounded-2xl text-center">
				<CardContent className="p-6">
					<p className="text-stone-500 dark:text-stone-400">
						No modules available yet.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<section className="mt-12">
			<div className="mb-6 flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
					Learning Modules
				</h2>
				<span className="text-sm text-stone-500 dark:text-stone-400">
					{modules.length} module{modules.length !== 1 ? 's' : ''}
				</span>
			</div>

			<div className="relative">
				<div className="from-primary/40 via-primary dark:from-primary/60 dark:via-primary absolute top-0 bottom-0 left-8 w-0.5 -translate-x-1/2 bg-linear-to-b to-stone-200 dark:to-stone-700" />

				<Accordion
					type="multiple"
					value={visibleExpandedModuleIds}
					className="space-y-4"
				>
					{timelineModules.map((mod) => {
						return (
							<TimelineModuleCard
								key={mod.id}
								planId={planId}
								module={mod}
								isOpen={visibleExpandedModuleIds.includes(mod.id)}
								statuses={effectiveStatuses}
								onModuleToggle={handleModuleToggle}
								onTaskStatusChange={handleTaskStatusChange}
							/>
						);
					})}
				</Accordion>
			</div>
		</section>
	);
}
