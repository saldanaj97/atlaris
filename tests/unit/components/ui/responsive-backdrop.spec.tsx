import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('ResponsiveBackdrop', () => {
  it('preloads only the matching viewport still when priority is requested', () => {
    const { container } = render(
      <div className='relative'>
        <ResponsiveBackdrop
          desktop={{ src: '/artwork/landing-planet-desktop.jpg' }}
          mobile={{ src: '/artwork/landing-planet-mobile.jpg' }}
          priority
        />
      </div>,
    );

    const preloads = [
      ...container.querySelectorAll('link[rel="preload"][as="image"]'),
    ];
    expect(preloads).toHaveLength(2);
    expect(preloads.map((link) => link.getAttribute('media'))).toEqual([
      '(min-width: 768px)',
      '(max-width: 767px)',
    ]);
    expect(
      container.querySelectorAll('img[fetchpriority="high"]'),
    ).toHaveLength(0);
  });
});
