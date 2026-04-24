'use client';

import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import {
	type ReactElement,
	useCallback,
	useLayoutEffect,
	useMemo,
	useOptimistic,
	useRef,
	useTransition,
} from 'react';
import { batchUpdateTaskProgressAction } from '@/app/plans/[id]/actions';
import { ExportButtons } from '@/app/plans/[id]/components/ExportButtons';
import { PlanOverviewHeader } from '@/app/plans/[id]/components/PlanOverviewHeader';
import { PlanPendingState } from '@/app/plans/[id]/components/PlanPendingState';
import { PlanTimeline } from '@/app/plans/[id]/components/PlanTimeline';
import {
	computeOverviewStats,
	getStatusesFromModules,
} from '@/app/plans/[id]/helpers';
import { DeletePlanDialog } from '@/app/plans/components/DeletePlanDialog';
import { Button } from '@/components/ui/button';
import { useTaskStatusBatcher } from '@/hooks/useTaskStatusBatcher';
import { getLoggableErrorDetails } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';

import type { ClientPlanDetail } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';

interface PlanDetailClientProps {
	plan: ClientPlanDetail;
}

/**
 * Client component that keeps header progress in sync with timeline status changes.
 */
export function PlanDetails({ plan }: PlanDetailClientProps): ReactElement {
	const modules = plan.modules;
	const initialStatuses = getStatusesFromModules(modules);

	const [statuses, addOptimisticStatus] = useOptimistic(
		initialStatuses,
		(
			current: Record<string, ProgressStatus>,
			update: { taskId: string; status: ProgressStatus },
		) => ({
			...current,
			[update.taskId]: update.status,
		}),
	);

	// Store the ref object, not a snapshot value, so `handleStatusChange` can read
	// the pre-optimistic status from `statusesRef.current` when queueing a revert.
	// `useLayoutEffect` then updates the ref after each committed render so the next
	// interaction always sees the latest committed statuses.
	const statusesRef = useRef(statuses);
	useLayoutEffect(() => {
		statusesRef.current = statuses;
	}, [statuses]);

	const [_isPending, startTransition] = useTransition();

	const batcher = useTaskStatusBatcher({
		flushAction: async (updates) => {
			await batchUpdateTaskProgressAction({ planId: plan.id, updates });
		},
	});

	const overviewStats = useMemo(
		() => computeOverviewStats(plan, statuses),
		[plan, statuses],
	);

	const handleStatusChange = useCallback(
		(taskId: string, nextStatus: ProgressStatus) => {
			const previousStatus = statusesRef.current[taskId] ?? 'not_started';

			startTransition(async () => {
				addOptimisticStatus({ taskId, status: nextStatus });
				try {
					await batcher.queue(taskId, nextStatus, previousStatus);
				} catch (error: unknown) {
					const { errorMessage, errorStack } = getLoggableErrorDetails(error);
					clientLogger.error('Optimistic status revert', {
						errorMessage,
						errorStack,
						taskId,
						previousStatus,
						nextStatus,
					});
					// Transition settling auto-reverts optimistic state.
					// Toast is shown by the batcher.
				}
			});
		},
		[addOptimisticStatus, batcher],
	);

	const isPendingOrProcessing =
		plan.status === 'pending' || plan.status === 'processing';

	const isGenerating = isPendingOrProcessing;

	return (
		<div>
			<header className="mb-6">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<Button variant="ghost" size="sm" asChild>
						<Link href="/dashboard">
							<ArrowLeft size={16} aria-hidden="true" />
							Back to Dashboard
						</Link>
					</Button>

					<DeletePlanDialog
						planId={plan.id}
						planTopic={plan.topic}
						isGenerating={isGenerating}
						redirectTo="/plans"
					>
						<Button
							variant="ghost"
							size="sm"
							disabled={isGenerating}
							className="text-muted-foreground hover:text-destructive"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete plan
						</Button>
					</DeletePlanDialog>
				</div>
			</header>

			{isPendingOrProcessing ? (
				<PlanPendingState plan={plan} />
			) : (
				<>
					{/* Plan Overview */}
					<PlanOverviewHeader plan={plan} stats={overviewStats} />

					<ExportButtons planId={plan.id} />

					{/* Module Timeline */}
					<PlanTimeline
						planId={plan.id}
						modules={modules}
						statuses={statuses}
						onStatusChange={handleStatusChange}
					/>
				</>
			)}
		</div>
	);
}
