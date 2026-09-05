import { metadata as aboutMetadata } from '@/app/(marketing)/about/page';
import { metadata as landingMetadata } from '@/app/(marketing)/landing/layout';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('brand social assets', () => {
  it('keeps committed favicon files on the public paths metadata uses', () => {
    const files = [
      'public/favicon.ico',
      'public/brand/favicon.svg',
      'public/brand/favicon-16.svg',
      'public/brand/favicon-32.svg',
      'public/brand/favicon-on-light.svg',
      'public/brand/favicon-on-dark.svg',
    ];
    for (const file of files) {
      expect(existsSync(join(process.cwd(), file)), file).toBe(true);
    }
  });

  it('points Open Graph metadata at the committed PNG with matching dimensions', () => {
    expect(OG_DEFAULT_IMAGE).toEqual({
      url: '/brand/og-default.png',
      width: 1734,
      height: 907,
      alt: 'Atlaris — plans for the quiet hours',
    });
    expect(
      existsSync(join(process.cwd(), 'public', 'brand', 'og-default.png')),
    ).toBe(true);
    expect(landingMetadata.openGraph?.images).toEqual([OG_DEFAULT_IMAGE]);
    expect(landingMetadata.twitter?.images).toEqual([OG_DEFAULT_IMAGE.url]);
    expect(aboutMetadata.openGraph?.images).toEqual([OG_DEFAULT_IMAGE]);
    expect(aboutMetadata.twitter?.images).toEqual([OG_DEFAULT_IMAGE.url]);
  });
});
