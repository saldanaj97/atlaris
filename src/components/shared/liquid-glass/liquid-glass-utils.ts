import type { LiquidGlassLens } from './types';

export const MIN_MEASURED_SIZE = 1;

export function computeEffectiveLens(
  lens: LiquidGlassLens,
  measuredSize: { width: number; height: number },
): LiquidGlassLens {
  return {
    width:
      lens.width > 0
        ? Math.round(lens.width)
        : Math.max(MIN_MEASURED_SIZE, measuredSize.width),
    height:
      lens.height > 0
        ? Math.round(lens.height)
        : Math.max(MIN_MEASURED_SIZE, measuredSize.height),
    borderRadius: Math.max(0, Math.round(lens.borderRadius)),
  };
}

export function buildMapSignature(
  effectiveLens: LiquidGlassLens,
  scale: number,
  chromaAmount: number,
): string {
  return `${effectiveLens.width}:${effectiveLens.height}:${effectiveLens.borderRadius}:${scale}:${chromaAmount}`;
}

export function lensMapToDataUrl(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }

  const imageData = context.createImageData(width, height);
  imageData.data.set(data);
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

export function specularLightPosition(
  angleDegrees: number,
  width: number,
  height: number,
): { x: number; y: number; z: number } {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: width / 2 + Math.cos(radians) * width,
    y: height / 2 + Math.sin(radians) * height,
    z: Math.max(width, height),
  };
}
