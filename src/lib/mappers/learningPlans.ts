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

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function deadlineWeeksToDate(weeks: string): string {
  const weeksNum = parseInt(weeks, 10);
  if (!Number.isFinite(weeksNum) || weeksNum < 0) {
    throw new Error(`Invalid weeks value: ${weeks}`);
  }
  const date = new Date();
  date.setDate(date.getDate() + weeksNum * 7);
  return toLocalDateString(date);
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
  // Default optional startDate to today (YYYY-MM-DD, local time) if the user
  // omitted it. Using local time matches how the onboarding form displays and
  // validates dates.
  const todayStr = toLocalDateString(new Date());
  return createLearningPlanSchema.parse({
    ...normalized,
    startDate: normalized.startDate ?? todayStr,
    // deadlineDate is required by onboarding flow; prefer the normalized value.
    deadlineDate: normalized.deadlineDate,
    visibility: 'private',
    origin: 'ai',
  });
}

export interface PdfSettingsToCreateInputParams {
  mainTopic: string;
  sections: Array<{
    title: string;
    content: string;
    level: number;
    suggestedTopic?: string;
  }>;
  skillLevel: string;
  weeklyHours: string;
  learningStyle: string;
  deadlineWeeks: string;
  pdfProofToken: string;
  pdfExtractionHash: string;
}

/**
 * Maps PDF extraction preview settings to CreateLearningPlanInput for the stream endpoint.
 */
export function mapPdfSettingsToCreateInput(
  params: PdfSettingsToCreateInputParams
): CreateLearningPlanInput {
  return createLearningPlanSchema.parse({
    origin: 'pdf',
    extractedContent: {
      mainTopic: params.mainTopic,
      sections: params.sections,
    },
    pdfProofToken: params.pdfProofToken,
    pdfExtractionHash: params.pdfExtractionHash,
    topic: params.mainTopic,
    skillLevel: asSkillLevel(params.skillLevel),
    weeklyHours: parseWeeklyHours(params.weeklyHours),
    learningStyle: asLearningStyle(params.learningStyle),
    startDate: toLocalDateString(new Date()),
    deadlineDate: deadlineWeeksToDate(params.deadlineWeeks),
    visibility: 'private',
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
