export type DropdownOption<TValue extends string = string> = {
  value: TValue;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type { PlanFormData } from '@/features/plans/plan-form-payload';
