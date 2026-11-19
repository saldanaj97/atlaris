import AboutPage from '@/app/(landing)/about/page';
import SiteHeaderChrome from '@/components/shared/nav/SiteHeaderChrome';
import SiteFooter from '@/components/shared/SiteFooter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { authenticatedNavItems } from '@/features/navigation';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aboutPageFlag = vi.hoisted(() => vi.fn<() => Promise<boolean>>());

vi.mock('@/flags', () => ({ aboutPage: aboutPageFlag }));

vi.mock('next/server', () => ({ connection: async () => undefined }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/about',
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/app/(landing)/_shared/star-field.module.css', () => ({
  default: { star: 'star' },
}));

vi.mock('@/app/(landing)/about/components/about.module.css', () => ({
  default: {
    ambientOrb: 'ambientOrb',
    ambientOrbMuted: 'ambientOrbMuted',
    ambientOrbPrimary: 'ambientOrbPrimary',
    closeBanner: 'closeBanner',
    closeContent: 'closeContent',
    ctaMotion: 'ctaMotion',
    heroCopy: 'heroCopy',
    heroCopyBlock: 'heroCopyBlock',
    heroEmphasis: 'heroEmphasis',
    hero: 'hero',
    heroActions: 'heroActions',
    heroLead: 'heroLead',
    heroOverline: 'heroOverline',
    reveal: 'reveal',
    revealFromRight: 'revealFromRight',
    revealItem: 'revealItem',
  },
}));

async function renderAboutTree() {
  const page = await AboutPage();
  return render(
    <TooltipProvider>
      <SiteHeaderChrome
        navItems={authenticatedNavItems}
        isAuthenticated
        showClerkUserButton
      />
      {page}
      <SiteFooter />
    </TooltipProvider>,
  );
}

describe('AboutPage', () => {
  beforeEach(() => {
    aboutPageFlag.mockReset();
  });

  it('answers 404 while the about-page flag is off', async () => {
    aboutPageFlag.mockResolvedValue(false);

    await expect(AboutPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('answers 404 when the flag cannot be evaluated', async () => {
    aboutPageFlag.mockRejectedValue(new Error('Flagship unavailable'));

    await expect(AboutPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders in marketing chrome, with no About link, when the flag is on', async () => {
    aboutPageFlag.mockResolvedValue(true);
    await renderAboutTree();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /made after hours/i,
      }),
    ).toBeVisible();

    expect(
      screen.queryByRole('link', { name: 'About' }),
    ).not.toBeInTheDocument();

    const footer = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(footer).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/landing',
    );
    expect(
      within(footer).getByRole('link', { name: 'Pricing' }),
    ).toHaveAttribute('href', '/pricing');

    expect(
      screen.queryByRole('link', { name: 'Plans' }),
    ).not.toBeInTheDocument();
    const contactSection = screen.getByRole('region', {
      name: /if the map is wrong/i,
    });
    expect(
      within(contactSection).getByRole('link', {
        name: 'support@atlaris.app',
      }),
    ).toHaveAttribute('href', 'mailto:support@atlaris.app');
    expect(
      within(footer).getByRole('link', { name: 'support@atlaris.app' }),
    ).toHaveAttribute('href', 'mailto:support@atlaris.app');
  });
});
