import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mock values so vi.mock factories can reference them
const mocks = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  searchParams: new URLSearchParams(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.routerReplace }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { IntegrationGrid } from '@/app/settings/integrations/components/IntegrationGrid';

describe('IntegrationGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no integrations connected
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ integrations: [] }), { status: 200 })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all five integration cards', async () => {
    render(<IntegrationGrid />);

    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByText('CSV Export')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('Todoist')).toBeInTheDocument();
    expect(screen.getByText('Zapier')).toBeInTheDocument();
  });

  it('fetches integration status on mount', async () => {
    render(<IntegrationGrid />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/integrations/status'
      );
    });
  });

  it('shows "Connected" badge when backend reports google_calendar is connected', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  it('gracefully handles status fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    render(<IntegrationGrid />);

    // Should still render cards with default status
    await waitFor(() => {
      expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    });
    // Google Calendar should show "Available" (default), not "Connected"
    const availableBadges = screen.getAllByText('Available');
    expect(availableBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('redirects to Google OAuth when Connect is clicked on Google Calendar', async () => {
    const user = userEvent.setup();

    // Mock window.location
    const locationSpy = vi.spyOn(window, 'location', 'get');
    const hrefSetter = vi.fn();
    locationSpy.mockReturnValue({
      ...window.location,
      set href(val: string) {
        hrefSetter(val);
      },
      get href() {
        return window.location.href;
      },
    });

    render(<IntegrationGrid />);

    // The first "Connect" button should be Google Calendar
    const connectButtons = screen.getAllByRole('button', { name: 'Connect' });
    await user.click(connectButtons[0]);

    expect(hrefSetter).toHaveBeenCalledWith('/api/v1/auth/google');
    locationSpy.mockRestore();
  });

  it('triggers CSV download when Connect is clicked on CSV Export', async () => {
    const user = userEvent.setup();

    // Track element creation for download link
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el, 'click').mockImplementation(clickSpy);
      }
      return el;
    });

    render(<IntegrationGrid />);

    // Second "Connect" button is CSV Export
    const connectButtons = screen.getAllByRole('button', { name: 'Connect' });
    await user.click(connectButtons[1]);

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'CSV export started — check your downloads'
    );
  });

  it('shows disconnect confirmation dialog and calls disconnect API', async () => {
    const user = userEvent.setup();

    // Start with Google Calendar connected
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

    // Wait for connected state to render
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    // Click Disconnect on the connected card
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    // Confirmation dialog should appear
    expect(screen.getByText('Disconnect Google Calendar?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This will revoke access and remove the connection. You can reconnect at any time.'
      )
    ).toBeInTheDocument();

    // Confirm disconnect
    const confirmBtn = screen.getAllByRole('button', {
      name: 'Disconnect',
    });
    // The last "Disconnect" button in the DOM is the dialog's action button
    await user.click(confirmBtn[confirmBtn.length - 1]);

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
