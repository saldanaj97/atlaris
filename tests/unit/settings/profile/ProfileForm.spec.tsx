/**
 * Unit tests for the ProfileForm client component.
 *
 * Covers: initial loading, profile display, name editing, save flow,
 * error handling, and dirty-state tracking.
 */

// Mock sonner before component imports
import '../../../mocks/unit/sonner.unit';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from 'sonner';

import { ProfileForm } from '@/app/settings/profile/components/ProfileForm';

const MOCK_PROFILE = {
  id: 'user-123',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  subscriptionTier: 'free',
  subscriptionStatus: 'active',
  createdAt: '2025-06-15T10:00:00.000Z',
};

function mockFetchSuccess(data: unknown = MOCK_PROFILE): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => data,
    })
  );
}

function mockFetchFailure(
  status = 500,
  body: Record<string, unknown> = {
    error: 'Server error',
    code: 'INTERNAL_ERROR',
  }
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
  );
}

describe('ProfileForm', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ── Loading & Display ──────────────────────────────────────────────

  it('renders skeleton while loading', () => {
    // Never-resolving fetch to keep loading state
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    render(<ProfileForm />);
    // Skeleton has no text content; the real form content should be absent
    expect(screen.queryByText('Personal Information')).toBeNull();
  });

  it('displays profile data after successful fetch', async () => {
    mockFetchSuccess();

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByText('Personal Information')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('free')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('June 15, 2025')).toBeInTheDocument();
  });

  it('shows error message when profile fetch fails', async () => {
    mockFetchFailure(500, {
      error: 'Something broke',
      code: 'INTERNAL_ERROR',
    });

    render(<ProfileForm />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });

    expect(screen.getByText(/Something broke/)).toBeInTheDocument();
  });

  // ── Name Editing ───────────────────────────────────────────────────

  it('disables save button when name is unchanged', async () => {
    mockFetchSuccess();

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByText('Personal Information')).toBeInTheDocument();
    });

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton).toBeDisabled();
  });

  it('enables save button when name is edited', async () => {
    mockFetchSuccess();

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Charles Babbage');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton).toBeEnabled();
  });

  // ── Save Flow ──────────────────────────────────────────────────────

  it('saves updated name and shows success toast', async () => {
    const updatedProfile = { ...MOCK_PROFILE, name: 'Charles Babbage' };

    // First call: GET profile, second call: PUT profile
    const mockFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_PROFILE,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => updatedProfile,
      });

    vi.stubGlobal('fetch', mockFn);

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Charles Babbage');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Profile updated');
    });

    // Verify PUT was called with correct body
    expect(mockFn).toHaveBeenCalledTimes(2);
    const putCall = mockFn.mock.calls[1] as [string, RequestInit];
    expect(putCall[0]).toBe('/api/v1/user/profile');
    expect(putCall[1].method).toBe('PUT');
    expect(JSON.parse(putCall[1].body as string)).toEqual({
      name: 'Charles Babbage',
    });

    // Save button should be disabled again after successful save
    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
  });

  it('shows error toast when save fails', async () => {
    // First call: GET succeeds, second call: PUT fails
    const mockFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_PROFILE,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: 'Name is required',
          code: 'BAD_REQUEST',
        }),
        text: async () =>
          JSON.stringify({ error: 'Name is required', code: 'BAD_REQUEST' }),
      });

    vi.stubGlobal('fetch', mockFn);

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'X');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('handles network error during save', async () => {
    const mockFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_PROFILE,
      })
      .mockRejectedValueOnce(new Error('Network failure'));

    vi.stubGlobal('fetch', mockFn);

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network failure');
    });
  });

  // ── Account Details ────────────────────────────────────────────────

  it('renders billing settings link', async () => {
    mockFetchSuccess();

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByText('Account Details')).toBeInTheDocument();
    });

    const billingLink = screen.getByRole('link', {
      name: /billing settings/i,
    });
    expect(billingLink).toHaveAttribute('href', '/settings/billing');
  });
});
