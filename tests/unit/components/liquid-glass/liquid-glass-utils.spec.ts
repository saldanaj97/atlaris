import {
  buildMapSignature,
  computeEffectiveLens,
  lensMapToDataUrl,
  MIN_MEASURED_SIZE,
  specularLightPosition,
} from '@/components/shared/liquid-glass/liquid-glass-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('computeEffectiveLens', () => {
  it('uses explicit lens dimensions when width and height are positive', () => {
    expect(
      computeEffectiveLens(
        { width: 120.6, height: 48.4, borderRadius: 8.2 },
        { width: 200, height: 100 },
      ),
    ).toEqual({ width: 121, height: 48, borderRadius: 8 });
  });

  it('falls back to measured size when lens dimensions are zero', () => {
    expect(
      computeEffectiveLens(
        { width: 0, height: 0, borderRadius: 16 },
        { width: 320, height: 64 },
      ),
    ).toEqual({ width: 320, height: 64, borderRadius: 16 });
  });

  it('clamps measured dimensions to at least MIN_MEASURED_SIZE', () => {
    expect(
      computeEffectiveLens(
        { width: 0, height: 0, borderRadius: 0 },
        { width: 0, height: 0 },
      ),
    ).toEqual({
      width: MIN_MEASURED_SIZE,
      height: MIN_MEASURED_SIZE,
      borderRadius: 0,
    });
  });
});

describe('buildMapSignature', () => {
  it('joins lens geometry and map tuning into a stable signature', () => {
    expect(
      buildMapSignature({ width: 64, height: 32, borderRadius: 12 }, 20, 1.4),
    ).toBe('64:32:12:20:1.4');
  });
});

describe('specularLightPosition', () => {
  it('derives light coordinates from angle and lens size', () => {
    const light = specularLightPosition(0, 100, 50);

    expect(light.x).toBeCloseTo(150);
    expect(light.y).toBeCloseTo(25);
    expect(light.z).toBe(100);
  });
});

describe('lensMapToDataUrl', () => {
  it('returns an empty string when canvas context is unavailable', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);

    const dataUrl = lensMapToDataUrl(new Uint8ClampedArray(4), 1, 1);

    expect(dataUrl).toBe('');
  });

  it('delegates encoding to canvas when a 2d context is available', () => {
    const canvas = document.createElement('canvas');
    const toDataURL = vi
      .fn()
      .mockReturnValue('data:image/png;base64,mock-encoded');

    vi.spyOn(canvas, 'getContext').mockReturnValue({
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    canvas.toDataURL = toDataURL;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);

    const data = new Uint8ClampedArray([255, 128, 64, 255]);
    const dataUrl = lensMapToDataUrl(data, 1, 1);

    expect(dataUrl).toBe('data:image/png;base64,mock-encoded');
    expect(toDataURL).toHaveBeenCalledOnce();
  });
});
