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
  it('sends signed-out marketing visitors to the plan form', () => {
    render(
      <TooltipProvider>
        <MobileHeader
          isMarketing
          pathname='/landing'
          navItems={[]}
          isAuthenticated={false}
          showClerkUserButton={false}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('link', { name: 'Create a plan' })).toHaveAttribute(
      'href',
      '/plans/new',
    );
  });

  it('leaves the create-plan action out of the app topbar', () => {
    render(
      <TooltipProvider>
        <MobileHeader
          isMarketing={false}
          pathname='/dashboard'
          navItems={[]}
          isAuthenticated
          showClerkUserButton={false}
        />
      </TooltipProvider>,
    );

    expect(
      screen.queryByRole('link', { name: 'Create a plan' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Upgrade' }),
    ).not.toBeInTheDocument();
  });
});
