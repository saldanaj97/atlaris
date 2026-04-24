import type { PlanGenerationCoreFieldsNormalized } from '@/shared/types/ai-provider.types';

export type PlanStartEvent = {
	type: 'plan_start';
	data: PlanGenerationCoreFieldsNormalized & {
		planId: string;
		attemptNumber: number;
		origin?: 'ai' | 'manual' | 'template';
	};
};

export type ModuleSummaryEvent = {
	type: 'module_summary';
	data: {
		planId: string;
		index: number;
		title: string;
		description?: string | null;
		estimatedMinutes: number;
		tasksCount: number;
	};
};

export type ProgressEvent = {
	type: 'progress';
	data: {
		planId: string;
		modulesParsed: number;
		modulesTotalHint?: number;
		percent: number;
	};
};

export type CompleteEvent = {
	type: 'complete';
	data: {
		planId: string;
		modulesCount: number;
		tasksCount: number;
		totalMinutes: number;
	};
};

export type ErrorEvent = {
	type: 'error';
	data: {
		planId?: string | null;
		code: string;
		message: string;
		classification: string;
		retryable: boolean;
		requestId?: string;
	};
};

export type CancelledEvent = {
	type: 'cancelled';
	data: {
		planId: string;
		message: string;
		classification: string;
		retryable: boolean;
		requestId?: string;
	};
};

export type PlanGenerationSessionEvent =
	| PlanStartEvent
	| ModuleSummaryEvent
	| ProgressEvent
	| CompleteEvent
	| ErrorEvent
	| CancelledEvent;

export type StreamingEvent = PlanGenerationSessionEvent;
