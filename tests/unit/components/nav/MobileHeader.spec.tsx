import MobileHeader from '@/components/shared/nav/MobileHeader';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mobileNavigationMock = vi.hoisted(() =>
  vi.fn((_props: Record<string, unknown>) => (
    <button type='button' aria-label='Open menu' />
  )),
);

vi.mock('@/components/shared/AuthControls', () => ({
  default: () => <div data-testid='auth-controls' />,
}));

vi.mock('@/components/shared/ThemeToggle', () => ({
  ThemeToggle: () => <button type='button' aria-label='Toggle theme' />,
}));

vi.mock('@/components/shared/nav/MobileNavigation', () => ({
  default: mobileNavigationMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MobileHeader layout', () => {
  it('keeps the app-shell topbar visible below the sidebar breakpoint', () => {
    const { container } = render(
      <TooltipProvider>
        <MobileHeader
          isMarketing={false}
          isAppShell
          pathname='/dashboard'
          navItems={[]}
          isAuthenticated
          showClerkUserButton
        />
      </TooltipProvider>,
    );

    expect(container.firstElementChild).toHaveClass('lg:hidden');
    expect(container.firstElementChild).not.toHaveClass('md:hidden');
  });

  it('keeps marketing and auth headers on the existing mobile breakpoint', () => {
    const { container } = render(
      <TooltipProvider>
        <MobileHeader
          isMarketing
          pathname='/landing'
          navItems={[]}
          isAuthenticated={false}
          showClerkUserButton
        />
      </TooltipProvider>,
    );

    expect(container.firstElementChild).toHaveClass('md:hidden');
    expect(container.firstElementChild).not.toHaveClass('lg:hidden');
  });

  it('passes app-shell and signed-out auth state to the mobile drawer', () => {
    render(
      <TooltipProvider>
        <MobileHeader
          isMarketing={false}
          isAppShell={false}
          pathname='/auth/sign-in'
          navItems={[]}
          tier='starter'
          canCreatePlan={false}
          isAuthenticated={false}
          showClerkUserButton={false}
          userName='Signed-out visitor'
          userImageUrl='https://example.com/avatar.png'
        />
      </TooltipProvider>,
    );

    const drawerProps = mobileNavigationMock.mock.calls[0]?.[0];
    expect(drawerProps).toEqual(
      expect.objectContaining({
        isMarketing: false,
        isAppShell: false,
        isAuthenticated: false,
        tier: 'starter',
        userName: 'Signed-out visitor',
      }),
    );
    expect(drawerProps).not.toHaveProperty('showClerkUserButton');
    expect(drawerProps).not.toHaveProperty('userImageUrl');
  });

  it('routes signed-out nonmarketing topbar action to the plan form', () => {
    render(
      <TooltipProvider>
        <MobileHeader
          isMarketing={false}
          pathname='/auth/sign-in'
          navItems={[]}
          isAuthenticated={false}
          showClerkUserButton={false}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByRole('link', { name: 'Create new plan' }),
    ).toHaveAttribute('href', '/plans/new');
  });
});
