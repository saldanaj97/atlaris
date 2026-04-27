'use client';

import { useRouter } from 'next/navigation';
import {
	type ReactElement,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';
import { toast } from 'sonner';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { isAbortError } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';

interface DeletePlanDialogBaseProps {
	planId: string;
	planTopic: string;
	isGenerating: boolean;
	/** Where to navigate after successful deletion. Defaults to '/plans'. */
	redirectTo?: string;
}

/** Controlled mode: parent owns open state; no trigger child is rendered. */
type DeletePlanDialogControlledProps = DeletePlanDialogBaseProps & {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children?: never;
};

/** Uncontrolled mode: component owns open state; a trigger child is required. */
type DeletePlanDialogUncontrolledProps = DeletePlanDialogBaseProps & {
	open?: never;
	onOpenChange?: never;
	children: ReactElement;
};

type DeletePlanDialogProps =
	| DeletePlanDialogControlledProps
	| DeletePlanDialogUncontrolledProps;

type DeletePlanRequestResult =
	| { kind: 'success' }
	| { kind: 'aborted' }
	| { kind: 'error'; message: string; error: unknown };

function startDeleteRequest(abortControllerRef: {
	current: AbortController | null;
}): AbortController {
	abortControllerRef.current?.abort();
	const controller = new AbortController();
	abortControllerRef.current = controller;
	return controller;
}

async function requestPlanDeletion(
	planId: string,
	signal: AbortSignal,
): Promise<DeletePlanRequestResult> {
	try {
		const res = await fetch(`/api/v1/plans/${planId}`, {
			method: 'DELETE',
			signal,
		});

		if (!res.ok) {
			const parsed = await parseApiErrorResponse(res, 'Failed to delete plan');
			return {
				kind: 'error',
				message: parsed.error,
				error: new Error(parsed.error),
			};
		}

		return { kind: 'success' };
	} catch (error: unknown) {
		if (isAbortError(error)) {
			return { kind: 'aborted' };
		}

		return {
			kind: 'error',
			message: error instanceof Error ? error.message : 'Failed to delete plan',
			error,
		};
	}
}

function finalizeDeleteRequest({
	controller,
	abortControllerRef,
	isMountedRef,
	setDeleting,
}: {
	controller: AbortController;
	abortControllerRef: { current: AbortController | null };
	isMountedRef: { current: boolean };
	setDeleting: (value: boolean) => void;
}): void {
	if (abortControllerRef.current !== controller) {
		return;
	}

	abortControllerRef.current = null;
	if (isMountedRef.current) {
		setDeleting(false);
	}
}

function completeDeleteSuccess({
	isMountedRef,
	setOpen,
	router,
	redirectTo,
}: {
	isMountedRef: { current: boolean };
	setOpen: (value: boolean) => void;
	router: ReturnType<typeof useRouter>;
	redirectTo: string;
}): void {
	toast.success('Plan deleted successfully');
	if (isMountedRef.current) {
		setOpen(false);
	}
	router.push(redirectTo);
	router.refresh();
}

export function DeletePlanDialog({
	planId,
	planTopic,
	isGenerating,
	redirectTo = '/plans',
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
	children,
}: DeletePlanDialogProps): ReactElement {
	const router = useRouter();
	const isControlled = controlledOpen !== undefined;
	const [internalOpen, setInternalOpen] = useState(false);
	const open = isControlled ? controlledOpen : internalOpen;
	const setOpen = useCallback(
		(value: boolean) => {
			if (isControlled) {
				controlledOnOpenChange?.(value);
			} else {
				setInternalOpen(value);
			}
		},
		[isControlled, controlledOnOpenChange],
	);
	const [deleting, setDeleting] = useState(false);
	const abortControllerRef = useRef<AbortController | null>(null);
	const isMountedRef = useRef(true);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			abortControllerRef.current?.abort();
			abortControllerRef.current = null;
		};
	}, []);

	const handleDelete = async (): Promise<void> => {
		if (isGenerating || deleting) {
			return;
		}

		const controller = startDeleteRequest(abortControllerRef);
		setDeleting(true);
		const result = await requestPlanDeletion(planId, controller.signal);

		switch (result.kind) {
			case 'success':
				finalizeDeleteRequest({
					controller,
					abortControllerRef,
					isMountedRef,
					setDeleting,
				});
				completeDeleteSuccess({
					isMountedRef,
					setOpen,
					router,
					redirectTo,
				});
				return;
			case 'aborted':
				finalizeDeleteRequest({
					controller,
					abortControllerRef,
					isMountedRef,
					setDeleting,
				});
				return;
			case 'error':
				clientLogger.error('Plan deletion failed', {
					planId,
					error: result.error,
				});
				toast.error(result.message);
				finalizeDeleteRequest({
					controller,
					abortControllerRef,
					isMountedRef,
					setDeleting,
				});
				return;
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			{!isControlled && children && (
				<AlertDialogTrigger asChild disabled={isGenerating}>
					{children}
				</AlertDialogTrigger>
			)}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete plan</AlertDialogTitle>
					<AlertDialogDescription className="space-y-2">
						<p>
							This will permanently delete &quot;{planTopic}&quot; and all its
							modules, tasks, and progress. This action cannot be undone and you
							will not receive a refund for the AI generation credit used to
							generate this plan.
						</p>
						<p>Are you sure you want to delete this plan?</p>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={deleting || isGenerating}
						onClick={(e) => {
							e.preventDefault();
							void handleDelete();
						}}
					>
						{deleting ? 'Deleting…' : 'Delete plan'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
