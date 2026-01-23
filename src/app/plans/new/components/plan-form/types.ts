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
