import {
  LEARNING_STYLES,
  SKILL_LEVELS,
  type LearningStyle,
  type SkillLevel,
} from '@/lib/types/db';
import {
  CreateLearningPlanInput,
  createLearningPlanSchema,
  onboardingFormSchema,
  type OnboardingFormValues,
} from '@/lib/validation/learningPlans';

const WEEKLY_HOURS_RANGE_TO_INT: Record<string, number> = {
  '1-2': 2,
  '3-5': 5,
  '6-10': 10,
  '11-15': 15,
  '16-20': 20,
  '20+': 25,
};

function asSkillLevel(value: string): SkillLevel {
  const normalized = value.toLowerCase();
  if ((SKILL_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as SkillLevel;
  }
  throw new Error(`Unsupported skill level: ${value}`);
}

function asLearningStyle(value: string): LearningStyle {
  const normalized = value.toLowerCase().replace(/-/g, '_');
  if ((LEARNING_STYLES as readonly string[]).includes(normalized)) {
    return normalized as LearningStyle;
  }
  if (normalized === 'hands_on' || normalized === 'hands-on') {
    return 'practice';
  }
  throw new Error(`Unsupported learning style: ${value}`);
}

function parseWeeklyHours(value: string | number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const trimmed = (value as string).trim();
  const mapped = WEEKLY_HOURS_RANGE_TO_INT[trimmed];
  if (mapped) {
    return mapped;
  }

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) {
    return Math.max(0, Math.round(numeric));
  }

  throw new Error(`Unable to parse weekly hours from value: ${value}`);
}

export function normalizeOnboardingValues(values: OnboardingFormValues) {
  const parsed = onboardingFormSchema.parse(values);
  return {
    ...parsed,
    skillLevel: asSkillLevel(parsed.skillLevel),
    learningStyle: asLearningStyle(parsed.learningStyle),
    weeklyHours: parseWeeklyHours(parsed.weeklyHours),
  };
}

export function mapOnboardingToCreateInput(
  values: OnboardingFormValues
): CreateLearningPlanInput {
  const normalized = normalizeOnboardingValues(values);
  return createLearningPlanSchema.parse({
    ...normalized,
    visibility: 'private',
    origin: 'ai',
  });
}

export function weeklyHoursRangeLabel(hours: number) {
  if (hours <= 2) return '1-2';
  if (hours <= 5) return '3-5';
  if (hours <= 10) return '6-10';
  if (hours <= 15) return '11-15';
  if (hours <= 20) return '16-20';
  return '20+';
}
