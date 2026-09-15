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

  it('collapses the desktop sidebar and keeps the mobile menu trigger', async () => {
    const user = userEvent.setup();
    renderChrome();

    expect(
      screen.getByRole('complementary', { name: 'Application sidebar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Application navigation' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open menu' }),
    ).toBeInTheDocument();

    const sidebar = screen.getByRole('complementary', {
      name: 'Application sidebar',
    });
    expect(
      within(sidebar).getByRole('button', {
        name: /Switch to (light|dark) mode|Toggle theme/,
      }),
    ).toBeInTheDocument();
    expect(within(sidebar).getByTestId('user-button')).toBeInTheDocument();
    expect(within(sidebar).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(
      within(sidebar).queryByRole('link', { name: 'Account settings' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(
      screen.queryByRole('complementary', { name: 'Application sidebar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Application navigation' }),
    ).not.toBeInTheDocument();
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
    ).toBe('0px');
    expect(
      screen.queryByRole('link', { name: 'Create New Plan' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Account settings' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', {
        name: /Switch to (light|dark) mode|Toggle theme/,
      }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByTestId('user-button').length).toBeGreaterThan(0);
  });

  it('expands the desktop sidebar from the header control', async () => {
    const user = userEvent.setup();
    localStorage.setItem(DESKTOP_SIDEBAR_OPEN_STORAGE_KEY, '0');
    renderChrome();

    expect(
      screen.queryByRole('complementary', { name: 'Application sidebar' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));

    expect(
      screen.getByRole('complementary', { name: 'Application sidebar' }),
    ).toHaveAttribute('id', 'app-desktop-sidebar');
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    ).toHaveFocus();
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
