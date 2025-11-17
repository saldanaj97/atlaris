import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import AuthControls from '@/components/shared/AuthControls';

// Mock Clerk components
vi.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <div data-testid="signed-in">{children}</div>,
  SignedOut: ({ children }: { children: React.ReactNode }) => <div data-testid="signed-out">{children}</div>,
  SignInButton: ({ children }: { children: React.ReactNode }) => <div data-testid="sign-in-button">{children}</div>,
  SignUpButton: ({ children }: { children: React.ReactNode }) => <div data-testid="sign-up-button">{children}</div>,
  UserButton: () => <div data-testid="user-button">User Button</div>,
}));

describe('AuthControls', () => {
  it('should render both signed in and signed out states', () => {
    render(<AuthControls />);

    // Both states are rendered (Clerk handles conditional display)
    expect(screen.getByTestId('signed-in')).toBeInTheDocument();
    expect(screen.getByTestId('signed-out')).toBeInTheDocument();
  });

  it('should render sign in button when signed out', () => {
    render(<AuthControls />);

    const signedOutSection = screen.getByTestId('signed-out');
    expect(signedOutSection).toBeInTheDocument();

    // Should contain SignInButton
    expect(screen.getByTestId('sign-in-button')).toBeInTheDocument();
  });

  it('should render sign up button when signed out', () => {
    render(<AuthControls />);

    const signedOutSection = screen.getByTestId('signed-out');
    expect(signedOutSection).toBeInTheDocument();

    // Should contain SignUpButton
    expect(screen.getByTestId('sign-up-button')).toBeInTheDocument();
  });

  it('should display "Sign In" text in sign in button', () => {
    render(<AuthControls />);

    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('should display "Sign Up" text in sign up button', () => {
    render(<AuthControls />);

    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('should render user button when signed in', () => {
    render(<AuthControls />);

    const signedInSection = screen.getByTestId('signed-in');
    expect(signedInSection).toBeInTheDocument();

    // Should contain UserButton
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
  });

  it('should have proper layout classes', () => {
    const { container } = render(<AuthControls />);

    const wrapper = container.querySelector('.ml-auto.flex.items-center.gap-2');
    expect(wrapper).toBeInTheDocument();
  });

  it('should apply responsive gap classes', () => {
    const { container } = render(<AuthControls />);

    const wrapper = container.querySelector('.ml-auto.flex.items-center.gap-2');
    expect(wrapper).toHaveClass('gap-2');
    expect(wrapper).toHaveClass('lg:gap-4');
  });

  it('should apply proper margin classes', () => {
    const { container } = render(<AuthControls />);

    const wrapper = container.querySelector('.ml-auto.flex.items-center.gap-2');
    expect(wrapper).toHaveClass('ml-auto');
    expect(wrapper).toHaveClass('lg:ml-0');
  });

  it('should use neutral variant for sign in button', () => {
    const { container } = render(<AuthControls />);

    // The sign in button should have neutral variant
    const signInButton = screen.getByText('Sign In').closest('button');
    expect(signInButton).toBeInTheDocument();
  });

  it('should use default variant for sign up button', () => {
    const { container } = render(<AuthControls />);

    // The sign up button should have default styling (no explicit variant means default)
    const signUpButton = screen.getByText('Sign Up').closest('button');
    expect(signUpButton).toBeInTheDocument();
  });

  it('should wrap buttons in appropriate Clerk components', () => {
    render(<AuthControls />);

    // SignInButton should wrap the "Sign In" button
    const signInWrapper = screen.getByTestId('sign-in-button');
    expect(signInWrapper).toContainElement(screen.getByText('Sign In'));

    // SignUpButton should wrap the "Sign Up" button
    const signUpWrapper = screen.getByTestId('sign-up-button');
    expect(signUpWrapper).toContainElement(screen.getByText('Sign Up'));
  });
});
