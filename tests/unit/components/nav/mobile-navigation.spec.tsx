import MobileNavigation from '@/components/shared/nav/MobileNavigation';
import { TooltipProvider } from '@/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/plans', label: 'Plans' },
];

function renderMobileNavigation(
  headerVariant: 'marketing' | 'opaque' = 'marketing',
) {
  return render(
    <TooltipProvider>
      <MobileNavigation
        headerVariant={headerVariant}
        pathname='/dashboard'
        navItems={navItems}
      />
    </TooltipProvider>,
  );
}

describe('MobileNavigation', () => {
  it('opens the navigation sheet and lists primary links', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <MobileNavigation
          headerVariant='protected'
          pathname='/dashboard'
          navItems={navItems}
          isAuthenticated
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(
      screen.getByRole('navigation', { name: 'Mobile navigation' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(
      screen.getByRole('link', { name: 'Create New Plan' }),
    ).toHaveAttribute('href', '/plans/new');
  });

  it('uses Get started CTA on marketing sheets when signed out', async () => {
    const user = userEvent.setup();

    renderMobileNavigation('marketing');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/auth/sign-in',
    );
    expect(
      screen.queryByRole('link', { name: 'Create New Plan' }),
    ).not.toBeInTheDocument();
  });

  it('uses the opaque menu trigger styling on marketing routes', () => {
    renderMobileNavigation('marketing');

    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveClass(
      'bg-muted',
    );
    expect(screen.getByRole('button', { name: 'Open menu' })).not.toHaveClass(
      'backdrop-blur-md',
    );
  });

  it('uses opaque styling for the menu trigger on non-glass routes', () => {
    renderMobileNavigation('opaque');

    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveClass(
      'bg-muted',
    );
    expect(screen.getByRole('button', { name: 'Open menu' })).not.toHaveClass(
      'backdrop-blur-md',
    );
  });
});
