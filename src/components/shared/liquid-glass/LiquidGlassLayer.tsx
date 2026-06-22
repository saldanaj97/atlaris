'use client';

import type { LiquidGlassLayerProps } from './types';

import { LiquidGlassDisplacementFilter } from './LiquidGlassDisplacementFilter';
import {
  useLiquidGlassElementRef,
  useLiquidGlassFilterPipeline,
  useLiquidGlassMeasurement,
} from './use-liquid-glass-filter-pipeline';
import { cn } from '@/lib/utils';
import { type CSSProperties } from 'react';

/**
 * Decorative glass layer without children — use when interactive content sits in a sibling above the filter.
 */
export function LiquidGlassLayer({
  lens,
  physics,
  className,
  fallbackClassName,
  intensity = 'default',
}: LiquidGlassLayerProps) {
  const layerRef = useLiquidGlassElementRef<HTMLDivElement>();
  const measuredSize = useLiquidGlassMeasurement(layerRef, lens);
  const {
    isMounted,
    useStaticFallback,
    filterId,
    effectiveLens,
    displacementMapUrl,
    chromaOffset,
    displacementScale,
    edgeHighlight,
    light,
  } = useLiquidGlassFilterPipeline({
    lens,
    intensity,
    physics,
    filterIdPrefix: 'liquid-glass-layer',
    measuredSize,
  });

  const borderRadiusPx = effectiveLens.borderRadius;
  const roundedClipStyle: Pick<
    CSSProperties,
    'borderRadius' | 'clipPath' | 'contain'
  > = {
    borderRadius: borderRadiusPx,
    clipPath: `inset(0 round ${borderRadiusPx}px)`,
    contain: 'paint',
  };
  const filterStyle: CSSProperties | undefined = useStaticFallback
    ? roundedClipStyle
    : {
        ...roundedClipStyle,
        filter: `url(#${filterId})`,
      };

  return (
    <>
      {isMounted && !useStaticFallback ? (
        <LiquidGlassDisplacementFilter
          filterId={filterId}
          effectiveLens={effectiveLens}
          displacementMapUrl={displacementMapUrl}
          displacementScale={displacementScale}
          chromaOffset={chromaOffset}
          edgeHighlight={edgeHighlight}
          light={light}
        />
      ) : null}

      <div
        ref={layerRef}
        aria-hidden='true'
        data-slot='liquid-glass-layer'
        className={cn(
          'pointer-events-none overflow-hidden',
          fallbackClassName,
          className,
        )}
        style={filterStyle}
      />
    </>
  );
}
