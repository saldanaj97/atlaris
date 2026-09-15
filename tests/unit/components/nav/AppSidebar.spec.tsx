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
      name: 'Account settings',
    });
    expect(theme.parentElement).toContainElement(account);
    expect(account).toHaveAttribute('href', '/settings/profile');
    expect(account).toHaveTextContent('Dev User');
    expect(account).toHaveTextContent('Starter Plan');
    expect(account).toHaveTextContent('DU');
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
});
