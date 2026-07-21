export type LiquidGlassLens = {
  width: number;
  height: number;
  borderRadius: number;
};

export type LiquidGlassPhysics = {
  /** Refraction / displacement strength passed to feDisplacementMap. */
  scale: number;
  /** Lens dome depth (0–1). */
  depth: number;
  /** Spherical-cap exponent; higher = tighter center bulge. */
  curvature: number;
  /** Radial outward bias added to displacement. */
  splay: number;
  /** Chromatic fringe strength (0–1). */
  chroma: number;
  blur?: number;
  glow?: number;
  edgeHighlight?: number;
  specularAngle?: number;
};

export type LiquidGlassProps = {
  lens: LiquidGlassLens;
  physics?: Partial<LiquidGlassPhysics>;
  className?: string;
  /** Static glassmorphism classes when reduced-motion or SVG filters are unavailable. */
  fallbackClassName?: string;
  children: React.ReactNode;
  /** Lighter preset for /pricing and other subtle surfaces. */
  intensity?: 'default' | 'subtle';
};

export type LiquidGlassLayerProps = Omit<LiquidGlassProps, 'children'> & {
  /**
   * Decorative layers should never own layout height. Keep clipping and filter
   * bounds scoped to this layer rather than the interactive surface above it.
   */
  'aria-hidden'?: true;
};

/** Default physics merged with `intensity="default"` and partial overrides. */
export const DEFAULT_LIQUID_GLASS_PHYSICS: LiquidGlassPhysics = {
  scale: 24,
  depth: 0.8,
  curvature: 1.5,
  splay: 2,
  chroma: 0.15,
  blur: 0,
  glow: 0,
  edgeHighlight: 0.4,
  specularAngle: 135,
};

/** Marketing header shell — flat lens; uniform scrim + subtle edge refraction only. */
export const MARKETING_HEADER_PHYSICS: LiquidGlassPhysics = {
  scale: 8,
  depth: 0.25,
  curvature: 1,
  splay: 0,
  chroma: 0,
  blur: 0,
  glow: 0,
  edgeHighlight: 0,
  specularAngle: 135,
};

/** Lighter header preset for /pricing. */
export const PRICING_HEADER_PHYSICS: LiquidGlassPhysics = {
  scale: 6,
  depth: 0.2,
  curvature: 1,
  splay: 0,
  chroma: 0,
  blur: 0,
  glow: 0,
  edgeHighlight: 0,
  specularAngle: 135,
};

/** Small-lens preset for marketing CTAs (~button-sized regions). */
export const MARKETING_CTA_PHYSICS: LiquidGlassPhysics = {
  scale: 18,
  depth: 0.6,
  curvature: 1.8,
  splay: 1.5,
  /* Keep fringe subtle; warm matrices in the filter do the peach/plum sheen. */
  chroma: 0.12,
  blur: 0,
  glow: 0.3,
  edgeHighlight: 0.5,
  specularAngle: 120,
};

/** Merges intensity preset physics with optional per-surface overrides. */
export function resolveLiquidGlassPhysics(
  intensity: LiquidGlassProps['intensity'] = 'default',
  overrides?: Partial<LiquidGlassPhysics>,
): LiquidGlassPhysics {
  const base =
    intensity === 'subtle'
      ? PRICING_HEADER_PHYSICS
      : DEFAULT_LIQUID_GLASS_PHYSICS;

  return {
    ...base,
    ...overrides,
  };
}
