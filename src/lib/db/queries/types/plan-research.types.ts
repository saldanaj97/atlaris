import type { planResearch, researchSources } from '@supabase/schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type DbPlanResearch = InferSelectModel<typeof planResearch>;
export type DbResearchSource = InferSelectModel<typeof researchSources>;

export type NewPlanResearch = InferInsertModel<typeof planResearch>;
export type NewResearchSource = Omit<
  InferInsertModel<typeof researchSources>,
  'id' | 'researchId'
>;

export interface PlanResearchWithSources {
  research: DbPlanResearch;
  sources: DbResearchSource[];
}
