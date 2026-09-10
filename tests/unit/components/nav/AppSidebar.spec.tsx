import AppSidebar from '@/components/shared/nav/AppSidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { authenticatedNavItems } from '@/features/navigation';
import { render, screen, within } from '@testing-library/react';
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

function renderSidebar(props: Partial<Parameters<typeof AppSidebar>[0]> = {}) {
  return render(
    <TooltipProvider>
      <AppSidebar
        pathname='/dashboard'
        navItems={authenticatedNavItems}
        tier='pro'
        {...props}
      />
    </TooltipProvider>,
  );
}

describe('AppSidebar', () => {
  it('marks the active child and expands its section', () => {
    renderSidebar({
      pathname: '/analytics/usage',
    });

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
    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' }),
    ).not.toBeInTheDocument();
  });

  it('exposes a named desktop collapse control when requested', async () => {
    const user = userEvent.setup();
    const onDesktopCollapse = vi.fn();

    renderSidebar({
      id: 'app-desktop-sidebar',
      onDesktopCollapse,
    });

    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute('aria-controls', 'app-desktop-sidebar');
    expect(
      screen.getByRole('complementary', { name: 'Application sidebar' }),
    ).toHaveAttribute('id', 'app-desktop-sidebar');

    collapse.focus();
    expect(collapse).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onDesktopCollapse).toHaveBeenCalledTimes(1);
  });

  it('omits a create-plan action and still shows the upgrade banner for non-pro tiers', () => {
    const { rerender } = renderSidebar({
      tier: 'starter',
    });

    expect(
      screen.queryByRole('link', { name: 'Create New Plan' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
    expect(
      screen.getByText('Unlock more learning paths, projects, and features.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
      'href',
      '/pricing',
    );

    rerender(
      <TooltipProvider>
        <AppSidebar
          pathname='/dashboard'
          navItems={authenticatedNavItems}
          tier='free'
        />
      </TooltipProvider>,
    );

    expect(
      screen.queryByRole('link', { name: 'Create New Plan' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Upgrade' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View plans' })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });

  it('supports a collapsed section and invokes the close callback on navigation', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    renderSidebar({ onNavigate });

    expect(
      screen.queryByRole('link', { name: 'Usage' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand Analytics' }));
    expect(screen.getByRole('link', { name: 'Usage' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Settings' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('places theme and account chrome in the footer, not as destinations', () => {
    renderSidebar({
      userName: 'Dev User',
      tier: 'starter',
      onDesktopCollapse: vi.fn(),
    });

    const sidebar = screen.getByRole('complementary', {
      name: 'Application sidebar',
    });
    expect(
      within(sidebar).getByRole('button', {
        name: /Switch to (light|dark) mode|Toggle theme/,
      }),
    ).toBeInTheDocument();

    const account = within(sidebar).getByRole('link', {
      name: 'Account settings',
    });
    expect(account).toHaveAttribute('href', '/settings/profile');
    expect(account).toHaveTextContent('Dev User');
    expect(account).toHaveTextContent('Starter Plan');
    expect(account).toHaveTextContent('DU');
    expect(
      screen.queryByRole('link', { name: 'Account' }),
    ).not.toBeInTheDocument();
  });
});
