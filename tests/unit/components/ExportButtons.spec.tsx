import { ExportButtons } from '@/app/plans/[id]/components/ExportButtons';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../mocks/unit/sonner.unit';

describe.skip('ExportButtons (temporarily disabled)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render Notion and Google Calendar buttons', () => {
    render(<ExportButtons planId="test-plan-123" />);

    expect(screen.getByText(/Export to Notion/i)).toBeInTheDocument();
    expect(screen.getByText(/Add to Google Calendar/i)).toBeInTheDocument();
  });

  it('should show loading state and success message when exporting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
    );

    render(<ExportButtons planId="test-plan-123" />);

    const notionButton = screen.getByText(/Export to Notion/i);
    fireEvent.click(notionButton);

    // Assert loading state
    await waitFor(() => {
      expect(screen.getByText(/Exporting/i)).toBeInTheDocument();
    });

    // Assert success flow
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Exported to Notion', {
        description: 'Your learning plan is now in Notion!',
      });
    });

    // Assert loading UI cleared
    await waitFor(() => {
      expect(screen.getByText(/Export to Notion/i)).toBeInTheDocument();
      expect(screen.queryByText(/Exporting/i)).not.toBeInTheDocument();
    });
  });

  it('should show error message on export failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Export failed' }),
      })
    );

    render(<ExportButtons planId="test-plan-123" />);

    const notionButton = screen.getByText(/Export to Notion/i);
    fireEvent.click(notionButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Export failed');
    });
  });

  it.skip('should handle Google Calendar sync success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ eventsCreated: 5 }),
      })
    );

    render(<ExportButtons planId="test-plan-123" />);

    const calendarButton = screen.getByText(/Add to Google Calendar/i);
    fireEvent.click(calendarButton);

    await waitFor(() => {
      expect(screen.getByText(/Syncing/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Added to Google Calendar', {
        description: '5 events created',
      });
    });
  });

  it.skip('should handle Google Calendar sync error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Sync failed' }),
      })
    );

    render(<ExportButtons planId="test-plan-123" />);

    const calendarButton = screen.getByText(/Add to Google Calendar/i);
    fireEvent.click(calendarButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Sync failed');
    });
  });
});
