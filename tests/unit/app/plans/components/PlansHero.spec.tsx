import { PlansHero } from '@/app/(app)/plans/components/PlansHero';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('PlansHero', () => {
  it('places live library chrome in the same hero surface', () => {
    render(
      <PlansHero
        chrome={<nav aria-label='Plan status filters'>Filters</nav>}
      />,
    );

    const hero = screen.getByRole('banner');
    expect(hero).toContainElement(
      screen.getByRole('navigation', { name: 'Plan status filters' }),
    );
  });

  it('renders the title and no create action or library metrics', () => {
    render(<PlansHero />);

    const hero = screen.getByRole('banner');
    expect(
      within(hero).getByRole('heading', { name: 'Your plans' }),
    ).toBeInTheDocument();
    expect(within(hero).queryByRole('link')).not.toBeInTheDocument();
    expect(
      within(hero).queryByLabelText(/active plans used/i),
    ).not.toBeInTheDocument();
    expect(within(hero).queryByText(/^Active$/)).not.toBeInTheDocument();
    expect(within(hero).queryByText(/^Completed$/)).not.toBeInTheDocument();
    expect(
      within(hero).queryByRole('link', { name: /browse templates/i }),
    ).not.toBeInTheDocument();
  });
});
