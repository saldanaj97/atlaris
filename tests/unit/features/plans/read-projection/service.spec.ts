import type {
  PlanListPage,
  PlanListQuery,
} from '@/features/plans/read-projection/types';
import type { DbClient } from '@/lib/db/types';

import { getPlansPageForRead } from '@/features/plans/read-projection/service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureFreeAccessSelectionMock, getPlanListPageRowsForUserMock } =
  vi.hoisted(() => ({
    ensureFreeAccessSelectionMock: vi.fn(),
    getPlanListPageRowsForUserMock: vi.fn(),
  }));

vi.mock('@/features/plans/entitlement/store', () => ({
  ensureFreeAccessSelection: ensureFreeAccessSelectionMock,
}));

vi.mock('@/lib/db/queries/plan-list', () => ({
  getPlanListPageRowsForUser: getPlanListPageRowsForUserMock,
}));

const query: PlanListQuery = {
  page: 1,
  search: '',
  status: 'all',
  sort: 'recommended',
};

const selectionCandidate = {
  id: '11111111-1111-4111-8111-111111111111',
  topic: 'Keep this plan',
  createdAt: '2026-08-26T12:00:00.000Z',
  generationStatus: 'ready' as const,
};

const rows: PlanListPage = {
  items: [
    {
      id: selectionCandidate.id,
      topic: selectionCandidate.topic,
      createdAt: selectionCandidate.createdAt,
      updatedAt: selectionCandidate.createdAt,
      status: 'active',
      completion: 0.5,
      completedTasks: 1,
      totalTasks: 2,
    },
  ],
  page: 1,
  pageSize: 20,
  totalItems: 2,
  totalPages: 1,
  totalSearchResults: 2,
  statusCounts: {
    not_started: 0,
    active: 1,
    paused: 0,
    completed: 1,
    generating: 0,
    failed: 0,
  },
  referenceTimestamp: '2026-08-26T12:00:00.000Z',
};

describe('getPlansPageForRead selection-required projection', () => {
  beforeEach(() => {
    ensureFreeAccessSelectionMock.mockResolvedValue({
      snapshot: {
        subscriptionTier: 'free',
        initialPlanGeneratedAt: new Date('2026-08-26T10:00:00.000Z'),
        freeAccessPlanId: null,
        freeAccessPlanSelectedAt: null,
      },
      decision: 'selection_required',
      candidates: [selectionCandidate],
    });
    getPlanListPageRowsForUserMock.mockResolvedValue(rows);
  });

  it('zeros hidden page metadata while preserving selection candidates', async () => {
    const page = await getPlansPageForRead({
      userId: 'user-1',
      dbClient: {} as DbClient,
      query,
      referenceTimestamp: rows.referenceTimestamp,
    });

    expect(page.selectionRequired).toBe(true);
    expect(page.selectionCandidates).toEqual([selectionCandidate]);
    expect(page.items).toEqual([]);
    expect(page.totalItems).toBe(0);
    expect(page.totalPages).toBe(0);
    expect(page.totalSearchResults).toBe(0);
    expect(page.statusCounts).toEqual({
      not_started: 0,
      active: 0,
      paused: 0,
      completed: 0,
      generating: 0,
      failed: 0,
    });
  });
});
