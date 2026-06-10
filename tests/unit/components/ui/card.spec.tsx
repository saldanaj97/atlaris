import { CardTitle } from '@/components/ui/card';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('CardTitle', () => {
  it('renders as a div by default', () => {
    render(<CardTitle>Plan details</CardTitle>);
    const title = screen.getByText('Plan details');
    expect(title.tagName).toBe('DIV');
    expect(title).toHaveAttribute('data-slot', 'card-title');
  });

  it('can render as a heading for nested section titles', () => {
    render(<CardTitle as='h3'>Current Plan</CardTitle>);
    expect(
      screen.getByRole('heading', { name: 'Current Plan', level: 3 }),
    ).toBeInTheDocument();
  });
});
