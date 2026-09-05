import MobileNavigation from '@/components/shared/nav/MobileNavigation';
import { TooltipProvider } from '@/components/ui/tooltip';
import { unauthenticatedNavItems } from '@/features/navigation';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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
          canCreatePlan
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
      screen.getByRole('link', { name: 'Create New Plan' }),
    ).toHaveAttribute('href', '/plans/new');
  });

  it('routes authenticated create action to pricing after lifetime access is used', async () => {
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

    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/pricing',
    );
    expect(
      screen.queryByRole('link', { name: 'Create New Plan' }),
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
});
