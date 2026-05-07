import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageShell } from '@/components/ui/page-shell';

describe('PageShell', () => {
  it('renders children and page shell data slot', () => {
    const { container } = render(
      <PageShell>
        <p>Content</p>
      </PageShell>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="page-shell"]'),
    ).toBeInTheDocument();
  });
});
