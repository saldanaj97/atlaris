import DesktopHeader from '@/components/shared/nav/DesktopHeader';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/features/navigation';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid='user-button'>Mocked UserButton</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDesktopHeader(
  props: Partial<Parameters<typeof DesktopHeader>[0]> = {},
) {
  return render(
    <TooltipProvider>
      <div className='w-[768px]'>
        <DesktopHeader
          isMarketing={false}
          pathname='/dashboard'
          navItems={authenticatedNavItems}
          tier='starter'
          canCreatePlan
          isAuthenticated
          showClerkUserButton
          {...props}
        />
      </div>
    </TooltipProvider>,
  );
}

describe('DesktopHeader layout', () => {
  it('keeps authenticated nav items accessible at md width', () => {
    const { container } = renderDesktopHeader();

    expect(container.firstElementChild?.firstElementChild).toHaveClass(
      'md:grid',
    );
    expect(container.firstElementChild?.firstElementChild).not.toHaveClass(
      'lg:grid',
    );

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).toHaveAttribute('href', '/landing');
    expect(screen.getByRole('link', { name: 'Plans' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Analytics' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New Plan' })).toBeInTheDocument();
  });

  it('routes authenticated create action to pricing after lifetime access is used', () => {
    renderDesktopHeader({ tier: 'free', canCreatePlan: false });

    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(
      screen.queryByRole('link', { name: 'New Plan' }),
    ).not.toBeInTheDocument();
  });

  it('routes signed-out nonmarketing create action to the plan form', () => {
    renderDesktopHeader({
      isMarketing: false,
      pathname: '/auth/sign-in',
      navItems: unauthenticatedNavItems,
      canCreatePlan: undefined,
      isAuthenticated: false,
      showClerkUserButton: false,
    });

    expect(screen.getByRole('link', { name: 'New Plan' })).toHaveAttribute(
      'href',
      '/plans/new',
    );
  });

  it('leaves app-shell navigation and branding to the sidebar', () => {
    const { container } = renderDesktopHeader({ isAppShell: true });

    expect(container.firstElementChild?.firstElementChild).toHaveClass(
      'lg:grid',
    );
    expect(container.firstElementChild?.firstElementChild).not.toHaveClass(
      'md:grid',
    );

    expect(
      screen.queryByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Dashboard' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Settings' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New Plan' })).toBeInTheDocument();
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /Switch to (light|dark) mode|Toggle theme/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Expand sidebar' }),
    ).not.toBeInTheDocument();
  });

  it('reopens the desktop sidebar from the header when the rail is closed', async () => {
    const user = userEvent.setup();
    const onSidebarOpenChange = vi.fn();

    renderDesktopHeader({
      isAppShell: true,
      sidebarOpen: false,
      onSidebarOpenChange,
    });

    const expand = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(expand).toHaveAttribute('aria-controls', 'app-desktop-sidebar');

    expand.focus();
    expect(expand).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSidebarOpenChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole('button', {
        name: /Switch to (light|dark) mode|Toggle theme/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
  });

  it('renders unauthenticated nav links without clipping at md width', () => {
    const { container } = render(
      <TooltipProvider>
        <div className='w-[768px]'>
          <DesktopHeader
            isMarketing
            pathname='/landing'
            navItems={unauthenticatedNavItems}
            isAuthenticated={false}
            showClerkUserButton
          />
        </div>
      </TooltipProvider>,
    );

    const header = container.firstElementChild?.firstElementChild;
    expect(header).toHaveClass('md:grid');
    expect(header).toHaveClass('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]');
    expect(header).not.toHaveClass('md:flex');
    expect(header).not.toHaveClass('lg:grid');
    expect(header).not.toHaveClass('justify-between');

    for (const item of unauthenticatedNavItems) {
      expect(
        screen.getByRole('link', { name: item.label }),
      ).toBeInTheDocument();
    }

    const brand = screen.getByRole('link', {
      name: 'Atlaris - Go to homepage',
    });
    const nav = screen.getByRole('navigation', {
      name: 'Marketing navigation',
    });
    expect(header?.children).toHaveLength(3);
    expect(header?.children[0]).toContainElement(brand);
    expect(header?.children[1]).toContainElement(nav);
    expect(brand.parentElement).not.toContainElement(nav);
    expect(within(nav).getAllByRole('link')).toHaveLength(
      unauthenticatedNavItems.length,
    );
  });

  it('keeps marketing chrome when authenticated (no app nav or avatar)', () => {
    const { container } = renderDesktopHeader({
      isMarketing: true,
      pathname: '/landing',
      navItems: unauthenticatedNavItems,
      isAuthenticated: true,
      showClerkUserButton: true,
    });

    const header = container.firstElementChild?.firstElementChild;
    expect(header).toHaveClass('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]');

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/landing',
    );
    const brand = screen.getByRole('link', {
      name: 'Atlaris - Go to homepage',
    });
    expect(brand).toHaveAttribute('href', '/landing');
    expect(brand.parentElement).not.toContainElement(
      screen.getByRole('navigation', { name: 'Marketing navigation' }),
    );
    expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'href',
      '/about',
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );

    expect(
      screen.queryByRole('link', { name: 'Activity Feed' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New Plan' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument();
  });

  it('exposes sign-in and the visitor CTA on signed-out marketing chrome', () => {
    renderDesktopHeader({
      isMarketing: true,
      pathname: '/landing',
      navItems: unauthenticatedNavItems,
      isAuthenticated: false,
      showClerkUserButton: false,
    });

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/sign-in',
    );
    expect(screen.getByRole('link', { name: 'Begin tonight' })).toHaveAttribute(
      'href',
      '/auth/sign-in',
    );
  });
});
