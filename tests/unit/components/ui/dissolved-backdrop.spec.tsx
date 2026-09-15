import { DissolvedBackdrop } from '@/components/ui/dissolved-backdrop';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('DissolvedBackdrop', () => {
  it('renders the supplied stills with the dissolve slot', () => {
    const { container } = render(
      <div className='relative'>
        <DissolvedBackdrop
          desktop={{ src: '/artwork/landing-planet-desktop.jpg' }}
          mobile={{ src: '/artwork/landing-planet-mobile.jpg' }}
        />
      </div>,
    );

    const backdrop = container.querySelector(
      '[data-slot="dissolved-backdrop"]',
    );
    expect(backdrop).not.toBeNull();
    expect(
      container.querySelector('img[src*="landing-planet-desktop.jpg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('img[src*="landing-planet-mobile.jpg"]'),
    ).not.toBeNull();
  });
});
