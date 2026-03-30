import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  clientLoggerError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('@/lib/logging/client', () => ({
  clientLogger: { error: mocks.clientLoggerError },
}));

import { IntegrationGrid } from '@/app/settings/integrations/components/IntegrationGrid';

describe('IntegrationGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:csv-download'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all five integration cards', () => {
    render(<IntegrationGrid />);

    expect(
      screen.getByRole('region', { name: 'Google Calendar' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'CSV Export' })
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Slack' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Todoist' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Zapier' })).toBeInTheDocument();
  });

  it('shows Google Calendar as coming soon', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response());

    render(<IntegrationGrid />);

    const googleCard = screen.getByRole('region', { name: 'Google Calendar' });

    expect(
      within(googleCard).getByRole('status', { name: 'Coming Soon' })
    ).toBeInTheDocument();
    expect(
      within(googleCard).getByRole('button', { name: 'Coming Soon' })
    ).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('waits for CSV fetch and blob download before success toast', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = originalCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(element, 'click').mockImplementation(clickSpy);
      }
      return element;
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['csv-body'], { type: 'text/csv' }), {
        status: 200,
        headers: {
          'Content-Disposition':
            'attachment; filename="atlaris-export-2026-03-30.csv"',
        },
      })
    );

    render(<IntegrationGrid />);

    const csvCard = screen.getByRole('region', { name: 'CSV Export' });
    await user.click(within(csvCard).getByRole('button', { name: 'Connect' }));

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/exports/csv');
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv-download');
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'CSV export downloaded successfully'
    );
  });

  it('shows CSV export errors without a success toast', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'CSV export is too large for direct download.',
          code: 'CSV_EXPORT_TOO_LARGE',
        }),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(<IntegrationGrid />);

    const csvCard = screen.getByRole('region', { name: 'CSV Export' });
    await user.click(within(csvCard).getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'CSV export is too large for direct download.'
      );
    });

    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.clientLoggerError).toHaveBeenCalledWith(
      'CSV export request failed',
      expect.objectContaining({
        error: 'CSV export is too large for direct download.',
        status: 413,
      })
    );
  });
});
