import type { LessonSource } from '@/features/plans/read-projection/types';

import { LessonSourceList } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/LessonSourceList';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const sources: LessonSource[] = [
  {
    citationKey: 'S1',
    title: 'React state guide',
    publisher: 'react.dev',
    url: 'https://react.dev/learn/state',
    retrievedAt: new Date('2026-10-01T23:30:00.000Z'),
  },
  {
    citationKey: 'S2',
    title: 'Hooks reference',
    publisher: null,
    url: 'https://example.com/hooks',
    retrievedAt: new Date('2026-10-02T00:00:00.000Z'),
  },
];

describe('LessonSourceList', () => {
  it('renders each cited source with title, publisher, external link and retrieved date', () => {
    render(<LessonSourceList sources={sources} />);

    expect(
      screen.getByRole('heading', { name: 'Sources' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    const link = screen.getByRole('link', { name: /React state guide/ });
    expect(link).toHaveAttribute('href', 'https://react.dev/learn/state');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    expect(screen.getByText('[S1]')).toBeInTheDocument();
    expect(screen.getByText(/react\.dev ·/)).toBeInTheDocument();
    const retrieved = screen.getByText('Oct 1, 2026');
    expect(retrieved.tagName).toBe('TIME');
    expect(retrieved).toHaveAttribute('dateTime', '2026-10-01T23:30:00.000Z');
    expect(screen.getByText('Oct 2, 2026')).toBeInTheDocument();
  });

  it('renders nothing when the lesson cites no sources', () => {
    const { container } = render(<LessonSourceList sources={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
