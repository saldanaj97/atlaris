import {
  DESKTOP_SIDEBAR_OFFSET_VAR,
  DESKTOP_SIDEBAR_OPEN_STORAGE_KEY,
} from '@/components/shared/nav/desktop-sidebar-state';
import SiteHeaderChrome from '@/components/shared/nav/SiteHeaderChrome';
import { TooltipProvider } from '@/components/ui/tooltip';
import { authenticatedNavItems } from '@/features/navigation';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => '/dashboard'),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

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

function renderChrome() {
  return render(
    <TooltipProvider>
      <SiteHeaderChrome
        navItems={authenticatedNavItems}
        tier='pro'
        canCreatePlan
        isAuthenticated
        showClerkUserButton
        userName='Ada Lovelace'
      />
    </TooltipProvider>,
  );
}

describe('SiteHeaderChrome desktop sidebar', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/dashboard');
    localStorage.removeItem(DESKTOP_SIDEBAR_OPEN_STORAGE_KEY);
    document.documentElement.style.removeProperty(DESKTOP_SIDEBAR_OFFSET_VAR);
  });

  afterEach(() => {
    localStorage.removeItem(DESKTOP_SIDEBAR_OPEN_STORAGE_KEY);
    document.documentElement.style.removeProperty(DESKTOP_SIDEBAR_OFFSET_VAR);
  });

  it('collapses the desktop sidebar to a visible icon rail', async () => {
    const user = userEvent.setup();
    renderChrome();

    const sidebar = screen.getByRole('complementary', {
      name: 'Application sidebar',
    });
    expect(
      screen.getByRole('navigation', { name: 'Application navigation' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open menu' }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('button', {
        name: /Switch to (light|dark) mode|Toggle theme/,
      }),
    ).toBeInTheDocument();
    expect(within(sidebar).getByTestId('user-button')).toBeInTheDocument();
    expect(within(sidebar).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('link', { name: 'Create plan' }),
    ).toHaveAttribute('href', '/plans/new');

    const accountMenusWhenExpanded =
      screen.getAllByTestId('user-button').length;

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    const rail = screen.getByRole('complementary', {
      name: 'Application sidebar',
    });
    expect(rail).toHaveAttribute('id', 'app-desktop-sidebar');
    expect(rail).not.toHaveAttribute('aria-hidden');
    expect(rail).not.toHaveAttribute('inert');
    expect(
      within(rail).getByRole('navigation', { name: 'Application navigation' }),
    ).toBeInTheDocument();
    for (const item of authenticatedNavItems) {
      expect(
        within(rail).getByRole('link', { name: item.label }),
      ).toBeInTheDocument();
    }
    expect(
      within(rail).getByRole('link', { name: 'Create plan' }),
    ).toBeInTheDocument();
    expect(
      within(rail).getByRole('button', {
        name: /Switch to (light|dark) mode|Toggle theme/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' }),
    ).not.toBeInTheDocument();
    expect(within(rail).queryByText('Ada Lovelace')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open menu' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Mobile navigation' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toHaveFocus();
    expect(localStorage.getItem(DESKTOP_SIDEBAR_OPEN_STORAGE_KEY)).toBe('0');
    expect(
      document.documentElement.style.getPropertyValue(
        DESKTOP_SIDEBAR_OFFSET_VAR,
      ),
    ).toBe('4rem');

    // The desktop header looks the same as when expanded: one expand control
    // (in the rail) and no extra account chrome.
    expect(
      screen.getAllByRole('button', { name: 'Expand sidebar' }),
    ).toHaveLength(1);
    expect(screen.getAllByTestId('user-button')).toHaveLength(
      accountMenusWhenExpanded,
    );
  });

  it('expands the rail back to the full sidebar from the rail control', async () => {
    const user = userEvent.setup();
    localStorage.setItem(DESKTOP_SIDEBAR_OPEN_STORAGE_KEY, '0');
    renderChrome();

    expect(
      screen.getByRole('complementary', { name: 'Application sidebar' }),
    ).toHaveAttribute('id', 'app-desktop-sidebar');
    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));

    expect(
      screen.getByRole('complementary', { name: 'Application sidebar' }),
    ).toHaveAttribute('id', 'app-desktop-sidebar');
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    ).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Expand sidebar' }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(DESKTOP_SIDEBAR_OPEN_STORAGE_KEY)).toBe('1');
    expect(
      document.documentElement.style.getPropertyValue(
        DESKTOP_SIDEBAR_OFFSET_VAR,
      ),
    ).toBe('var(--at-semantic-layout-sidebar,14rem)');
  });

  it('does not add a desktop collapse control on marketing chrome', () => {
    usePathnameMock.mockReturnValue('/about');
    renderChrome();

    expect(
      screen.queryByRole('button', { name: 'Collapse sidebar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Expand sidebar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Application sidebar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open menu' }),
    ).toBeInTheDocument();
  });
});
