/**
 * Types and constants for the unified plan generation form.
 */

export type DropdownOption = {
  value: string;
  label: string;
  description?: string;
};

export type PlanFormData = {
  topic: string;
  skillLevel: string;
  weeklyHours: string;
  learningStyle: string;
  deadlineWeeks: string;
};

export const SKILL_LEVEL_OPTIONS: DropdownOption[] = [
  { value: 'beginner', label: 'Beginner', description: "I'm new to this" },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Some experience',
  },
  { value: 'advanced', label: 'Advanced', description: 'Deep dive' },
];

export const WEEKLY_HOURS_OPTIONS: DropdownOption[] = [
  { value: '1-2', label: '1-2 hours' },
  { value: '3-5', label: '3-5 hours' },
  { value: '6-10', label: '6-10 hours' },
  { value: '11-15', label: '11-15 hours' },
  { value: '16-20', label: '16-20 hours' },
  { value: '20+', label: '20+ hours' },
];

export const LEARNING_STYLE_OPTIONS: DropdownOption[] = [
  { value: 'reading', label: 'Reading', description: 'Articles & docs' },
  { value: 'video', label: 'Video', description: 'Courses & tutorials' },
  {
    value: 'practice',
    label: 'Hands-on',
    description: 'Projects & exercises',
  },
  { value: 'mixed', label: 'Mixed', description: 'All of the above' },
];

export const DEADLINE_OPTIONS: DropdownOption[] = [
  { value: '2', label: '2 weeks' },
  { value: '4', label: '1 month' },
  { value: '8', label: '2 months' },
  { value: '12', label: '3 months' },
  { value: '24', label: '6 months' },
];

/**
 * Converts deadline weeks to an ISO date string (YYYY-MM-DD).
 */
export function deadlineWeeksToDate(weeks: string): string {
  const weeksNum = parseInt(weeks, 10);
  if (!Number.isFinite(weeksNum) || weeksNum < 0) {
    throw new Error(`Invalid weeks value: ${weeks}`);
  }
  const date = new Date();
  date.setDate(date.getDate() + weeksNum * 7);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets today's date as an ISO string (YYYY-MM-DD).
 */
export function getTodayDateString(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
