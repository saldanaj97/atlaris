import { describe, expect, it } from 'vitest';
import { getModuleDetail } from '@/lib/db/queries/modules';
import {
  getLearningPlanDetail,
  getLightweightPlanSummaries,
  getPlanAttemptsForUser,
  getPlanStatusForUser,
  getPlanSummariesForUser,
} from '@/lib/db/queries/plans';

type Expect<T extends true> = T;
type HasRequiredLeadingArgs<
  Fn extends (...args: never[]) => unknown,
  Leading extends unknown[],
> = Parameters<Fn> extends [...Leading, ...infer _Rest] ? true : false;

describe('Plan Queries - Tenant Scoping Guard', () => {
  it('keeps all scoped read-query entry points typed with explicit userId', () => {
    type _PlanSummariesRequiresUserId = Expect<
      HasRequiredLeadingArgs<typeof getPlanSummariesForUser, [string]>
    >;
    type _LightweightSummariesRequiresUserId = Expect<
      HasRequiredLeadingArgs<typeof getLightweightPlanSummaries, [string]>
    >;
    type _PlanDetailRequiresUserId = Expect<
      HasRequiredLeadingArgs<typeof getLearningPlanDetail, [string, string]>
    >;
    type _PlanAttemptsRequiresUserId = Expect<
      HasRequiredLeadingArgs<typeof getPlanAttemptsForUser, [string, string]>
    >;
    type _PlanStatusRequiresUserId = Expect<
      HasRequiredLeadingArgs<typeof getPlanStatusForUser, [string, string]>
    >;
    type _ModuleDetailRequiresUserId = Expect<
      HasRequiredLeadingArgs<typeof getModuleDetail, [string, string]>
    >;

    // Compile-time type assertions above are the primary guard here.
    expect(typeof getPlanSummariesForUser).toBe('function');
    expect(typeof getLightweightPlanSummaries).toBe('function');
    expect(typeof getLearningPlanDetail).toBe('function');
    expect(typeof getPlanAttemptsForUser).toBe('function');
    expect(typeof getPlanStatusForUser).toBe('function');
    expect(typeof getModuleDetail).toBe('function');
  });
});
