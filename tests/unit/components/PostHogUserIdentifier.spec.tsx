import { PostHogUserIdentifier } from '@/components/PostHogUserIdentifier';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { useUserMock, identifyMock, resetMock } = vi.hoisted(() => ({
  useUserMock: vi.fn(),
  identifyMock: vi.fn(),
  resetMock: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: useUserMock,
}));

vi.mock('posthog-js', () => ({
  default: {
    identify: identifyMock,
    reset: resetMock,
  },
}));

const signedInUser = {
  id: 'user_clerk_abc',
  primaryEmailAddress: { emailAddress: 'ada@example.com' },
  fullName: 'Ada Lovelace',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PostHogUserIdentifier', () => {
  it('does not reset on the first anonymous load', () => {
    useUserMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });

    render(<PostHogUserIdentifier />);

    expect(resetMock).not.toHaveBeenCalled();
    expect(identifyMock).not.toHaveBeenCalled();
  });

  it('identifies the Clerk user when signed in', () => {
    useUserMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: signedInUser,
    });

    render(<PostHogUserIdentifier />);

    expect(identifyMock).toHaveBeenCalledWith('user_clerk_abc', {
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    });
    expect(resetMock).not.toHaveBeenCalled();
  });

  it('resets only after a signed-in to signed-out transition', () => {
    useUserMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: signedInUser,
    });

    const { rerender } = render(<PostHogUserIdentifier />);
    identifyMock.mockClear();

    useUserMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });
    rerender(<PostHogUserIdentifier />);

    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(identifyMock).not.toHaveBeenCalled();
  });

  it('does not reset while Clerk is still loading', () => {
    useUserMock.mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
      user: undefined,
    });

    render(<PostHogUserIdentifier />);

    expect(resetMock).not.toHaveBeenCalled();
    expect(identifyMock).not.toHaveBeenCalled();
  });
});
