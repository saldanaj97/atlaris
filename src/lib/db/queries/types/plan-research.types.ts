import type { planResearch, researchSources } from '@supabase/schema';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export type DbPlanResearch = InferSelectModel<typeof planResearch>;
export type DbResearchSource = InferSelectModel<typeof researchSources>;

export type NewPlanResearch = InferInsertModel<typeof planResearch>;
/** A source to store with a research run; `researchId` is set by the insert helper. */
export type NewResearchSource = Omit<
  InferInsertModel<typeof researchSources>,
  'id' | 'researchId'
>;

/** A research run with its sources ordered by citation number (`S1`, `S2`, …). */
export interface PlanResearchWithSources {
  research: DbPlanResearch;
  sources: DbResearchSource[];
}
