import ClerkAuthControls from '@/components/shared/ClerkAuthControls';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock Clerk components
vi.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="signed-in">{children}</div>
  ),
  SignedOut: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="signed-out">{children}</div>
  ),
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sign-in-button">{children}</div>
  ),
  SignUpButton: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sign-up-button">{children}</div>
  ),
  UserButton: () => <div data-testid="user-button">User Button</div>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ClerkAuthControls', () => {
  it('should render both signed in and signed out states', () => {
    render(<ClerkAuthControls />);

    // Both states are rendered (Clerk handles conditional display)
    expect(screen.getByTestId('signed-in')).toBeInTheDocument();
    expect(screen.getByTestId('signed-out')).toBeInTheDocument();
  });

  it('should render sign in button when signed out', () => {
    render(<ClerkAuthControls />);

    const signedOutSection = screen.getByTestId('signed-out');
    expect(signedOutSection).toBeInTheDocument();

    // Should contain SignInButton
    expect(screen.getByTestId('sign-in-button')).toBeInTheDocument();
  });

  it('should render sign up button when signed out', () => {
    render(<ClerkAuthControls />);

    const signedOutSection = screen.getByTestId('signed-out');
    expect(signedOutSection).toBeInTheDocument();

    // Should contain SignUpButton
    expect(screen.getByTestId('sign-up-button')).toBeInTheDocument();
  });

  it('should display "Sign In" text in sign in button', () => {
    render(<ClerkAuthControls />);

    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('should display "Sign Up" text in sign up button', () => {
    render(<ClerkAuthControls />);

    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('should render user button when signed in', () => {
    render(<ClerkAuthControls />);

    const signedInSection = screen.getByTestId('signed-in');
    expect(signedInSection).toBeInTheDocument();

    // Should contain UserButton
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
  });

  it('should contain all auth elements within wrapper', () => {
    render(<ClerkAuthControls />);

    // Verify user-visible behavior: both signed-in and signed-out states are rendered
    expect(screen.getByTestId('signed-in')).toBeInTheDocument();
    expect(screen.getByTestId('signed-out')).toBeInTheDocument();
    // Verify the user button is accessible
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
  });

  it('should render sign in and sign up buttons in signed out state', () => {
    render(<ClerkAuthControls />);

    const signedOutSection = screen.getByTestId('signed-out');
    expect(signedOutSection).toContainElement(screen.getByText('Sign In'));
    expect(signedOutSection).toContainElement(screen.getByText('Sign Up'));
  });

  it('should render user button in signed in state', () => {
    render(<ClerkAuthControls />);

    const signedInSection = screen.getByTestId('signed-in');
    expect(signedInSection).toContainElement(screen.getByTestId('user-button'));
  });

  it('should render accessible sign in button', () => {
    render(<ClerkAuthControls />);

    // The sign in button should be accessible and clickable
    const signInButton = screen.getByRole('button', { name: /sign in/i });
    expect(signInButton).toBeInTheDocument();
    expect(signInButton).toBeEnabled();
  });

  it('should render accessible sign up button', () => {
    render(<ClerkAuthControls />);

    // The sign up button should be accessible and clickable
    const signUpButton = screen.getByRole('button', { name: /sign up/i });
    expect(signUpButton).toBeInTheDocument();
    expect(signUpButton).toBeEnabled();
  });

  it('should wrap buttons in appropriate Clerk components', () => {
    render(<ClerkAuthControls />);

    // SignInButton should wrap the "Sign In" button
    const signInWrapper = screen.getByTestId('sign-in-button');
    expect(signInWrapper).toContainElement(screen.getByText('Sign In'));

    // SignUpButton should wrap the "Sign Up" button
    const signUpWrapper = screen.getByTestId('sign-up-button');
    expect(signUpWrapper).toContainElement(screen.getByText('Sign Up'));
  });

  describe('tier badge', () => {
    it('should not render tier badge when tier is not provided', () => {
      render(<ClerkAuthControls />);

      // No badge should be present
      expect(screen.queryByText('free')).not.toBeInTheDocument();
      expect(screen.queryByText('starter')).not.toBeInTheDocument();
      expect(screen.queryByText('pro')).not.toBeInTheDocument();
    });

    it('should render free tier badge when tier is free', () => {
      render(<ClerkAuthControls tier="free" />);

      const signedInSection = screen.getByTestId('signed-in');
      expect(signedInSection).toHaveTextContent('free');
    });

    it('should render starter tier badge when tier is starter', () => {
      render(<ClerkAuthControls tier="starter" />);

      const signedInSection = screen.getByTestId('signed-in');
      expect(signedInSection).toHaveTextContent('starter');
    });

    it('should render pro tier badge when tier is pro', () => {
      render(<ClerkAuthControls tier="pro" />);

      const signedInSection = screen.getByTestId('signed-in');
      expect(signedInSection).toHaveTextContent('pro');
    });

    it('should render tier badge next to user button when signed in', () => {
      render(<ClerkAuthControls tier="pro" />);

      const signedInSection = screen.getByTestId('signed-in');
      // Badge and user button should both be in the signed-in section
      expect(signedInSection).toHaveTextContent('pro');
      expect(signedInSection).toContainElement(
        screen.getByTestId('user-button')
      );
    });
  });
});
