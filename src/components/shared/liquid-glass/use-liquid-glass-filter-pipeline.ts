'use client';

import type {
  LiquidGlassLens,
  LiquidGlassPhysics,
  LiquidGlassProps,
} from './types';

import { generateLensMap, getLensMapDataUrl } from './generate-lens-map';
import {
  buildMapSignature,
  computeEffectiveLens,
  specularLightPosition,
} from './liquid-glass-utils';
import { resolveLiquidGlassPhysics } from './types';
import { useLiquidGlassRuntime } from './use-liquid-glass-runtime';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

type MeasuredSize = {
  width: number;
  height: number;
};

function getRoundedMeasuredSize(width: number, height: number): MeasuredSize {
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function useLiquidGlassMeasurement(
  elementRef: RefObject<HTMLElement | null>,
  lens: LiquidGlassLens,
): MeasuredSize {
  const [measuredSize, setMeasuredSize] = useState<MeasuredSize>({
    width: lens.width,
    height: lens.height,
  });

  useLayoutEffect(() => {
    const node = elementRef.current;
    if (!node || (lens.width > 0 && lens.height > 0)) return;

    const { width, height } = node.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    const nextMeasuredSize = getRoundedMeasuredSize(width, height);
    setMeasuredSize((currentMeasuredSize) =>
      currentMeasuredSize.width === nextMeasuredSize.width &&
      currentMeasuredSize.height === nextMeasuredSize.height
        ? currentMeasuredSize
        : nextMeasuredSize,
    );
  }, [elementRef, lens.width, lens.height]);

  useEffect(() => {
    const node = elementRef.current;
    if (
      !node ||
      typeof ResizeObserver === 'undefined' ||
      (lens.width > 0 && lens.height > 0)
    ) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;
      const nextMeasuredSize = getRoundedMeasuredSize(width, height);
      setMeasuredSize((currentMeasuredSize) =>
        currentMeasuredSize.width === nextMeasuredSize.width &&
        currentMeasuredSize.height === nextMeasuredSize.height
          ? currentMeasuredSize
          : nextMeasuredSize,
      );
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [elementRef, lens.height, lens.width]);

  return measuredSize;
}

type LiquidGlassFilterPipelineArgs = {
  lens: LiquidGlassLens;
  intensity: NonNullable<LiquidGlassProps['intensity']>;
  physics?: Partial<LiquidGlassPhysics>;
  filterIdPrefix: string;
  measuredSize: MeasuredSize;
};

export function useLiquidGlassFilterPipeline({
  lens,
  intensity,
  physics,
  filterIdPrefix,
  measuredSize,
}: LiquidGlassFilterPipelineArgs) {
  const baseFilterId = useId();
  const { isMounted, isSupported, prefersReducedMotion } =
    useLiquidGlassRuntime();

  const resolvedPhysics = resolveLiquidGlassPhysics(intensity, physics);
  const awaitingMeasurement =
    (lens.width === 0 || lens.height === 0) &&
    (measuredSize.width === 0 || measuredSize.height === 0);
  const effectiveLens = computeEffectiveLens(lens, measuredSize);
  const shouldUseDynamicFilter =
    isMounted && !prefersReducedMotion && isSupported && !awaitingMeasurement;
  const mapResult = shouldUseDynamicFilter
    ? generateLensMap(effectiveLens, resolvedPhysics)
    : null;
  const mapSignature = mapResult
    ? buildMapSignature(effectiveLens, mapResult.scale, mapResult.chromaAmount)
    : '';
  const displacementMapUrl = mapResult ? getLensMapDataUrl(mapResult) : '';
  const useStaticFallback =
    !isMounted ||
    prefersReducedMotion ||
    !isSupported ||
    !displacementMapUrl ||
    awaitingMeasurement;
  const filterId = `${baseFilterId}-${filterIdPrefix}-${mapSignature.replace(/:/g, '-')}`;
  const chromaOffset =
    mapResult?.chromaAmount ??
    Math.max(0, resolvedPhysics.chroma * resolvedPhysics.scale * 0.35);
  const displacementScale = mapResult?.scale ?? resolvedPhysics.scale;
  const edgeHighlight = resolvedPhysics.edgeHighlight ?? 0;
  const specularAngle = resolvedPhysics.specularAngle ?? 135;
  const light = specularLightPosition(
    specularAngle,
    effectiveLens.width,
    effectiveLens.height,
  );

  return {
    isMounted,
    useStaticFallback,
    filterId,
    effectiveLens,
    displacementMapUrl,
    chromaOffset,
    displacementScale,
    edgeHighlight,
    light,
  };
}

export function useLiquidGlassElementRef<T extends HTMLElement>() {
  return useRef<T>(null);
}
