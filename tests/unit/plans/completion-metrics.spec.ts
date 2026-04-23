import { createId } from '@tests/fixtures/ids';
import { buildModuleRows, buildPlan } from '@tests/fixtures/plan-detail';
import { describe, expect, it } from 'vitest';
import {
	accumulateLightweightModuleMetricsRowInPlace,
	computeCompletionMetricsFromNestedModules,
	computeTaskRowCompletionMetrics,
	countCompletedModulesFromFlatTasks,
} from '@/features/plans/read-projection/completion-metrics';
import { buildPlanSummaries } from '@/features/plans/read-projection/summary-projection';

type SummaryTaskRow = {
	id: string;
	moduleId: string;
	planId: string;
	estimatedMinutes: number | null;
};

function buildTaskRow(
	overrides: Partial<SummaryTaskRow> &
		Pick<SummaryTaskRow, 'id' | 'moduleId' | 'planId'>,
): SummaryTaskRow {
	return {
		estimatedMinutes: null,
		...overrides,
	};
}

describe('completion-metrics', () => {
	it('computeCompletionMetricsFromNestedModules aggregates nested tasks', () => {
		const metrics = computeCompletionMetricsFromNestedModules([
			{
				tasks: [
					{ estimatedMinutes: 10, progress: { status: 'completed' } },
					{ estimatedMinutes: 20, progress: { status: 'not_started' } },
				],
			},
			{
				tasks: [{ estimatedMinutes: 5, progress: { status: 'completed' } }],
			},
		]);

		expect(metrics).toEqual({
			totalTasks: 3,
			completedTasks: 2,
			totalMinutes: 35,
			completedMinutes: 15,
			completedModules: 1,
		});
	});

	it('computeTaskRowCompletionMetrics + countCompletedModules match buildPlanSummaries', () => {
		const plan = buildPlan({ id: createId('plan') });
		const modules = buildModuleRows(plan.id, 2);
		const tasks: SummaryTaskRow[] = [
			buildTaskRow({
				id: createId('task-a'),
				moduleId: modules[0].id,
				planId: plan.id,
				estimatedMinutes: 15,
			}),
			buildTaskRow({
				id: createId('task-b'),
				moduleId: modules[0].id,
				planId: plan.id,
				estimatedMinutes: 25,
			}),
			buildTaskRow({
				id: createId('task-c'),
				moduleId: modules[1].id,
				planId: plan.id,
				estimatedMinutes: 40,
			}),
		];
		const progressRows = [
			{ taskId: tasks[0].id, status: 'completed' as const },
			{ taskId: tasks[1].id, status: 'completed' as const },
			{ taskId: tasks[2].id, status: 'in_progress' as const },
		];
		const progressByTask = new Map(progressRows.map((r) => [r.taskId, r]));

		const tasksByPlan = new Map<string, SummaryTaskRow[]>();
		const tasksByModule = new Map<string, SummaryTaskRow[]>();
		for (const task of tasks) {
			tasksByPlan.set(task.planId, [
				...(tasksByPlan.get(task.planId) ?? []),
				task,
			]);
			tasksByModule.set(task.moduleId, [
				...(tasksByModule.get(task.moduleId) ?? []),
				task,
			]);
		}

		const [summary] = buildPlanSummaries({
			planRows: [plan],
			moduleRows: modules,
			taskRows: tasks,
			progressRows,
		});

		const tasksForPlan = tasksByPlan.get(plan.id) ?? [];
		const metrics = computeTaskRowCompletionMetrics({
			tasks: tasksForPlan,
			progressByTaskId: progressByTask,
		});
		const completedModules = countCompletedModulesFromFlatTasks({
			modules,
			tasksByModuleId: tasksByModule,
			progressByTaskId: progressByTask,
		});

		expect(metrics.totalTasks).toBe(summary.totalTasks);
		expect(metrics.completedTasks).toBe(summary.completedTasks);
		expect(metrics.totalMinutes).toBe(summary.totalMinutes);
		expect(metrics.completedMinutes).toBe(summary.completedMinutes);
		expect(completedModules).toBe(summary.completedModules);
	});

	it('accumulateLightweightModuleMetricsRowInPlace matches inline aggregation', () => {
		const inline = {
			completedTasks: 0,
			totalTasks: 0,
			totalMinutes: 0,
			completedMinutes: 0,
			moduleCount: 0,
			completedModules: 0,
		};
		const merged = {
			completedTasks: 0,
			totalTasks: 0,
			totalMinutes: 0,
			completedMinutes: 0,
			moduleCount: 0,
			completedModules: 0,
		};
		const rows = [
			{
				totalTasks: 2,
				completedTasks: 2,
				totalMinutes: 10,
				completedMinutes: 10,
			},
			{
				totalTasks: 1,
				completedTasks: 0,
				totalMinutes: 5,
				completedMinutes: 0,
			},
			{
				totalTasks: 3,
				completedTasks: 3,
				totalMinutes: 9,
				completedMinutes: 9,
			},
		];
		for (const row of rows) {
			inline.completedTasks += row.completedTasks;
			inline.totalTasks += row.totalTasks;
			inline.totalMinutes += row.totalMinutes;
			inline.completedMinutes += row.completedMinutes;
			inline.moduleCount += 1;
			if (row.totalTasks > 0 && row.totalTasks === row.completedTasks) {
				inline.completedModules += 1;
			}
			accumulateLightweightModuleMetricsRowInPlace(merged, row);
		}
		expect(merged).toEqual(inline);
	});
});
