'use client';

import type { LiquidGlassProps } from './types';

import { LiquidGlassDisplacementFilter } from './LiquidGlassDisplacementFilter';
import {
  useLiquidGlassElementRef,
  useLiquidGlassFilterPipeline,
  useLiquidGlassMeasurement,
} from './use-liquid-glass-filter-pipeline';
import { cn } from '@/lib/utils';
import { type CSSProperties } from 'react';

/**
 * Wraps children with an SVG displacement filter for a liquid-glass lens effect.
 * Falls back to static glassmorphism when filters, motion preferences, or sizing are unavailable.
 */
export function LiquidGlass({
  lens,
  physics,
  className,
  fallbackClassName,
  children,
  intensity = 'default',
}: LiquidGlassProps) {
  const containerRef = useLiquidGlassElementRef<HTMLDivElement>();
  const measuredSize = useLiquidGlassMeasurement(containerRef, lens);
  const {
    isMounted,
    useStaticFallback,
    filterId,
    displacementMapUrl,
    effectiveLens,
    chromaOffset,
    displacementScale,
    edgeHighlight,
    light,
  } = useLiquidGlassFilterPipeline({
    lens,
    intensity,
    physics,
    filterIdPrefix: 'liquid-glass',
    measuredSize,
  });

  const filterStyle: CSSProperties | undefined = useStaticFallback
    ? undefined
    : { filter: `url(#${filterId})` };

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
        ref={containerRef}
        data-slot='liquid-glass'
        className={cn('relative isolate overflow-hidden', className)}
      >
        <div
          aria-hidden='true'
          className={cn(
            'pointer-events-none absolute inset-0 -z-10',
            fallbackClassName,
          )}
          style={filterStyle}
        />
        {children}
      </div>
    </>
  );
}
