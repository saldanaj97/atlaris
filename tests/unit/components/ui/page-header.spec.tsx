import { PageHeader } from '@/components/ui/page-header';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('PageHeader', () => {
  it('renders title and subtitle with h1 by default', () => {
    render(<PageHeader title='Page title' subtitle='Helper line' />);
    const heading = screen.getByRole('heading', {
      name: 'Page title',
      level: 1,
    });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Helper line')).toBeInTheDocument();
  });

  it('can render h2 for nested pages', () => {
    render(<PageHeader title='Sub page' titleAs='h2' />);
    expect(
      screen.getByRole('heading', { name: 'Sub page', level: 2 }),
    ).toBeInTheDocument();
  });

  it('renders centered title and subtitle when align is center', () => {
    render(
      <PageHeader
        align='center'
        title='Create plan'
        subtitle='Describe your goal'
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Create plan', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Describe your goal')).toBeInTheDocument();
  });
});
