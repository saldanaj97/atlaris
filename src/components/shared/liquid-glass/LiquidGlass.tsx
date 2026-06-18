'use client';

import type { LiquidGlassProps } from './types';

import { generateLensMap, getLensMapDataUrl } from './generate-lens-map';
import {
  buildMapSignature,
  computeEffectiveLens,
  specularLightPosition,
} from './liquid-glass-utils';
import { resolveLiquidGlassPhysics } from './types';
import { useLiquidGlassRuntime } from './use-liquid-glass-runtime';
import { cn } from '@/lib/utils';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

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
  const baseFilterId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredSize, setMeasuredSize] = useState({
    width: lens.width,
    height: lens.height,
  });
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

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node || (lens.width > 0 && lens.height > 0)) return;

    const { width, height } = node.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;

    setMeasuredSize({
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    });
  }, [lens.width, lens.height]);

  useEffect(() => {
    const node = containerRef.current;
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
      setMeasuredSize({
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
      });
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [lens.height, lens.width]);

  const displacementMapUrl = mapResult ? getLensMapDataUrl(mapResult) : '';

  const useStaticFallback =
    !isMounted ||
    prefersReducedMotion ||
    !isSupported ||
    !displacementMapUrl ||
    awaitingMeasurement;

  const filterId = `${baseFilterId}-liquid-glass-${mapSignature.replace(/:/g, '-')}`;
  const filterStyle: CSSProperties | undefined = useStaticFallback
    ? undefined
    : { filter: `url(#${filterId})` };

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

  return (
    <>
      {isMounted && !useStaticFallback ? (
        <svg
          aria-hidden='true'
          className='pointer-events-none absolute h-0 w-0 overflow-hidden'
          focusable='false'
        >
          <defs>
            <filter
              id={filterId}
              filterUnits='userSpaceOnUse'
              x='0'
              y='0'
              width={effectiveLens.width}
              height={effectiveLens.height}
              colorInterpolationFilters='sRGB'
            >
              <feImage
                href={displacementMapUrl}
                x='0'
                y='0'
                width={effectiveLens.width}
                height={effectiveLens.height}
                preserveAspectRatio='none'
                result='displacementMap'
              />
              <feDisplacementMap
                in='SourceGraphic'
                in2='displacementMap'
                scale={displacementScale}
                xChannelSelector='R'
                yChannelSelector='G'
                result='displaced'
              />

              {chromaOffset > 0 ? (
                <>
                  <feOffset
                    in='displaced'
                    dx={chromaOffset}
                    dy={0}
                    result='shiftedRed'
                  />
                  <feOffset
                    in='displaced'
                    dx={-chromaOffset}
                    dy={0}
                    result='shiftedBlue'
                  />
                  <feColorMatrix
                    in='shiftedRed'
                    type='matrix'
                    values='1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'
                    result='redChannel'
                  />
                  <feColorMatrix
                    in='displaced'
                    type='matrix'
                    values='0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'
                    result='greenChannel'
                  />
                  <feColorMatrix
                    in='shiftedBlue'
                    type='matrix'
                    values='0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'
                    result='blueChannel'
                  />
                  <feBlend
                    in='redChannel'
                    in2='greenChannel'
                    mode='screen'
                    result='rg'
                  />
                  <feBlend
                    in='rg'
                    in2='blueChannel'
                    mode='screen'
                    result='chroma'
                  />
                </>
              ) : (
                <feMerge result='chroma'>
                  <feMergeNode in='displaced' />
                </feMerge>
              )}

              {edgeHighlight > 0 ? (
                <>
                  <feMorphology
                    in='SourceAlpha'
                    operator='dilate'
                    radius={1}
                    result='edgeMask'
                  />
                  <feGaussianBlur
                    in='edgeMask'
                    stdDeviation={edgeHighlight * 2}
                    result='edgeBlur'
                  />
                  <feComponentTransfer in='edgeBlur' result='edgeGlow'>
                    <feFuncA
                      type='linear'
                      slope={edgeHighlight}
                      intercept={0}
                    />
                  </feComponentTransfer>
                  <feBlend
                    in='chroma'
                    in2='edgeGlow'
                    mode='screen'
                    result='highlighted'
                  />
                </>
              ) : (
                <feMerge result='highlighted'>
                  <feMergeNode in='chroma' />
                </feMerge>
              )}

              {edgeHighlight > 0 ? (
                <feSpecularLighting
                  in='SourceAlpha'
                  surfaceScale={edgeHighlight * 4}
                  specularConstant={0.75}
                  specularExponent={20}
                  lightingColor='white'
                  result='specular'
                >
                  <fePointLight x={light.x} y={light.y} z={light.z} />
                </feSpecularLighting>
              ) : null}

              <feMerge>
                <feMergeNode in='highlighted' />
                {edgeHighlight > 0 ? <feMergeNode in='specular' /> : null}
              </feMerge>
            </filter>
          </defs>
        </svg>
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
