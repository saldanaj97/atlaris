/**
 * Types and constants for the unified plan generation form.
 */

export type DropdownOption<TValue extends string = string> = {
	value: TValue;
	label: string;
	description?: string;
};

export type { PlanFormData } from '@/features/plans/plan-form.types';
