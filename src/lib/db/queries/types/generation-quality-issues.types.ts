import type { generationQualityIssues } from '@supabase/schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type DbGenerationQualityIssue = InferSelectModel<
  typeof generationQualityIssues
>;
export type NewGenerationQualityIssue = InferInsertModel<
  typeof generationQualityIssues
>;
