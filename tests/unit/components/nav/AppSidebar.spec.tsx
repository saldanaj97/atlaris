import AppSidebar from '@/components/shared/nav/AppSidebar';
import { authenticatedNavItems } from '@/features/navigation';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('AppSidebar', () => {
  it('marks the active child and expands its section', () => {
    render(
      <AppSidebar
        pathname='/analytics/usage'
        navItems={authenticatedNavItems}
        tier='pro'
        canCreatePlan
      />,
    );

    expect(
      screen.getByRole('navigation', { name: 'Application navigation' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Analytics' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(
      screen.getByRole('button', { name: 'Collapse Analytics' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the create action aligned with entitlement state', () => {
    const { rerender } = render(
      <AppSidebar
        pathname='/dashboard'
        navItems={authenticatedNavItems}
        tier='starter'
        canCreatePlan
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Create New Plan' }),
    ).toHaveAttribute('href', '/plans/new');
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
    expect(
      screen.queryByText('Unlock more learning paths, projects, and features.'),
    ).not.toBeInTheDocument();

    rerender(
      <AppSidebar
        pathname='/dashboard'
        navItems={authenticatedNavItems}
        tier='free'
        canCreatePlan={false}
      />,
    );

    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(
      screen.queryByRole('link', { name: 'Create New Plan' }),
    ).not.toBeInTheDocument();
  });

  it('supports a collapsed section and invokes the close callback on navigation', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AppSidebar
        pathname='/dashboard'
        navItems={authenticatedNavItems}
        tier='pro'
        canCreatePlan
        onNavigate={onNavigate}
      />,
    );

    expect(
      screen.queryByRole('link', { name: 'Usage' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Analytics' }));
    expect(screen.getByRole('link', { name: 'Usage' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Settings' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
