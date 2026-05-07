import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthControls from '@/components/shared/AuthControls';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@clerk/nextjs', () => ({
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
    renderAuthControls({ isAuthenticated: false, showClerkUserButton: true });

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
    renderAuthControls({ isAuthenticated: true, showClerkUserButton: true });

    expect(screen.getByTestId('user-button')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sign in/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sign up/i }),
    ).not.toBeInTheDocument();
  });

  it('renders account link instead of Clerk user button when disabled', () => {
    renderAuthControls({ isAuthenticated: true, showClerkUserButton: false });

    expect(screen.getByRole('link', { name: /account/i })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
  });

  it('defaults to Clerk user button when the setting is omitted', () => {
    renderAuthControls({ isAuthenticated: true });

    expect(screen.getByTestId('user-button')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /account/i }),
    ).not.toBeInTheDocument();
  });

  describe('tier badge', () => {
    it('does not render badge for free tier', () => {
      renderAuthControls({
        isAuthenticated: true,
        tier: 'free',
        showClerkUserButton: true,
      });

      expect(screen.queryByText('free')).not.toBeInTheDocument();
      expect(screen.getByTestId('user-button')).toBeInTheDocument();
    });

    it.each(['starter', 'pro'] as const)(
      'renders %s tier when authenticated and tier is provided',
      (tier) => {
        renderAuthControls({
          isAuthenticated: true,
          tier,
          showClerkUserButton: true,
        });

        expect(screen.getByText(tier)).toBeInTheDocument();
        expect(screen.getByTestId('user-button')).toBeInTheDocument();
      },
    );

    it.each(['starter', 'pro'] as const)(
      'renders %s tier with account fallback when Clerk user button is disabled',
      (tier) => {
        renderAuthControls({
          isAuthenticated: true,
          tier,
          showClerkUserButton: false,
        });

        expect(screen.getByText(tier)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /account/i })).toHaveAttribute(
          'href',
          '/settings/profile',
        );
      },
    );
  });
});
