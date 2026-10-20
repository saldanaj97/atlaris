import AppSidebar from '@/components/shared/nav/AppSidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { authenticatedNavItems } from '@/features/navigation';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid='user-button'>Mocked UserButton</div>,
}));

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
  it('links the brand logo to the dashboard instead of leaving the app', () => {
    renderSidebar();

    expect(
      screen.getByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).toHaveAttribute('href', '/dashboard');
  });

  it('marks Analytics as a single destination without a submenu', () => {
    renderSidebar({
      pathname: '/analytics/usage',
    });

    expect(
      screen.getByRole('navigation', { name: 'Application navigation' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
      'href',
      '/analytics',
    );
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.queryByRole('link', { name: 'Usage' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Achievements' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Analytics/ }),
    ).not.toBeInTheDocument();
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
    expect(collapse).not.toHaveAttribute('aria-expanded');
    expect(collapse).toHaveAttribute('aria-controls', 'app-desktop-sidebar');
    expect(
      screen.getByRole('complementary', { name: 'Application sidebar' }),
    ).toHaveAttribute('id', 'app-desktop-sidebar');

    collapse.focus();
    expect(collapse).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onDesktopCollapse).toHaveBeenCalledTimes(1);
  });

  it('marks only the current destination as selected', () => {
    renderSidebar({ pathname: '/plans' });

    const plans = screen.getByRole('link', { name: 'Plans' });
    expect(plans).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('follows the canCreatePlan contract for the Create plan action', () => {
    const { rerender } = renderSidebar({ canCreatePlan: true });

    expect(screen.getByRole('link', { name: 'Create plan' })).toHaveAttribute(
      'href',
      '/plans/new',
    );

    const renderWith = (canCreatePlan?: boolean) =>
      rerender(
        <TooltipProvider>
          <AppSidebar
            pathname='/dashboard'
            navItems={authenticatedNavItems}
            tier='pro'
            canCreatePlan={canCreatePlan}
          />
        </TooltipProvider>,
      );

    renderWith(false);
    expect(
      screen.queryByRole('link', { name: 'Create plan' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/pricing',
    );

    renderWith(undefined);
    expect(
      screen.queryByRole('link', { name: 'Create plan' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Upgrade' }),
    ).not.toBeInTheDocument();
  });

  it('shows the plan and upgrade row for non-pro tiers only', () => {
    const { rerender } = renderSidebar({ tier: 'free' });

    expect(
      screen.getByRole('region', { name: 'Free plan' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pro unlocks more learning plans and features.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Upgrade to Pro' }),
    ).toHaveAttribute('href', '/pricing');

    rerender(
      <TooltipProvider>
        <AppSidebar
          pathname='/dashboard'
          navItems={authenticatedNavItems}
          tier='pro'
        />
      </TooltipProvider>,
    );

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Pro unlocks more learning plans and features.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Upgrade to Pro' }),
    ).not.toBeInTheDocument();
  });

  it('invokes the close callback on navigation', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    renderSidebar({ onNavigate });

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
    const theme = within(sidebar).getByRole('button', {
      name: /Switch to (light|dark) mode|Toggle theme/,
    });
    const account = within(sidebar).getByRole('link', {
      name: 'Dev User, account settings',
    });
    expect(theme.parentElement).toContainElement(account);
    expect(account).toHaveAttribute('href', '/settings/profile');
    expect(account).toHaveTextContent('Dev User');
    expect(account).not.toHaveTextContent('Starter');
    expect(account).toHaveTextContent('DU');
    expect(screen.getByText('Starter plan')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Account' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the Clerk account menu in the rail when Clerk UI is enabled', () => {
    renderSidebar({
      userName: 'Ada Lovelace',
      showClerkUserButton: true,
    });

    expect(screen.getByTestId('user-button')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Account settings' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  describe('collapsed rail', () => {
    it('keeps every control reachable with an accessible name', async () => {
      const user = userEvent.setup();
      const onDesktopExpand = vi.fn();
      const onNavigate = vi.fn();

      renderSidebar({
        id: 'app-desktop-sidebar',
        collapsed: true,
        canCreatePlan: true,
        tier: 'free',
        userName: 'Dev User',
        onDesktopCollapse: vi.fn(),
        onDesktopExpand,
        onNavigate,
      });

      const sidebar = screen.getByRole('complementary', {
        name: 'Application sidebar',
      });
      expect(sidebar).not.toHaveAttribute('aria-hidden');
      expect(sidebar).not.toHaveAttribute('inert');

      for (const item of authenticatedNavItems) {
        expect(
          within(sidebar).getByRole('link', { name: item.label }),
        ).toHaveAttribute('href', item.href);
      }
      const home = within(sidebar).getByRole('link', { name: 'Atlaris home' });
      expect(home).toHaveAttribute('href', '/dashboard');
      // Hidden while the expand control replaces it, so it must not be a tab stop.
      expect(home).toHaveAttribute('tabindex', '-1');
      expect(
        within(sidebar).getByRole('link', { name: 'Create plan' }),
      ).toHaveAttribute('href', '/plans/new');
      expect(
        within(sidebar).queryByRole('link', { name: 'Upgrade to Pro' }),
      ).not.toBeInTheDocument();
      expect(
        within(sidebar).getByRole('button', {
          name: /Switch to (light|dark) mode|Toggle theme/,
        }),
      ).toBeInTheDocument();
      expect(
        within(sidebar).getByRole('link', { name: 'Account settings' }),
      ).toHaveAttribute('href', '/settings/profile');
      expect(
        within(sidebar).queryByRole('button', { name: 'Collapse sidebar' }),
      ).not.toBeInTheDocument();
      expect(within(sidebar).queryByText('Free plan')).not.toBeInTheDocument();

      const expand = within(sidebar).getByRole('button', {
        name: 'Expand sidebar',
      });
      expect(expand).toHaveAttribute('id', 'app-desktop-sidebar-expand');
      expect(expand).toHaveAttribute('aria-controls', 'app-desktop-sidebar');
      expect(expand).not.toHaveAttribute('aria-expanded');

      expand.focus();
      await user.keyboard('{Enter}');
      expect(onDesktopExpand).toHaveBeenCalledTimes(1);
    });

    it('marks the current destination', () => {
      renderSidebar({
        collapsed: true,
        pathname: '/analytics',
        tier: 'pro',
        canCreatePlan: true,
      });

      expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('routes the create action to pricing when creation is blocked', () => {
      renderSidebar({ collapsed: true, tier: 'free', canCreatePlan: false });

      expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
        'href',
        '/pricing',
      );
      expect(
        screen.queryByRole('link', { name: 'Create plan' }),
      ).not.toBeInTheDocument();
    });

    it('keeps the Clerk account menu in the rail', () => {
      renderSidebar({ collapsed: true, showClerkUserButton: true });

      expect(screen.getByTestId('user-button')).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Account settings' }),
      ).not.toBeInTheDocument();
    });
  });
});
