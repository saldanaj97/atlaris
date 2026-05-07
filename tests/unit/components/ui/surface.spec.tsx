import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Surface } from '@/components/ui/surface';

describe('Surface', () => {
  it('renders children with surface data slot', () => {
    const { container } = render(<Surface>Panel body</Surface>);
    expect(screen.getByText('Panel body')).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="surface"]'),
    ).toBeInTheDocument();
  });
});
