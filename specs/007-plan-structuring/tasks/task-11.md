# Phase 11: Add Schedule Toggle to Plan Detail Page

**Files:**

- Modify: `src/app/plans/[id]/page.tsx`
- Modify: `src/components/plans/PlanDetails.tsx`
- Test: `tests/e2e/plan-schedule-view.spec.ts`

## Step 1: Write the failing E2E test

Create `tests/e2e/plan-schedule-view.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Plan Schedule View', () => {
  test('should toggle between modules and schedule view', async ({ page }) => {
    // NOTE: This test requires a seeded plan with modules/tasks
    // Adjust plan ID based on your test database setup
    await page.goto('/plans/test-plan-id');

    // Verify default view is modules
    await expect(page.getByRole('heading', { name: /modules/i })).toBeVisible();

    // Click schedule tab
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Verify schedule view is displayed
    await expect(page.getByText(/Week 1/i)).toBeVisible();

    // Click modules tab
    await page.getByRole('tab', { name: /modules/i }).click();

    // Verify modules view is restored
    await expect(page.getByRole('heading', { name: /modules/i })).toBeVisible();
  });

  test('should display week-grouped schedule with dates', async ({ page }) => {
    await page.goto('/plans/test-plan-id');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Verify week structure
    await expect(page.getByText(/Week 1/i)).toBeVisible();

    // Verify dates are displayed
    await expect(page.getByText(/\d{4}-\d{2}-\d{2}/)).toBeVisible();

    // Verify task time estimates
    await expect(page.getByText(/\d+ min/i)).toBeVisible();
  });
});
```

## Step 2: Run test to verify it fails

Run: `pnpm test:e2e tests/e2e/plan-schedule-view.spec.ts`
Expected: FAIL (schedule tab not found)

## Step 3: Modify plan detail page to fetch schedule

Modify `src/app/plans/[id]/page.tsx`:

```typescript
import PlanDetailPageError from '@/components/plans/Error';
import PlanDetails from '@/components/plans/PlanDetails';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getPlanSchedule } from '@/lib/api/schedule';
import { getLearningPlanDetail } from '@/lib/db/queries/plans';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { mapDetailToClient } from '@/lib/mappers/detailToClient';
import { redirect } from 'next/navigation';

interface PlanPageProps {
  params: { id: string };
}

export default async function PlanDetailPage({ params }: PlanPageProps) {
  const { id } = await params;
  if (!id) return <PlanDetailPageError />;

  const userId = await getEffectiveClerkUserId();
  if (!userId) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const user = await getUserByClerkId(userId);
  if (!user) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const plan = await getLearningPlanDetail(id, user.id);
  if (!plan) redirect(`/sign-in?redirect_url=/plans/${id}`);

  const formattedPlanDetails = mapDetailToClient(plan);
  if (!formattedPlanDetails) return <PlanDetailPageError />;

  // Fetch schedule
  const schedule = await getPlanSchedule({ planId: id, userId: user.id });

  return <PlanDetails plan={formattedPlanDetails} schedule={schedule} />;
}
```

## Step 4: Modify PlanDetails component to add toggle

Modify `src/components/plans/PlanDetails.tsx` - add state and tab UI:

```typescript
'use client';

import { useState } from 'react';
import ScheduleWeekList from './ScheduleWeekList';
import type { ScheduleJson } from '@/lib/scheduling/types';
// ... existing imports

interface PlanDetailsProps {
  plan: FormattedPlanDetails;
  schedule: ScheduleJson;
}

export default function PlanDetails({ plan, schedule }: PlanDetailsProps) {
  const [activeView, setActiveView] = useState<'modules' | 'schedule'>('modules');

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Plan Header - existing code */}

      {/* View Toggle */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            role="tab"
            aria-selected={activeView === 'modules'}
            onClick={() => setActiveView('modules')}
            className={`border-b-2 px-1 py-4 text-sm font-medium ${
              activeView === 'modules'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Modules
          </button>
          <button
            role="tab"
            aria-selected={activeView === 'schedule'}
            onClick={() => setActiveView('schedule')}
            className={`border-b-2 px-1 py-4 text-sm font-medium ${
              activeView === 'schedule'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            Schedule
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeView === 'modules' && (
        <div>
          {/* Existing module list rendering code */}
        </div>
      )}

      {activeView === 'schedule' && <ScheduleWeekList schedule={schedule} />}
    </div>
  );
}
```

## Step 5: Run E2E test to verify it passes

Run: `pnpm test:e2e tests/e2e/plan-schedule-view.spec.ts`
Expected: PASS (2 tests)

## Step 6: Commit

```bash
git add src/app/plans/[id]/page.tsx src/components/plans/PlanDetails.tsx tests/e2e/plan-schedule-view.spec.ts
git commit -m "feat: add module/schedule toggle to plan detail page"
```
