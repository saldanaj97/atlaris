import AuthControls from '@/components/shared/AuthControls';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseSession } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    useSession: mockUseSession,
  },
}));

vi.mock('@neondatabase/auth/react', () => ({
  UserButton: () => <div data-testid="user-button">Mocked UserButton</div>,
}));

const setAuthenticated = (userId: string): void => {
  mockUseSession.mockReturnValue({
    data: {
      user: {
        id: userId,
      },
    },
  });
};

const setUnauthenticated = (): void => {
  mockUseSession.mockReturnValue({ data: null });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockUseSession.mockReset();
});

describe('AuthControls', () => {
  it('renders sign in and sign up links when unauthenticated', () => {
    setUnauthenticated();

    render(<AuthControls />);

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/auth/sign-in'
    );
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute(
      'href',
      '/auth/sign-up'
    );
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
  });

  it('renders user button and hides sign in/sign up when authenticated', () => {
    setAuthenticated('user_123');

    render(<AuthControls />);

    expect(screen.getByTestId('user-button')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sign in/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sign up/i })
    ).not.toBeInTheDocument();
  });

  describe('tier badge', () => {
    it.each(['free', 'starter', 'pro'] as const)(
      'renders %s tier when authenticated and tier is provided',
      (tier) => {
        setAuthenticated('user_123');

        render(<AuthControls tier={tier} />);

        expect(screen.getByText(tier)).toBeInTheDocument();
        expect(screen.getByTestId('user-button')).toBeInTheDocument();
      }
    );
  });
});
