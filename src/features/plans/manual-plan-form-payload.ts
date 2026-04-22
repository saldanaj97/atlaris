import { mapOnboardingToCreateInput } from '@/features/plans/create-mapper';
import type { PlanFormData } from '@/features/plans/plan-form.types';
import type {
	CreateLearningPlanInput,
	OnboardingFormValues,
} from '@/features/plans/validation/learningPlans.types';
import {
	deadlineWeeksToDate,
	formatDateToYmd,
} from '@/lib/date/format-local-ymd';
import { normalizeThrown } from '@/lib/errors';

type ManualCreatePayloadResult =
	| { ok: true; payload: CreateLearningPlanInput }
	| { ok: false; error: ManualCreatePayloadError };

type ManualCreatePayloadError = {
	message: string;
	name: string;
	stack?: string;
};

function normalizeManualCreatePayloadError(
	error: unknown,
): ManualCreatePayloadError {
	const normalized = normalizeThrown(error);

	if (normalized instanceof Error) {
		return {
			message: normalized.message,
			name: normalized.name,
			stack: normalized.stack,
		};
	}

	return {
		message: normalized.message,
		name: normalized.name ?? 'Error',
	};
}

function convertPlanFormToOnboardingValues(
	data: PlanFormData,
): OnboardingFormValues {
	return {
		topic: data.topic,
		skillLevel: data.skillLevel,
		weeklyHours: data.weeklyHours,
		learningStyle: data.learningStyle,
		notes: '',
		startDate: formatDateToYmd(new Date()),
		deadlineDate: deadlineWeeksToDate(data.deadlineWeeks),
	};
}

export function buildManualCreatePayloadFromPlanForm(
	data: PlanFormData,
): ManualCreatePayloadResult {
	try {
		const onboardingValues = convertPlanFormToOnboardingValues(data);
		return {
			ok: true,
			payload: mapOnboardingToCreateInput(onboardingValues),
		};
	} catch (error) {
		return { ok: false, error: normalizeManualCreatePayloadError(error) };
	}
}
