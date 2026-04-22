'use client';

import { useRouter } from 'next/navigation';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { UnifiedPlanInput } from '@/app/plans/new/components/plan-form';
import type { PlanFormData } from '@/app/plans/new/components/plan-form/types';
import { handleStreamingPlanError } from '@/app/plans/new/components/streamingPlanError';
import { buildManualCreatePayloadFromPlanForm } from '@/features/plans/manual-plan-form-payload';
import { useStreamingPlanGeneration } from '@/hooks/useStreamingPlanGeneration';
import { clientLogger } from '@/lib/logging/client';

interface ManualCreatePanelProps {
	initialTopic?: string | null;
	topicResetVersion?: number;
	onTopicUsed?: () => void;
}

/**
 * ManualCreatePanel handles manual plan creation, streams generation progress,
 * and routes to the created plan on success. Manages form submission, streaming
 * state, and error handling with cancellation support.
 */
export function ManualCreatePanel({
	initialTopic,
	topicResetVersion = 0,
	onTopicUsed,
}: ManualCreatePanelProps): React.ReactElement {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { state: streamingState, startGeneration } =
		useStreamingPlanGeneration();

	const planIdRef = useRef<string | undefined>(undefined);
	const cancellationToastShownRef = useRef(false);
	const isSubmittingRef = useRef(false);

	useEffect(() => {
		planIdRef.current = streamingState.planId;
	}, [streamingState.planId]);

	useEffect(() => {
		if (streamingState.status === 'idle') {
			cancellationToastShownRef.current = false;
		}
	}, [streamingState.status]);

	const handleSubmit = (data: PlanFormData) => {
		if (isSubmittingRef.current) {
			return;
		}

		const mappingResult = buildManualCreatePayloadFromPlanForm(data);
		if (!mappingResult.ok) {
			clientLogger.error('Failed to map form values', mappingResult.error);
			toast.error('Please double-check the form and try again.');
			return;
		}

		onTopicUsed?.();

		isSubmittingRef.current = true;
		setIsSubmitting(true);

		void startGeneration(mappingResult.payload, {
			onPlanIdReady: (planId) => {
				toast.success('Your learning plan generation has started.');
				router.push(`/plans/${planId}`);
			},
		})
			.then(() => {
				// Promise resolves on stream completion; navigation already handled by onPlanIdReady
			})
			.catch((streamError: unknown) => {
				const { handled, message } = handleStreamingPlanError({
					streamError,
					cancellationToastShownRef,
					planIdRef,
					clientLogger,
					toast,
					router,
					redirectPath: '/plans/new',
					logMessage: 'Streaming plan generation failed',
					fallbackMessage:
						'We could not create your learning plan. Please try again.',
				});
				if (handled) {
					return;
				}
				toast.error(message);
			})
			.finally(() => {
				isSubmittingRef.current = false;
				setIsSubmitting(false);
			});
	};

	return (
		<UnifiedPlanInput
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			initialTopic={initialTopic ?? undefined}
			topicResetVersion={topicResetVersion}
		/>
	);
}
