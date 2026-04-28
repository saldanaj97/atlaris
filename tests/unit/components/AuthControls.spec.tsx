import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthControls from '@/components/shared/AuthControls';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@neondatabase/auth/react', () => ({
  UserButton: () => <div data-testid="user-button">Mocked UserButton</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AuthControls', () => {
  const renderAuthControls = (props: Parameters<typeof AuthControls>[0]) =>
    render(
      <TooltipProvider>
        <AuthControls {...props} />
      </TooltipProvider>,
    );

  it('renders sign in and sign up links when unauthenticated', () => {
    renderAuthControls({ isAuthenticated: false });

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/auth/sign-in',
    );
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute(
      'href',
      '/auth/sign-up',
    );
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
  });

  it('renders user button and hides sign in/sign up when authenticated', () => {
    renderAuthControls({ isAuthenticated: true });

    expect(screen.getByTestId('user-button')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sign in/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sign up/i }),
    ).not.toBeInTheDocument();
  });

  describe('tier badge', () => {
    it('does not render badge for free tier', () => {
      renderAuthControls({ isAuthenticated: true, tier: 'free' });

      expect(screen.queryByText('free')).not.toBeInTheDocument();
      expect(screen.getByTestId('user-button')).toBeInTheDocument();
    });

    it.each(['starter', 'pro'] as const)(
      'renders %s tier when authenticated and tier is provided',
      (tier) => {
        renderAuthControls({ isAuthenticated: true, tier });

        expect(screen.getByText(tier)).toBeInTheDocument();
        expect(screen.getByTestId('user-button')).toBeInTheDocument();
      },
    );
  });
});
