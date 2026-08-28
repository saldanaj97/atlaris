import { USERS_AUTHENTICATED_UPDATE_COLUMNS } from '@supabase/privileges/users-authenticated-update-columns';
import { users } from '@supabase/schema';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('canonical user entitlement schema', () => {
  it('exposes the three server-owned lifetime entitlement columns', () => {
    const columns = getTableColumns(users);

    expect(columns.initialPlanGeneratedAt.name).toBe(
      'initial_plan_generated_at',
    );
    expect(columns.freeAccessPlanId.name).toBe('free_access_plan_id');
    expect(columns.freeAccessPlanSelectedAt.name).toBe(
      'free_access_plan_selected_at',
    );
  });

  it('keeps the entitlement columns out of authenticated UPDATE grants', () => {
    expect(USERS_AUTHENTICATED_UPDATE_COLUMNS).not.toContain(
      'initial_plan_generated_at',
    );
    expect(USERS_AUTHENTICATED_UPDATE_COLUMNS).not.toContain(
      'free_access_plan_id',
    );
    expect(USERS_AUTHENTICATED_UPDATE_COLUMNS).not.toContain(
      'free_access_plan_selected_at',
    );
  });
});
