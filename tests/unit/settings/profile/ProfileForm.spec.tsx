/**
 * Unit tests for the ProfileForm client component.
 *
 * Covers: initial loading, profile display, name editing, save flow,
 * error handling, and dirty-state tracking.
 */

// Mock sonner before component imports
import { buildProfile } from '../../../fixtures/profile';
import { ProfileForm } from '@/app/(app)/settings/profile/components/ProfileForm';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../mocks/unit/sonner.unit';

const MOCK_PROFILE = buildProfile();

function mockFetchSuccess(data: unknown = MOCK_PROFILE): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => data,
    }),
  );
}

function mockFetchFailure(
  status = 500,
  body: Record<string, unknown> = {
    error: 'Server error',
    code: 'INTERNAL_ERROR',
  },
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
      text: async () => JSON.stringify(body),
    }),
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
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('displays profile data after successful fetch', async () => {
    mockFetchSuccess();

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByText(MOCK_PROFILE.name)).toBeInTheDocument();
    });

    expect(screen.getByText(MOCK_PROFILE.name)).toBeInTheDocument();
    expect(
      screen.getByText(MOCK_PROFILE.email ?? 'Unavailable'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new Date(MOCK_PROFILE.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
        }),
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue(MOCK_PROFILE.name);
    expect(screen.getByLabelText('Email address')).toHaveValue(
      MOCK_PROFILE.email ?? 'Unavailable',
    );
  });

  it('shows a neutral email placeholder when Clerk has no verified primary email', async () => {
    mockFetchSuccess(buildProfile({ email: null }));

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
    });
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

  it('disables save when name is unchanged', async () => {
    mockFetchSuccess();

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toHaveValue(MOCK_PROFILE.name);
    });

    expect(
      screen.getByRole('button', { name: /save changes/i }),
    ).toBeDisabled();
  });

  it('disables save again after the name is restored', async () => {
    mockFetchSuccess();

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toHaveValue(MOCK_PROFILE.name);
    });

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Temporary Name');

    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();

    await user.clear(nameInput);
    await user.type(nameInput, MOCK_PROFILE.name);

    expect(
      screen.getByRole('button', { name: /save changes/i }),
    ).toBeDisabled();
  });

  it('enables save when name is edited', async () => {
    mockFetchSuccess();

    render(<ProfileForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toHaveValue(MOCK_PROFILE.name);
    });

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Charles Babbage');

    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

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
      expect(screen.getByLabelText('Name')).toHaveValue(MOCK_PROFILE.name);
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

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /save changes/i }),
      ).toBeDisabled();
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
      expect(screen.getByLabelText('Name')).toHaveValue(MOCK_PROFILE.name);
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
      expect(screen.getByLabelText('Name')).toHaveValue(MOCK_PROFILE.name);
    });

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network failure');
    });
  });
});
