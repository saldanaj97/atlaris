/** Committed share image in `public/brand/`. Dimensions match the PNG on disk. */
export const OG_DEFAULT_IMAGE = {
  url: '/brand/og-default.png',
  width: 1200,
  height: 630,
  alt: 'Atlaris — The guide to learning anything',
} as const;

/**
 * Supplied lockup masters share a 2172×724 canvas but different visible
 * artwork. Size chrome by the visible box, not the padded canvas.
 * Bounds are alpha ≥128 measurements of the committed PNGs.
 */
export const BRAND_LOCKUPS = {
  light: {
    src: '/brand/logo-on-light.png',
    canvasWidth: 2172,
    canvasHeight: 724,
    visibleWidth: 1874,
    visibleHeight: 427,
    visibleLeft: 147,
    visibleTop: 149,
  },
  dark: {
    src: '/brand/logo-on-dark.png',
    canvasWidth: 2172,
    canvasHeight: 724,
    visibleWidth: 1177,
    visibleHeight: 258,
    visibleLeft: 497,
    visibleTop: 236,
  },
} as const;

export type BrandLockupVariant = keyof typeof BRAND_LOCKUPS;
export type BrandLogoSize = 'sm' | 'md';

/** Visible lockup width. Draft minimum is 128 CSS px. */
export const BRAND_LOCKUP_VISIBLE_WIDTH = {
  sm: 128,
  md: 128,
} as const;

export function getBrandLockupLayout(
  variant: BrandLockupVariant,
  size: BrandLogoSize = 'md',
) {
  const lockup = BRAND_LOCKUPS[variant];
  const width = BRAND_LOCKUP_VISIBLE_WIDTH[size];
  const scale = width / lockup.visibleWidth;
  const height = Math.round(lockup.visibleHeight * scale);
  const imageWidth = Math.round(lockup.canvasWidth * scale);
  const imageHeight = Math.round(lockup.canvasHeight * scale);
  const offsetX = -Math.round(lockup.visibleLeft * scale);
  const offsetY = -Math.round(lockup.visibleTop * scale);

  return { width, height, imageWidth, imageHeight, offsetX, offsetY };
}
