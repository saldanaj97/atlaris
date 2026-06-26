import DesktopHeader from '@/components/shared/nav/DesktopHeader';
import { desktopHeaderShellClass } from '@/components/shared/nav/header-shell';
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
          headerVariant='protected'
          pathname='/dashboard'
          navItems={authenticatedNavItems}
          tier='starter'
          isAuthenticated
          showClerkUserButton
          {...props}
        />
      </div>
    </TooltipProvider>,
  );
}

describe('DesktopHeader layout', () => {
  it('uses equal side tracks so the nav center matches the shell center', () => {
    expect(desktopHeaderShellClass('protected')).toContain(
      'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
    );
    expect(desktopHeaderShellClass('protected')).not.toContain('grid-cols-3');
  });

  it('keeps authenticated nav items accessible at md width', () => {
    renderDesktopHeader();

    expect(
      screen.getByRole('link', { name: 'Activity Feed' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plans' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Analytics' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('centers navigation in the shell instead of the leftover space', () => {
    const { container } = renderDesktopHeader();

    const shell = container.firstElementChild?.firstElementChild;
    const navColumn = screen.getByRole('navigation').parentElement;

    expect(shell?.className).toContain(
      'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
    );
    expect(navColumn).toHaveClass('justify-self-center');
  });

  it('renders unauthenticated nav links without clipping at md width', () => {
    const { container } = render(
      <TooltipProvider>
        <div className='w-[768px]'>
          <DesktopHeader
            headerVariant='marketing'
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
});
