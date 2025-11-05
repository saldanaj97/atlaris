## Task 15: UI Export Buttons Component

**Files:**

- Create: `src/components/plans/ExportButtons.tsx`
- Create: `tests/unit/components/ExportButtons.spec.tsx`

**Step 1: Write failing test**

Create `tests/unit/components/ExportButtons.spec.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportButtons } from '@/components/plans/ExportButtons';

describe('ExportButtons', () => {
  it('should render Notion and Google Calendar buttons', () => {
    render(<ExportButtons planId="test-plan-123" />);

    expect(screen.getByText(/Export to Notion/i)).toBeInTheDocument();
    expect(screen.getByText(/Add to Google Calendar/i)).toBeInTheDocument();
  });

  it('should show loading state when exporting', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<ExportButtons planId="test-plan-123" />);

    const notionButton = screen.getByText(/Export to Notion/i);
    fireEvent.click(notionButton);

    await waitFor(() => {
      expect(screen.getByText(/Exporting/i)).toBeInTheDocument();
    });
  });

  it('should show error message on export failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Export failed' }),
    });

    render(<ExportButtons planId="test-plan-123" />);

    const notionButton = screen.getByText(/Export to Notion/i);
    fireEvent.click(notionButton);

    await waitFor(() => {
      expect(screen.getByText(/Export failed/i)).toBeInTheDocument();
    });
  });
});
```

**Step 2: Implement component**

Create `src/components/plans/ExportButtons.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { toast } from 'sonner';

interface ExportButtonsProps {
  planId: string;
}

export function ExportButtons({ planId }: ExportButtonsProps) {
  const [isExportingNotion, setIsExportingNotion] = useState(false);
  const [isExportingCalendar, setIsExportingCalendar] = useState(false);

  async function handleNotionExport() {
    setIsExportingNotion(true);

    try {
      const response = await fetch('/api/v1/integrations/notion/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          toast.error('Export limit reached', {
            description: data.message || 'Upgrade your plan to export more',
          });
        } else {
          toast.error(data.error || 'Export failed');
        }
        return;
      }

      toast.success('Exported to Notion', {
        description: 'Your learning plan is now in Notion!',
      });
    } catch (error) {
      toast.error('Export failed');
    } finally {
      setIsExportingNotion(false);
    }
  }

  async function handleCalendarSync() {
    setIsExportingCalendar(true);

    try {
      const response = await fetch('/api/v1/integrations/google-calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          toast.error('Sync limit reached', {
            description: data.message || 'Upgrade your plan to sync more',
          });
        } else {
          toast.error(data.error || 'Sync failed');
        }
        return;
      }

      toast.success('Added to Google Calendar', {
        description: `${data.eventsCreated} events created`,
      });
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setIsExportingCalendar(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleNotionExport}
        disabled={isExportingNotion}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isExportingNotion ? 'Exporting...' : 'Export to Notion'}
      </button>

      <button
        onClick={handleCalendarSync}
        disabled={isExportingCalendar}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isExportingCalendar ? 'Syncing...' : 'Add to Google Calendar'}
      </button>
    </div>
  );
}
```

**Step 3: Run test**

Run:

```bash
pnpm vitest run tests/unit/components/ExportButtons.spec.tsx
```

Expected: PASS

**Step 4: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 5: Commit**

```bash
git add src/components/plans/ExportButtons.tsx tests/unit/components/ExportButtons.spec.tsx
git commit -m "feat(ui): add export buttons component

Implement UI component for Notion export and Google Calendar sync with
loading states, error handling, and tier gate messaging.

Changes:
- Add ExportButtons component with async handlers
- Show loading states during export/sync
- Display toast notifications for success/error
- Handle 403 quota errors with upgrade messaging

New files:
- src/components/plans/ExportButtons.tsx
- tests/unit/components/ExportButtons.spec.tsx

Tests cover:
- Button rendering
- Loading states
- Error handling"
```

**Step 6: Open PR into main**

Create a pull request from the current branch into main, following the commit message guidelines.

---
