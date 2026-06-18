import type { LiquidGlassLens, LiquidGlassPhysics } from './types';

import { lensMapToDataUrl } from './liquid-glass-utils';
import { DEFAULT_LIQUID_GLASS_PHYSICS } from './types';

const NEUTRAL_CHANNEL = 128;
const NEUTRAL_ALPHA = 255;

export type LensMapResult = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  scale: number;
  chromaAmount: number;
};

const lensMapCache = new Map<string, LensMapResult>();
const lensMapDataUrlCache = new WeakMap<LensMapResult, string>();
const MAX_LENS_MAP_CACHE_ENTRIES = 32;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampChannel(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

function mirrorChannel(value: number): number {
  return clampChannel(256 - value);
}

function signedDistanceToRoundedRect(
  px: number,
  py: number,
  width: number,
  height: number,
  radius: number,
): number {
  const r = Math.min(radius, width / 2, height / 2);
  const cx = px + 0.5 - width / 2;
  const cy = py + 0.5 - height / 2;
  const halfW = width / 2;
  const halfH = height / 2;

  const qx = Math.abs(cx) - halfW + r;
  const qy = Math.abs(cy) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);

  return outside + inside - r;
}

function computeQuadrantDisplacement(
  x: number,
  y: number,
  width: number,
  height: number,
  borderRadius: number,
  physics: LiquidGlassPhysics,
): { r: number; g: number } {
  if (signedDistanceToRoundedRect(x, y, width, height, borderRadius) > 0) {
    return { r: NEUTRAL_CHANNEL, g: NEUTRAL_CHANNEL };
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const nx = (x + 0.5 - centerX) / centerX;
  const ny = (y + 0.5 - centerY) / centerY;
  const radiusSquared = nx * nx + ny * ny;

  if (radiusSquared >= 1) {
    return { r: NEUTRAL_CHANNEL, g: NEUTRAL_CHANNEL };
  }

  const { depth, curvature, scale, splay } = physics;
  const cap = Math.pow(1 - radiusSquared, curvature);
  const capDerivative =
    curvature <= 0 || radiusSquared >= 1
      ? 0
      : -2 * curvature * Math.pow(1 - radiusSquared, curvature - 1);

  const gradientX = depth * capDerivative * nx;
  const gradientY = depth * capDerivative * ny;

  const dx = scale * gradientX * centerX + splay * nx * cap;
  const dy = scale * gradientY * centerY + splay * ny * cap;

  return {
    r: clampChannel(NEUTRAL_CHANNEL + dx),
    g: clampChannel(NEUTRAL_CHANNEL + dy),
  };
}

function writePixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
): void {
  const index = (y * width + x) * 4;
  data[index] = r;
  data[index + 1] = g;
  data[index + 2] = NEUTRAL_CHANNEL;
  data[index + 3] = NEUTRAL_ALPHA;
}

function buildCacheKey(
  lens: LiquidGlassLens,
  physics: LiquidGlassPhysics,
): string {
  const width = Math.max(1, Math.round(lens.width));
  const height = Math.max(1, Math.round(lens.height));
  const borderRadius = Math.max(
    0,
    Math.min(
      Math.round(lens.borderRadius),
      Math.floor(width / 2),
      Math.floor(height / 2),
    ),
  );

  return JSON.stringify({
    width,
    height,
    borderRadius,
    scale: Math.round(physics.scale),
    depth: Math.round(physics.depth * 100),
    curvature: Math.round(physics.curvature * 100),
    splay: Math.round(physics.splay * 100),
    chroma: Math.round(physics.chroma * 100),
  });
}

function createLensMap(
  lens: LiquidGlassLens,
  physics: LiquidGlassPhysics,
): LensMapResult {
  const width = Math.max(1, Math.round(lens.width));
  const height = Math.max(1, Math.round(lens.height));
  const borderRadius = Math.max(0, Math.round(lens.borderRadius));
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = NEUTRAL_CHANNEL;
    data[index + 1] = NEUTRAL_CHANNEL;
    data[index + 2] = NEUTRAL_CHANNEL;
    data[index + 3] = NEUTRAL_ALPHA;
  }

  const halfWidth = Math.ceil(width / 2);
  const halfHeight = Math.ceil(height / 2);
  const mirrorX = (x: number) => width - 1 - x;
  const mirrorY = (y: number) => height - 1 - y;

  for (let y = 0; y < halfHeight; y += 1) {
    for (let x = 0; x < halfWidth; x += 1) {
      const { r, g } = computeQuadrantDisplacement(
        x,
        y,
        width,
        height,
        borderRadius,
        physics,
      );

      writePixel(data, width, x, y, r, g);

      const flippedX = mirrorX(x);
      if (flippedX !== x) {
        writePixel(data, width, flippedX, y, mirrorChannel(r), g);
      }

      const flippedY = mirrorY(y);
      if (flippedY !== y) {
        writePixel(data, width, x, flippedY, r, mirrorChannel(g));
      }

      if (flippedX !== x && flippedY !== y) {
        writePixel(
          data,
          width,
          flippedX,
          flippedY,
          mirrorChannel(r),
          mirrorChannel(g),
        );
      }
    }
  }

  return {
    width,
    height,
    data,
    scale: physics.scale,
    chromaAmount: Math.max(0, physics.chroma * physics.scale * 0.35),
  };
}

/** Clears the in-memory lens displacement map cache (for tests and hot reload). */
export function clearLensMapCache(): void {
  lensMapCache.clear();
}

/** Returns a cached data URL for the RGB displacement map encoded in `result`. */
export function getLensMapDataUrl(result: LensMapResult): string {
  const cached = lensMapDataUrlCache.get(result);
  if (cached !== undefined) {
    return cached;
  }

  const dataUrl = lensMapToDataUrl(result.data, result.width, result.height);
  lensMapDataUrlCache.set(result, dataUrl);
  return dataUrl;
}

/**
 * Builds (or returns a cached) feDisplacementMap RGBA buffer for the given lens and physics.
 */
export function generateLensMap(
  lens: LiquidGlassLens,
  physics: Partial<LiquidGlassPhysics> = {},
): LensMapResult {
  const resolvedPhysics: LiquidGlassPhysics = {
    ...DEFAULT_LIQUID_GLASS_PHYSICS,
    ...physics,
  };
  const cacheKey = buildCacheKey(lens, resolvedPhysics);
  const cached = lensMapCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const result = createLensMap(lens, resolvedPhysics);

  if (lensMapCache.size >= MAX_LENS_MAP_CACHE_ENTRIES) {
    const oldestKey = lensMapCache.keys().next().value;
    if (oldestKey) {
      lensMapCache.delete(oldestKey);
    }
  }

  lensMapCache.set(cacheKey, result);
  return result;
}
