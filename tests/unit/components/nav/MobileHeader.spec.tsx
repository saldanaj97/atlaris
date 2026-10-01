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
