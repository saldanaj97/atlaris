import { z } from 'zod';
import {
	createLearningPlanNotesSchema,
	topicSchema,
} from '@/shared/schemas/learning-plans.schemas';
import {
	LEARNING_STYLE_ENUM,
	NOTES_MAX_LENGTH,
	SKILL_LEVEL_ENUM,
	TOPIC_MAX_LENGTH,
	weeklyHoursSchema,
} from './shared';

const planNotesOverrideSchema = z
	.string()
	.trim()
	.max(
		NOTES_MAX_LENGTH,
		`notes must be ${NOTES_MAX_LENGTH} characters or fewer.`,
	)
	.transform((value) => (value.length > 0 ? value : null));

const planTopicOverrideSchema = z
	.string()
	.trim()
	.min(3, 'topic must be at least 3 characters long.')
	.max(
		TOPIC_MAX_LENGTH,
		`topic must be ${TOPIC_MAX_LENGTH} characters or fewer.`,
	);

const planStartDateOverrideSchema = z
	.string()
	.trim()
	.refine(
		(value) => !Number.isNaN(Date.parse(value)),
		'Start date must be a valid ISO date string.',
	)
	.transform((value) => (value ? value : null));

const planDeadlineDateOverrideSchema = z
	.string()
	.trim()
	.refine(
		(value) => !Number.isNaN(Date.parse(value)),
		'Deadline date must be a valid ISO date string.',
	)
	.transform((value) => (value ? value : null));

export const planRegenerationOverridesSchema = z
	.object({
		topic: planTopicOverrideSchema.optional(),
		notes: planNotesOverrideSchema.optional().nullable(),
		skillLevel: SKILL_LEVEL_ENUM.optional(),
		weeklyHours: weeklyHoursSchema.optional(),
		learningStyle: LEARNING_STYLE_ENUM.optional(),
		startDate: planStartDateOverrideSchema.optional().nullable(),
		deadlineDate: planDeadlineDateOverrideSchema.optional().nullable(),
	})
	.strict();

export const onboardingFormObject = z.object({
	topic: topicSchema,
	skillLevel: z
		.string()
		.trim()
		.min(1, 'Please choose a skill level.')
		.transform((value) => value.toLowerCase()),
	weeklyHours: z.union([
		weeklyHoursSchema,
		z.string().trim().min(1, 'Please select your weekly availability.'),
	]),
	learningStyle: z.string().trim().min(1, 'Please choose a learning style.'),
	notes: createLearningPlanNotesSchema,
	startDate: z
		.string()
		.trim()
		.optional()
		.refine(
			(value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
			'Start date must be in YYYY-MM-DD format.',
		)
		.refine(
			(value) => !value || !Number.isNaN(Date.parse(value)),
			'Start date must be a valid date.',
		),
	deadlineDate: z
		.string()
		.trim()
		.min(1, 'Please select a deadline date.')
		.refine(
			(value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
			'Deadline date must be in YYYY-MM-DD format.',
		)
		.refine(
			(value) => !Number.isNaN(Date.parse(value)),
			'Deadline date must be a valid date.',
		),
});
