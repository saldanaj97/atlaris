import {
  canCreatePlanOnCurrentTier,
  evaluateFreeInitialAdmission,
  projectLockedPlanListItem,
  resolveFreeAccessSelection,
  resolvePlanContentAccess,
} from '@/features/plans/policy/entitlement';
import { describe, expect, it } from 'vitest';

describe('evaluateFreeInitialAdmission', () => {
  it('allows paid initial creation even when the lifetime marker is set', () => {
    expect(
      evaluateFreeInitialAdmission({
        tier: 'starter',
        generationPurpose: 'initial',
        initialPlanGeneratedAt: new Date('2026-01-01T00:00:00.000Z'),
        inProgressInitialCount: 0,
      }),
    ).toBe('ok');
    expect(
      evaluateFreeInitialAdmission({
        tier: 'pro',
        generationPurpose: 'initial',
        initialPlanGeneratedAt: new Date('2026-01-01T00:00:00.000Z'),
        inProgressInitialCount: 1,
      }),
    ).toBe('ok');
  });

  it('ignores the marker for regeneration on every tier', () => {
    expect(
      evaluateFreeInitialAdmission({
        tier: 'free',
        generationPurpose: 'regeneration',
        initialPlanGeneratedAt: new Date('2026-01-01T00:00:00.000Z'),
        inProgressInitialCount: 1,
      }),
    ).toBe('ok');
  });

  it('rejects a second Free initial when the marker is set', () => {
    expect(
      evaluateFreeInitialAdmission({
        tier: 'free',
        generationPurpose: 'initial',
        initialPlanGeneratedAt: new Date('2026-01-01T00:00:00.000Z'),
        inProgressInitialCount: 0,
      }),
    ).toBe('free_allowance_used');
  });

  it('rejects another in-progress Free initial attempt', () => {
    expect(
      evaluateFreeInitialAdmission({
        tier: 'free',
        generationPurpose: 'initial',
        initialPlanGeneratedAt: null,
        inProgressInitialCount: 1,
      }),
    ).toBe('free_initial_in_progress');
  });

  it('allows the first Free initial when the marker is null', () => {
    expect(
      evaluateFreeInitialAdmission({
        tier: 'free',
        generationPurpose: 'initial',
        initialPlanGeneratedAt: null,
        inProgressInitialCount: 0,
      }),
    ).toBe('ok');
  });
});

describe('resolvePlanContentAccess', () => {
  const selectedAt = new Date('2026-04-01T00:00:00.000Z');

  it('gives paid tiers full access to owned plans', () => {
    expect(
      resolvePlanContentAccess({
        tier: 'starter',
        planId: 'plan-a',
        initialPlanGeneratedAt: selectedAt,
        freeAccessPlanId: 'plan-b',
        freeAccessPlanSelectedAt: selectedAt,
      }),
    ).toBe('full');
  });

  it('allows the first Free plan flow before the marker is set', () => {
    expect(
      resolvePlanContentAccess({
        tier: 'free',
        planId: 'plan-new',
        initialPlanGeneratedAt: null,
        freeAccessPlanId: null,
        freeAccessPlanSelectedAt: null,
      }),
    ).toBe('full');
  });

  it('returns the selected Free plan as full content', () => {
    expect(
      resolvePlanContentAccess({
        tier: 'free',
        planId: 'plan-keep',
        initialPlanGeneratedAt: selectedAt,
        freeAccessPlanId: 'plan-keep',
        freeAccessPlanSelectedAt: selectedAt,
      }),
    ).toBe('full');
  });

  it('locks other owned plans after Free selection, including after the selected plan is deleted', () => {
    expect(
      resolvePlanContentAccess({
        tier: 'free',
        planId: 'plan-other',
        initialPlanGeneratedAt: selectedAt,
        freeAccessPlanId: 'plan-keep',
        freeAccessPlanSelectedAt: selectedAt,
      }),
    ).toBe('locked');
    expect(
      resolvePlanContentAccess({
        tier: 'free',
        planId: 'plan-other',
        initialPlanGeneratedAt: selectedAt,
        freeAccessPlanId: null,
        freeAccessPlanSelectedAt: selectedAt,
      }),
    ).toBe('locked');
  });

  it('requires selection when the marker is set but selected_at is still null', () => {
    expect(
      resolvePlanContentAccess({
        tier: 'free',
        planId: 'plan-a',
        initialPlanGeneratedAt: selectedAt,
        freeAccessPlanId: null,
        freeAccessPlanSelectedAt: null,
      }),
    ).toBe('selection_pending');
  });
});

describe('resolveFreeAccessSelection', () => {
  it('is not applicable for paid users or when selection is already consumed', () => {
    expect(
      resolveFreeAccessSelection({
        tier: 'pro',
        initialPlanGeneratedAt: new Date(),
        freeAccessPlanSelectedAt: null,
        candidateCount: 3,
      }),
    ).toBe('not_applicable');
    expect(
      resolveFreeAccessSelection({
        tier: 'free',
        initialPlanGeneratedAt: new Date(),
        freeAccessPlanSelectedAt: new Date(),
        candidateCount: 2,
      }),
    ).toBe('not_applicable');
  });

  it('auto-selects a single candidate and requires a choice when two or more exist', () => {
    const pending = {
      tier: 'free' as const,
      initialPlanGeneratedAt: new Date(),
      freeAccessPlanSelectedAt: null,
    };
    expect(resolveFreeAccessSelection({ ...pending, candidateCount: 0 })).toBe(
      'no_plan_available',
    );
    expect(resolveFreeAccessSelection({ ...pending, candidateCount: 1 })).toBe(
      'auto_select',
    );
    expect(resolveFreeAccessSelection({ ...pending, candidateCount: 2 })).toBe(
      'selection_required',
    );
  });
});

describe('canCreatePlanOnCurrentTier', () => {
  it('blocks Free create after the lifetime marker is set', () => {
    expect(
      canCreatePlanOnCurrentTier({
        subscriptionTier: 'free',
        initialPlanGeneratedAt: new Date(),
        freeAccessPlanId: 'plan-1',
        freeAccessPlanSelectedAt: new Date(),
      }),
    ).toBe(false);
  });

  it('allows paid create after the lifetime marker is set', () => {
    expect(
      canCreatePlanOnCurrentTier({
        subscriptionTier: 'starter',
        initialPlanGeneratedAt: new Date(),
        freeAccessPlanId: null,
        freeAccessPlanSelectedAt: null,
      }),
    ).toBe(true);
  });
});

describe('projectLockedPlanListItem', () => {
  it('keeps title, date, and status and strips progress', () => {
    const locked = projectLockedPlanListItem({
      id: 'plan-1',
      topic: 'Hidden internals',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      status: 'active',
      completion: 0.8,
      completedTasks: 12,
      totalTasks: 15,
    });

    expect(locked).toEqual({
      id: 'plan-1',
      topic: 'Hidden internals',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      status: 'active',
      completion: 0,
      completedTasks: 0,
      totalTasks: 0,
      access: 'locked',
    });
  });
});
