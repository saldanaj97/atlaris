## Task 4: UI controls and copy

**Files:**

- Create: `src/components/plans/RegenerateButton.tsx`
- Modify: `src/components/plans/PlanDetails.tsx:1`
- Modify: `src/components/plans/OnboardingForm.tsx:1`
- Modify: `src/app/pricing/page.tsx:1`
- Test: `tests/e2e/regeneration.ui.spec.ts`

**Step 1: Write the failing e2e test outline**

```ts
// tests/e2e/regeneration.ui.spec.ts
import { test, expect } from '@playwright/test';

test('free user sees 2-week cap prompt', async ({ page }) => {
  // setup user tier = free, navigate to onboarding
  // select >2 week deadline -> expect upgrade prompt text
});

test('paid user sees Regenerate button and regenerates', async ({ page }) => {
  // setup user tier = pro, visit plan details -> Regenerate
});
```

**Step 2: Implement components**

```tsx
// src/components/plans/RegenerateButton.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function RegenerateButton({ planId }: { planId: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/v1/plans/${planId}/regenerate`, {
            method: 'POST',
          });
          if (!res.ok) throw new Error('Failed to enqueue regeneration');
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? 'Regenerating…' : 'Regenerate Plan'}
    </Button>
  );
}
```

Hook into plan details:

```tsx
// src/components/plans/PlanDetails.tsx (add near TODO)
// <RegenerateButton planId={plan.id} />
```

Add client-side cap hint:

```tsx
// src/components/plans/OnboardingForm.tsx (deadline step effect)
// If user tier known on client, show inline upgrade prompt when > 2 weeks.
```

Pricing copy update:

```tsx
// src/app/pricing/page.tsx
// Add bullet like: "Priority topics and faster queue for Starter/Pro"
```

**Step 3: Verify locally (manual)**

Run: `pnpm dev` and `pnpm dev:worker` (regenerator worker as separate script)
Expected: Regenerate button enqueues, worker picks up jobs.

**Step 4: Commit**

```bash
git add src/components/plans/RegenerateButton.tsx src/components/plans/PlanDetails.tsx src/components/plans/OnboardingForm.tsx src/app/pricing/page.tsx
git commit -m "feat(ui): add Regenerate button, cap prompt, and priority copy"
```

---
