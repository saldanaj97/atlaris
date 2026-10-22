import type { generationBudgetCuts } from '@supabase/schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type DbGenerationBudgetCut = InferSelectModel<
  typeof generationBudgetCuts
>;
export type NewGenerationBudgetCut = InferInsertModel<
  typeof generationBudgetCuts
>;
