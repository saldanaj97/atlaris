import DesktopHeader from '@/components/shared/nav/DesktopHeader';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/features/navigation';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid='user-button'>Mocked UserButton</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDesktopHeader(
  props: Partial<Parameters<typeof DesktopHeader>[0]> = {},
) {
  return render(
    <TooltipProvider>
      <div className='w-[768px]'>
        <DesktopHeader
          isMarketing={false}
          pathname='/dashboard'
          navItems={authenticatedNavItems}
          tier='starter'
          canCreatePlan
          isAuthenticated
          showClerkUserButton
          {...props}
        />
      </div>
    </TooltipProvider>,
  );
}

describe('DesktopHeader layout', () => {
  it('keeps authenticated nav items accessible at md width', () => {
    renderDesktopHeader();

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).toHaveAttribute('href', '/landing');
    expect(screen.getByRole('link', { name: 'Plans' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
      'href',
      '/analytics',
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New Plan' })).toBeInTheDocument();
  });

  it('routes authenticated create action to pricing after lifetime access is used', () => {
    renderDesktopHeader({ tier: 'free', canCreatePlan: false });

    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(
      screen.queryByRole('link', { name: 'New Plan' }),
    ).not.toBeInTheDocument();
  });

  it('routes signed-out nonmarketing create action to the plan form', () => {
    renderDesktopHeader({
      isMarketing: false,
      pathname: '/auth/sign-in',
      navItems: unauthenticatedNavItems,
      canCreatePlan: undefined,
      isAuthenticated: false,
      showClerkUserButton: false,
    });

    expect(screen.getByRole('link', { name: 'New Plan' })).toHaveAttribute(
      'href',
      '/plans/new',
    );
  });

  it('leaves app-shell navigation and branding to the sidebar', () => {
    renderDesktopHeader({ isAppShell: true });

    expect(
      screen.queryByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Dashboard' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Settings' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New Plan' })).toBeInTheDocument();
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /Switch to (light|dark) mode|Toggle theme/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Expand sidebar' }),
    ).not.toBeInTheDocument();
  });

  it('keeps marketing chrome when authenticated (no app nav or avatar)', () => {
    renderDesktopHeader({
      isMarketing: true,
      pathname: '/landing',
      navItems: unauthenticatedNavItems,
      isAuthenticated: true,
      showClerkUserButton: true,
    });

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/landing',
    );
    const brand = screen.getByRole('link', {
      name: 'Atlaris - Go to homepage',
    });
    expect(brand).toHaveAttribute('href', '/landing');
    expect(brand.parentElement).not.toContainElement(
      screen.getByRole('navigation', { name: 'Marketing navigation' }),
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'href',
      '/about',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );

    expect(
      screen.queryByRole('link', { name: 'Activity Feed' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New Plan' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
  });

  it('exposes sign-in and the visitor CTA on signed-out marketing chrome', () => {
    renderDesktopHeader({
      isMarketing: true,
      pathname: '/landing',
      navItems: unauthenticatedNavItems,
      isAuthenticated: false,
      showClerkUserButton: false,
    });

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/sign-in',
    );
    expect(screen.getByRole('link', { name: 'Begin tonight' })).toHaveAttribute(
      'href',
      '/auth/sign-in',
    );
  });
});
