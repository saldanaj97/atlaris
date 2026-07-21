import AuthControls from '@/components/shared/AuthControls';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid='user-button'>Mocked UserButton</div>,
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

  it('renders initials avatar link when Clerk user button is disabled', () => {
    renderAuthControls({
      isAuthenticated: true,
      showClerkUserButton: false,
      userName: 'Jane Doe',
    });

    const accountLink = screen.getByRole('link', { name: /account/i });
    expect(accountLink).toHaveAttribute('href', '/settings#profile');
    expect(accountLink).toHaveTextContent('JD');
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
  });

  it('renders profile image avatar when provided', () => {
    renderAuthControls({
      isAuthenticated: true,
      showClerkUserButton: false,
      userName: 'Jane Doe',
      userImageUrl: 'https://img.clerk.com/avatar.png',
    });

    const accountLink = screen.getByRole('link', { name: /account/i });
    expect(accountLink.querySelector('img')).toHaveAttribute(
      'src',
      'https://img.clerk.com/avatar.png',
    );
    expect(accountLink).not.toHaveTextContent('JD');
  });

  describe('tier badge', () => {
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
          userName: 'Dev User',
        });

        expect(screen.getByText(tier)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /account/i })).toHaveAttribute(
          'href',
          '/settings#profile',
        );
      },
    );
  });
});
