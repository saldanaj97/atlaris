import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  searchParams: new URLSearchParams(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  clientLoggerError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('@/lib/logging/client', () => ({
  clientLogger: { error: mocks.clientLoggerError },
}));

import { IntegrationGrid } from '@/app/settings/integrations/components/IntegrationGrid';

describe('IntegrationGrid', () => {
  const mockLocation = { href: '' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    mockLocation.href = '';

    Object.defineProperty(window, 'location', {
      value: mockLocation,
      writable: true,
      configurable: true,
    });

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:csv-download'),
      revokeObjectURL: vi.fn(),
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ integrations: [] }), { status: 200 })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all five integration cards', async () => {
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

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/integrations/status'
      );
    });
  });

  it('fetches integration status on mount', async () => {
    render(<IntegrationGrid />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/integrations/status'
      );
    });
  });

  it('shows connected state when google_calendar is connected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          integrations: [
            {
              provider: 'google_calendar',
              connected: true,
              connectedAt: '2024-01-01T00:00:00.000Z',
            },
          ],
        }),
        { status: 200 }
      )
    );

    render(<IntegrationGrid />);

    const googleCard = screen.getByRole('region', { name: 'Google Calendar' });

    await waitFor(() => {
      expect(
        within(googleCard).getByRole('status', { name: 'Connected' })
      ).toBeInTheDocument();
    });
  });

  it('logs status fetch failures and keeps default card state', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    render(<IntegrationGrid />);

    const googleCard = screen.getByRole('region', { name: 'Google Calendar' });

    await waitFor(() => {
      expect(
        within(googleCard).getByRole('status', { name: 'Available' })
      ).toBeInTheDocument();
    });

    expect(mocks.clientLoggerError).toHaveBeenCalledWith(
      'Integration status fetch failed',
      expect.objectContaining({ error: expect.any(Error) })
    );
  });

  it('logs invalid status payloads and keeps default card state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ integrations: [{ provider: 123 }] }), {
        status: 200,
      })
    );

    render(<IntegrationGrid />);

    const googleCard = screen.getByRole('region', { name: 'Google Calendar' });

    await waitFor(() => {
      expect(mocks.clientLoggerError).toHaveBeenCalledWith(
        'Invalid integration status payload',
        expect.objectContaining({
          issues: expect.any(Array),
          payload: expect.any(Object),
        })
      );
    });

    expect(
      within(googleCard).getByRole('status', { name: 'Available' })
    ).toBeInTheDocument();
  });

  it('redirects to provider OAuth when Google Calendar connect is clicked', async () => {
    const user = userEvent.setup();

    render(<IntegrationGrid />);

    const googleCard = screen.getByRole('region', { name: 'Google Calendar' });
    await user.click(
      within(googleCard).getByRole('button', { name: 'Connect' })
    );

    expect(window.location.href).toBe('/api/v1/auth/google');
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

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ integrations: [] }), { status: 200 })
      )
      .mockResolvedValueOnce(
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

    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/v1/exports/csv');
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv-download');
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'CSV export downloaded successfully'
    );
  });

  it('shows CSV export errors without a success toast', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ integrations: [] }), { status: 200 })
      )
      .mockResolvedValueOnce(
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

  it('uses dialog-scoped confirmation to disconnect an integration', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            integrations: [{ provider: 'google_calendar', connected: true }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ provider: 'google_calendar', disconnected: true }),
          { status: 200 }
        )
      );

    render(<IntegrationGrid />);

    const googleCard = screen.getByRole('region', { name: 'Google Calendar' });

    await waitFor(() => {
      expect(
        within(googleCard).getByRole('status', { name: 'Connected' })
      ).toBeInTheDocument();
    });

    await user.click(
      within(googleCard).getByRole('button', { name: 'Disconnect' })
    );

    const dialog = screen.getByRole('alertdialog');

    expect(
      within(dialog).getByText('Disconnect Google Calendar?')
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Disconnect' })
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/integrations/disconnect',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ provider: 'google_calendar' }),
        })
      );
    });

    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Google Calendar disconnected'
    );
  });
});
