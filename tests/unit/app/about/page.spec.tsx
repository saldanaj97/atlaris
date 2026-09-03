import AboutPage, { metadata } from '@/app/(marketing)/about/page';
import SiteHeaderChrome from '@/components/shared/nav/SiteHeaderChrome';
import SiteFooter from '@/components/shared/SiteFooter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { authenticatedNavItems } from '@/features/navigation';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/about',
}));

vi.mock('@/app/(marketing)/_shared/star-field.module.css', () => ({
  default: { star: 'star' },
}));

vi.mock('@/app/(marketing)/about/components/about.module.css', () => ({
  default: {
    ambientOrb: 'ambientOrb',
    ambientOrbMuted: 'ambientOrbMuted',
    ambientOrbPrimary: 'ambientOrbPrimary',
    ctaMotion: 'ctaMotion',
    heroCopy: 'heroCopy',
    heroEmphasis: 'heroEmphasis',
    heroLead: 'heroLead',
    heroOverline: 'heroOverline',
    reveal: 'reveal',
    revealItem: 'revealItem',
  },
}));

function renderAboutTree() {
  return render(
    <TooltipProvider>
      <SiteHeaderChrome
        navItems={authenticatedNavItems}
        isAuthenticated
        showClerkUserButton
      />
      <AboutPage />
      <SiteFooter />
    </TooltipProvider>,
  );
}

describe('AboutPage', () => {
  it('exports About metadata with description and social blocks', () => {
    expect(metadata.title).toBe('About | Atlaris');
    expect(metadata.description).toBe(
      'Who builds Atlaris, why it borrows the night sky, and what the AI does and does not do when it charts your plan.',
    );
    expect(metadata.openGraph).toMatchObject({
      title: 'About | Atlaris',
      url: '/about',
      type: 'website',
      siteName: 'Atlaris',
    });
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'About | Atlaris',
      site: '@atlarisapp',
      creator: '@atlarisapp',
    });
  });

  it('renders the heading and About links in marketing chrome and footer', () => {
    renderAboutTree();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /made after hours/i,
      }),
    ).toBeVisible();

    const headerAbout = screen
      .getAllByRole('link', { name: 'About' })
      .find((link) => !link.closest('footer'));
    expect(headerAbout).toHaveAttribute('href', '/about');
    expect(headerAbout).toHaveAttribute('aria-current', 'page');

    const footer = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(footer).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/landing',
    );
    expect(
      within(footer).getByRole('link', { name: 'Pricing' }),
    ).toHaveAttribute('href', '/pricing');
    expect(within(footer).getByRole('link', { name: 'About' })).toHaveAttribute(
      'href',
      '/about',
    );

    expect(
      screen.queryByRole('link', { name: 'Plans' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'support@atlaris.app' }),
    ).toHaveAttribute('href', 'mailto:support@atlaris.app');
  });
});
