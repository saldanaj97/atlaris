type TaskProgressStatus = 'completed' | 'in_progress' | 'not_started';

type TaskProgressSnapshot = {
	status: TaskProgressStatus;
};

type NestedTask = {
	estimatedMinutes?: number | null;
	progress?: TaskProgressSnapshot | null;
};

type NestedModule = {
	tasks: NestedTask[];
};

/**
 * Completion metrics for detail read-models (nested modules + tasks with progress).
 */
export function computeCompletionMetricsFromNestedModules(
	modules: NestedModule[],
): {
	totalTasks: number;
	completedTasks: number;
	totalMinutes: number;
	completedMinutes: number;
	completedModules: number;
} {
	let totalTasks = 0;
	let completedTasks = 0;
	let totalMinutes = 0;
	let completedMinutes = 0;
	let completedModules = 0;

	for (const planModule of modules) {
		let moduleCompleted = planModule.tasks.length > 0;

		for (const task of planModule.tasks) {
			const minutes = task.estimatedMinutes ?? 0;
			totalTasks += 1;
			totalMinutes += minutes;

			if (task.progress?.status === 'completed') {
				completedTasks += 1;
				completedMinutes += minutes;
			} else {
				moduleCompleted = false;
			}
		}

		if (moduleCompleted) {
			completedModules += 1;
		}
	}

	return {
		totalTasks,
		completedTasks,
		totalMinutes,
		completedMinutes,
		completedModules,
	};
}

export function computeTaskRowCompletionMetrics(params: {
	tasks: Array<{ id: string; estimatedMinutes: number | null }>;
	progressByTaskId: Map<string, TaskProgressSnapshot | undefined>;
}): {
	totalTasks: number;
	completedTasks: number;
	totalMinutes: number;
	completedMinutes: number;
} {
	const { tasks, progressByTaskId } = params;
	let completedTasks = 0;
	let totalMinutes = 0;
	let completedMinutes = 0;
	for (const task of tasks) {
		const status = progressByTaskId.get(task.id)?.status;
		const minutes = task.estimatedMinutes ?? 0;
		totalMinutes += minutes;
		if (status === 'completed') {
			completedTasks += 1;
			completedMinutes += minutes;
		}
	}
	return {
		totalTasks: tasks.length,
		completedTasks,
		totalMinutes,
		completedMinutes,
	};
}

export function countCompletedModulesFromFlatTasks(params: {
	modules: Array<{ id: string }>;
	tasksByModuleId: Map<string, Array<{ id: string }>>;
	progressByTaskId: Map<string, TaskProgressSnapshot | undefined>;
}): number {
	return params.modules.filter((planModule) => {
		const moduleTasks = params.tasksByModuleId.get(planModule.id) ?? [];
		return (
			moduleTasks.length > 0 &&
			moduleTasks.every(
				(task) => params.progressByTaskId.get(task.id)?.status === 'completed',
			)
		);
	}).length;
}

/** Running totals while folding pre-aggregated per-module metrics rows. */
type LightweightModuleMetricsTotals = {
	completedTasks: number;
	totalTasks: number;
	totalMinutes: number;
	completedMinutes: number;
	moduleCount: number;
	completedModules: number;
};

/** Mutates the running totals object with one lightweight module metrics row. */
export function accumulateLightweightModuleMetricsRowInPlace(
	current: LightweightModuleMetricsTotals,
	row: {
		totalTasks: number;
		completedTasks: number;
		totalMinutes: number;
		completedMinutes: number;
	},
): void {
	current.completedTasks += row.completedTasks;
	current.totalTasks += row.totalTasks;
	current.totalMinutes += row.totalMinutes;
	current.completedMinutes += row.completedMinutes;
	current.moduleCount += 1;
	if (row.totalTasks > 0 && row.totalTasks === row.completedTasks) {
		current.completedModules += 1;
	}
}
