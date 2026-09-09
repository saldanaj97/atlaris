import { Progress } from '@/components/ui/progress';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('Progress', () => {
  it.each([
    { value: 4, expectedNow: '4', expectedTransform: 'translateX(-60%)' },
    { value: 15, expectedNow: '10', expectedTransform: 'translateX(-0%)' },
    { value: -2, expectedNow: '0', expectedTransform: 'translateX(-100%)' },
  ])(
    'normalizes value $value against a custom max',
    ({ value, expectedNow, expectedTransform }) => {
      render(<Progress value={value} max={10} aria-label='Lesson progress' />);

      const progress = screen.getByRole('progressbar', {
        name: 'Lesson progress',
      });
      const indicator = progress.querySelector(
        '[data-slot="progress-indicator"]',
      );

      expect(progress).toHaveAttribute('aria-valuemax', '10');
      expect(progress).toHaveAttribute('aria-valuenow', expectedNow);
      expect(indicator).toHaveStyle({ transform: expectedTransform });
    },
  );

  it('defaults an invalid max to 100 before normalizing the value', () => {
    render(<Progress value={50} max={0} aria-label='Plan progress' />);

    const progress = screen.getByRole('progressbar', {
      name: 'Plan progress',
    });

    expect(progress).toHaveAttribute('aria-valuemax', '100');
    expect(progress).toHaveAttribute('aria-valuenow', '50');
  });

  it.each([null, undefined])(
    'keeps an explicit indeterminate value (%s) without a fabricated now value',
    (value) => {
      render(<Progress value={value} aria-label='Loading progress' />);

      const progress = screen.getByRole('progressbar', {
        name: 'Loading progress',
      });
      const indicator = progress.querySelector(
        '[data-slot="progress-indicator"]',
      );

      expect(progress).toHaveAttribute('data-state', 'indeterminate');
      expect(progress).not.toHaveAttribute('aria-valuenow');
      expect(indicator).toHaveAttribute('data-state', 'indeterminate');
    },
  );
});
