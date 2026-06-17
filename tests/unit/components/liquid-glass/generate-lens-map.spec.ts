import type { LiquidGlassLens } from '@/components/shared/liquid-glass/types';

import {
  clearLensMapCache,
  generateLensMap,
} from '@/components/shared/liquid-glass/generate-lens-map';
import { describe, expect, it, beforeEach } from 'vitest';

const NEUTRAL = 128;

const testLens: LiquidGlassLens = {
  width: 64,
  height: 32,
  borderRadius: 12,
};

const testPhysics = {
  scale: 20,
  depth: 0.7,
  curvature: 1.4,
  splay: 2,
  chroma: 0.1,
};

function readPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): { r: number; g: number; b: number; a: number } {
  const index = (y * width + x) * 4;
  return {
    r: data[index] ?? 0,
    g: data[index + 1] ?? 0,
    b: data[index + 2] ?? 0,
    a: data[index + 3] ?? 0,
  };
}

describe('generateLensMap', () => {
  beforeEach(() => {
    clearLensMapCache();
  });

  it('leaves neutral pixels outside the rounded-rect lens', () => {
    const { width, height, data } = generateLensMap(testLens, testPhysics);

    const outsideSamples = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ] as const;

    for (const [x, y] of outsideSamples) {
      const pixel = readPixel(data, width, x, y);
      expect(pixel).toEqual({ r: NEUTRAL, g: NEUTRAL, b: NEUTRAL, a: 255 });
    }
  });

  it('mirrors quadrant displacement across both axes', () => {
    const { width, height, data } = generateLensMap(testLens, testPhysics);

    const samples = [
      [8, 6],
      [12, 10],
      [16, 8],
    ] as const;

    for (const [x, y] of samples) {
      const topLeft = readPixel(data, width, x, y);
      const topRight = readPixel(data, width, width - 1 - x, y);
      const bottomLeft = readPixel(data, width, x, height - 1 - y);
      const bottomRight = readPixel(data, width, width - 1 - x, height - 1 - y);

      expect(topRight.r).toBe(256 - topLeft.r);
      expect(topRight.g).toBe(topLeft.g);
      expect(bottomLeft.r).toBe(topLeft.r);
      expect(bottomLeft.g).toBe(256 - topLeft.g);
      expect(bottomRight.r).toBe(256 - topLeft.r);
      expect(bottomRight.g).toBe(256 - topLeft.g);
    }
  });

  it('returns the same cached reference for identical inputs', () => {
    const first = generateLensMap(testLens, testPhysics);
    const second = generateLensMap(testLens, testPhysics);

    expect(second).toBe(first);
    expect(second.data).toBe(first.data);
  });

  it('produces deterministic output for fixed inputs', () => {
    const first = generateLensMap(testLens, testPhysics);
    clearLensMapCache();
    const second = generateLensMap(testLens, testPhysics);

    expect(Array.from(second.data)).toEqual(Array.from(first.data));
    expect(second.scale).toBe(first.scale);
    expect(second.chromaAmount).toBe(first.chromaAmount);
  });

  it('reuses cached maps when non-map physics fields differ', () => {
    const first = generateLensMap(testLens, testPhysics);
    const second = generateLensMap(testLens, {
      ...testPhysics,
      blur: 0.9,
      glow: 0.8,
      edgeHighlight: 0.7,
      specularAngle: 45,
    });

    expect(second).toBe(first);
  });

  it('evicts the oldest cache entry when the cache is full', () => {
    const oldestLens = { ...testLens, width: testLens.width };
    const oldest = generateLensMap(oldestLens, testPhysics);

    for (let index = 1; index <= 32; index += 1) {
      generateLensMap(
        { ...testLens, width: testLens.width + index },
        testPhysics,
      );
    }

    generateLensMap({ ...testLens, width: testLens.width + 33 }, testPhysics);

    const rematerialized = generateLensMap(oldestLens, testPhysics);

    expect(rematerialized).not.toBe(oldest);
    expect(Array.from(rematerialized.data)).toEqual(Array.from(oldest.data));
  });
});
