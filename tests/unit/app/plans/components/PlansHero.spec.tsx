import { PlansHero } from '@/app/(app)/plans/components/PlansHero';
import { render, screen, within } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';

describe('PlansHero', () => {
  it('renders the library heading, existing subtitle, and vertical quote', () => {
    render(<PlansHero />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Keep building your brighter future.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your learning plans turn big goals into real progress. Start a new plan, pick up where you left off, or find the next step in your library.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Discipline today. Opportunity tomorrow.'),
    ).toHaveAttribute('aria-hidden', 'true');
    expect(
      screen.queryByRole('link', { name: /browse templates/i }),
    ).not.toBeInTheDocument();
  });

  it('places live library chrome in the same hero surface', () => {
    render(
      <PlansHero chrome={<nav aria-label='Plan status filters'>Filters</nav>}>
        <Link href='/plans/new'>New Plan</Link>
      </PlansHero>,
    );

    const hero = screen.getByRole('banner');
    expect(hero).toContainElement(
      screen.getByRole('navigation', { name: 'Plan status filters' }),
    );
    expect(hero).toContainElement(
      screen.getByRole('link', { name: 'New Plan' }),
    );
  });

  it('keeps the action row to the entitlement CTA without library metrics', () => {
    render(
      <PlansHero>
        <Link href='/plans/new'>New Plan</Link>
      </PlansHero>,
    );

    const hero = screen.getByRole('banner');
    expect(
      within(hero).getByRole('link', { name: 'New Plan' }),
    ).toHaveAttribute('href', '/plans/new');
    expect(within(hero).getAllByRole('link')).toHaveLength(1);
    expect(
      within(hero).queryByLabelText(/active plans used/i),
    ).not.toBeInTheDocument();
    expect(within(hero).queryByText(/^Active$/)).not.toBeInTheDocument();
    expect(within(hero).queryByText(/^Completed$/)).not.toBeInTheDocument();
    expect(
      within(hero).queryByRole('link', { name: /browse templates/i }),
    ).not.toBeInTheDocument();
  });

  it('uses the summit still for the existing library artwork slot', () => {
    render(<PlansHero />);

    const hero = screen.getByRole('banner');
    expect(
      hero.querySelector('[data-slot="dissolved-backdrop"]'),
    ).not.toBeNull();
    expect(
      hero.querySelector('img[src*="mountain-summit-blue-hour.webp"]'),
    ).not.toBeNull();
    expect(
      hero.querySelector('img[src*="plan-library-mountain-overlook"]'),
    ).toBeNull();
  });
});
