import DesktopHeader from '@/components/shared/nav/DesktopHeader';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/features/navigation';
import { cleanup, render, screen, within } from '@testing-library/react';
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
    renderDesktopHeader();

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

    for (const item of unauthenticatedNavItems) {
      expect(
        screen.getByRole('link', { name: item.label }),
      ).toBeInTheDocument();
    }

    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(within(nav!).getAllByRole('link')).toHaveLength(
      unauthenticatedNavItems.length,
    );
  });

  it('keeps marketing chrome when authenticated (no app nav or avatar)', () => {
    renderDesktopHeader({
      isMarketing: true,
      pathname: '/landing',
      navItems: unauthenticatedNavItems,
      isAuthenticated: true,
      showClerkUserButton: true,
    });

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/landing',
    );
    expect(
      screen.getByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).toHaveAttribute('href', '/landing');
    expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'About' }),
    ).not.toBeInTheDocument();
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
});
