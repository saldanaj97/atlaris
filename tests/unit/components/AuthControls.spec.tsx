import AuthControls from '@/components/shared/AuthControls';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@neondatabase/auth/react', () => ({
  UserButton: () => <div data-testid="user-button">Mocked UserButton</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AuthControls', () => {
  it('renders sign in and sign up links when unauthenticated', () => {
    render(<AuthControls isAuthenticated={false} />);

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
    render(<AuthControls isAuthenticated={true} />);

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
        render(<AuthControls isAuthenticated={true} tier={tier} />);

        expect(screen.getByText(tier)).toBeInTheDocument();
        expect(screen.getByTestId('user-button')).toBeInTheDocument();
      }
    );
  });
});
