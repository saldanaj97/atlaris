import { PlansHero } from '@/app/(app)/plans/components/PlansHero';
import { render, screen } from '@testing-library/react';
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
});
