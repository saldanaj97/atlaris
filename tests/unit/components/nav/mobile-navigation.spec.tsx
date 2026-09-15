import {
  APP_SHELL_DESKTOP_MEDIA_QUERY,
  MARKETING_DESKTOP_MEDIA_QUERY,
  SITE_DESKTOP_NAVIGATION_ID,
} from '@/components/shared/nav/desktop-nav-sync';
import {
  DESKTOP_SIDEBAR_EXPAND_CONTROL_ID,
  DESKTOP_SIDEBAR_ID,
} from '@/components/shared/nav/desktop-sidebar-state';
import MobileNavigation from '@/components/shared/nav/MobileNavigation';
import { TooltipProvider } from '@/components/ui/tooltip';
import { unauthenticatedNavItems } from '@/features/navigation';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

function renderMobileNavigation(isMarketing = true) {
  return render(
    <TooltipProvider>
      <MobileNavigation
        isMarketing={isMarketing}
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
          isMarketing={false}
          isAppShell
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
      screen.getByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).toHaveAttribute('href', '/landing');
    expect(
      screen.queryByRole('link', { name: 'Create New Plan' }),
    ).not.toBeInTheDocument();
  });

  it('does not render a create-plan or entitlement upgrade action in the app drawer', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <MobileNavigation
          isMarketing={false}
          isAppShell
          pathname='/dashboard'
          navItems={navItems}
          canCreatePlan={false}
          isAuthenticated
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(
      screen.queryByRole('link', { name: 'Create New Plan' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Upgrade' }),
    ).not.toBeInTheDocument();
  });

  it('uses Dashboard CTA on marketing sheets when signed in', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <MobileNavigation
          isMarketing
          pathname='/landing'
          navItems={[{ href: '/landing', label: 'Home' }]}
          isAuthenticated
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/landing',
    );
    expect(
      screen.getByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).toHaveAttribute('href', '/landing');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(
      screen.queryByRole('link', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('renders About in the marketing sheet', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <MobileNavigation
          isMarketing
          pathname='/about'
          navItems={unauthenticatedNavItems}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'href',
      '/about',
    );
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('uses Begin tonight CTA on marketing sheets when signed out', async () => {
    const user = userEvent.setup();

    renderMobileNavigation();

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(screen.getByRole('link', { name: 'Begin tonight' })).toHaveAttribute(
      'href',
      '/auth/sign-in',
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/auth/sign-in',
    );
    expect(
      screen.queryByRole('link', { name: 'Create New Plan' }),
    ).not.toBeInTheDocument();
  });

  it('keeps signed-out auth sheets on the ordinary navigation composition', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <MobileNavigation
          isMarketing={false}
          pathname='/auth/sign-in'
          navItems={unauthenticatedNavItems}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(
      screen.getByRole('link', { name: 'Create New Plan' }),
    ).toHaveAttribute('href', '/plans/new');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/landing',
    );
    expect(
      screen.queryByRole('link', { name: 'Account settings' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Application navigation' }),
    ).not.toBeInTheDocument();
  });

  it('returns focus to the menu trigger when the app drawer closes with Escape', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <MobileNavigation
          isMarketing={false}
          isAppShell
          pathname='/dashboard'
          navItems={navItems}
          tier='pro'
          canCreatePlan
          isAuthenticated
        />
      </TooltipProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Open menu' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('navigation', { name: 'Mobile navigation' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('leaves destination focus intact after a navigation closes the app drawer', async () => {
    const user = userEvent.setup();
    let destination: HTMLHeadingElement | null = null;
    const handleClick = (event: MouseEvent) => {
      if (
        event.target instanceof HTMLAnchorElement &&
        event.target.getAttribute('href') === '/plans'
      ) {
        setTimeout(() => destination?.focus(), 0);
      }
    };
    document.addEventListener('click', handleClick);

    render(
      <>
        <TooltipProvider>
          <MobileNavigation
            isMarketing={false}
            isAppShell
            pathname='/dashboard'
            navItems={navItems}
            tier='pro'
            canCreatePlan
            isAuthenticated
          />
        </TooltipProvider>
        <h1
          ref={(node) => {
            destination = node;
          }}
          tabIndex={-1}
        >
          Plans destination
        </h1>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByRole('link', { name: 'Plans' }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Plans destination' }),
      ).toHaveFocus(),
    );
    document.removeEventListener('click', handleClick);
  });

  describe('desktop breakpoint', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function stubMatchMedia() {
      const listeners = new Set<(event: { matches: boolean }) => void>();
      const media = {
        addEventListener: vi.fn(
          (type: string, listener: (event: { matches: boolean }) => void) => {
            if (type === 'change') listeners.add(listener);
          },
        ),
        matches: false,
        media: '',
        removeEventListener: vi.fn(
          (type: string, listener: (event: { matches: boolean }) => void) => {
            listeners.delete(listener);
          },
        ),
      };
      const matchMedia = vi.fn((query: string) => {
        media.media = query;
        return media;
      });
      vi.stubGlobal('matchMedia', matchMedia);

      return {
        matchMedia,
        setMatches(matches: boolean) {
          media.matches = matches;
          for (const listener of listeners) {
            listener({ matches });
          }
        },
      };
    }

    it('closes the app drawer at lg and moves focus to the desktop sidebar', async () => {
      const user = userEvent.setup();
      const media = stubMatchMedia();

      render(
        <>
          <TooltipProvider>
            <MobileNavigation
              isMarketing={false}
              isAppShell
              pathname='/dashboard'
              navItems={navItems}
              isAuthenticated
            />
          </TooltipProvider>
          <aside id={DESKTOP_SIDEBAR_ID}>
            <nav aria-label='Application navigation'>
              <button type='button'>Desktop dashboard</button>
            </nav>
          </aside>
        </>,
      );

      await user.click(screen.getByRole('button', { name: 'Open menu' }));
      expect(
        screen.getByRole('navigation', { name: 'Mobile navigation' }),
      ).toBeInTheDocument();
      expect(media.matchMedia).toHaveBeenCalledWith(
        APP_SHELL_DESKTOP_MEDIA_QUERY,
      );

      media.setMatches(true);

      await waitFor(() =>
        expect(
          screen.queryByRole('navigation', { name: 'Mobile navigation' }),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole('button', { name: 'Desktop dashboard' }),
      ).toHaveFocus();
    });

    it('moves app-drawer focus to the sidebar expand control when the sidebar is collapsed', async () => {
      const user = userEvent.setup();
      const media = stubMatchMedia();

      render(
        <>
          <TooltipProvider>
            <MobileNavigation
              isMarketing={false}
              isAppShell
              pathname='/dashboard'
              navItems={navItems}
              isAuthenticated
            />
          </TooltipProvider>
          <button id={DESKTOP_SIDEBAR_EXPAND_CONTROL_ID} type='button'>
            Expand sidebar
          </button>
        </>,
      );

      await user.click(screen.getByRole('button', { name: 'Open menu' }));
      media.setMatches(true);

      await waitFor(() =>
        expect(
          screen.queryByRole('navigation', { name: 'Mobile navigation' }),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole('button', { name: 'Expand sidebar' }),
      ).toHaveFocus();
    });

    it('closes the marketing drawer at md and moves focus to desktop navigation', async () => {
      const user = userEvent.setup();
      const media = stubMatchMedia();

      render(
        <>
          <TooltipProvider>
            <MobileNavigation
              isMarketing
              pathname='/landing'
              navItems={[{ href: '/landing', label: 'Home' }]}
            />
          </TooltipProvider>
          <nav id={SITE_DESKTOP_NAVIGATION_ID}>
            <button type='button'>Desktop home</button>
          </nav>
        </>,
      );

      await user.click(screen.getByRole('button', { name: 'Open menu' }));
      expect(media.matchMedia).toHaveBeenCalledWith(
        MARKETING_DESKTOP_MEDIA_QUERY,
      );

      media.setMatches(true);

      await waitFor(() =>
        expect(
          screen.queryByRole('navigation', { name: 'Mobile navigation' }),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.getByRole('button', { name: 'Desktop home' }),
      ).toHaveFocus();
    });
  });
});
