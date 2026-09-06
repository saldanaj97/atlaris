import { metadata as aboutMetadata } from '@/app/(marketing)/about/page';
import { metadata as landingMetadata } from '@/app/(marketing)/landing/layout';
import { metadata as rootMetadata } from '@/app/layout';
import { OG_DEFAULT_IMAGE } from '@/shared/constants/brand-assets';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Sora: () => ({ className: '', variable: '' }),
  Work_Sans: () => ({ className: '', variable: '' }),
}));

describe('brand social assets', () => {
  it('keeps committed favicon files on the public paths metadata uses', () => {
    const files = [
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

  it('publishes an opaque 180px Apple touch icon through root metadata', () => {
    const iconPath = join(
      process.cwd(),
      'public',
      'brand',
      'apple-touch-icon.png',
    );
    expect(existsSync(iconPath)).toBe(true);

    const icon = readFileSync(iconPath);
    expect(icon.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect({
      width: icon.readUInt32BE(16),
      height: icon.readUInt32BE(20),
    }).toEqual({ width: 180, height: 180 });
    expect(rootMetadata.icons).toEqual(
      expect.objectContaining({
        apple: [
          {
            url: '/brand/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      }),
    );
    expect(JSON.stringify(rootMetadata.icons)).not.toContain('/favicon.ico');
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
