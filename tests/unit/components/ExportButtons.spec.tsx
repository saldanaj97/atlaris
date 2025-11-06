import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ExportButtons } from '@/components/plans/ExportButtons';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('ExportButtons', () => {
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
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

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
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Export failed' }),
    });

    render(<ExportButtons planId="test-plan-123" />);

    const notionButton = screen.getByText(/Export to Notion/i);
    fireEvent.click(notionButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Export failed');
    });
  });
});
