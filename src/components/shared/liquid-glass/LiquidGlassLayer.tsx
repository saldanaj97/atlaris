'use client';

import type { LiquidGlassLayerProps } from './types';

import { generateLensMap } from './generate-lens-map';
import { resolveLiquidGlassPhysics } from './types';
import { cn } from '@/lib/utils';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

const MIN_MEASURED_SIZE = 1;

function supportsSvgDisplacementFilters(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  return (
    typeof SVGFEDisplacementMapElement !== 'undefined' &&
    typeof SVGFEImageElement !== 'undefined'
  );
}

function lensMapToDataUrl(
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

function specularLightPosition(
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

export function LiquidGlassLayer({
  lens,
  physics,
  className,
  fallbackClassName,
  intensity = 'default',
}: LiquidGlassLayerProps) {
  const baseFilterId = useId();
  const layerRef = useRef<HTMLDivElement>(null);
  const [filterRevision, setFilterRevision] = useState(0);
  const [measuredSize, setMeasuredSize] = useState({
    width: lens.width,
    height: lens.height,
  });
  const [isMounted, setIsMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  const resolvedPhysics = resolveLiquidGlassPhysics(intensity, physics);

  const effectiveLens = useMemo(
    () => ({
      width:
        lens.width > 0
          ? Math.round(lens.width)
          : Math.max(MIN_MEASURED_SIZE, measuredSize.width),
      height:
        lens.height > 0
          ? Math.round(lens.height)
          : Math.max(MIN_MEASURED_SIZE, measuredSize.height),
      borderRadius: Math.max(0, Math.round(lens.borderRadius)),
    }),
    [
      lens.borderRadius,
      lens.height,
      lens.width,
      measuredSize.height,
      measuredSize.width,
    ],
  );

  const mapResult = useMemo(
    () => generateLensMap(effectiveLens, resolvedPhysics),
    [effectiveLens, resolvedPhysics],
  );

  const mapSignature = useMemo(
    () =>
      `${effectiveLens.width}:${effectiveLens.height}:${effectiveLens.borderRadius}:${mapResult.scale}:${mapResult.chromaAmount}`,
    [
      effectiveLens.borderRadius,
      effectiveLens.height,
      effectiveLens.width,
      mapResult.chromaAmount,
      mapResult.scale,
    ],
  );

  useEffect(() => {
    setIsMounted(true);
    setIsSupported(supportsSvgDisplacementFilters());

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncReducedMotion = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    syncReducedMotion();
    mediaQuery.addEventListener('change', syncReducedMotion);

    return () => {
      mediaQuery.removeEventListener('change', syncReducedMotion);
    };
  }, []);

  useEffect(() => {
    const node = layerRef.current;
    if (!node || (lens.width > 0 && lens.height > 0)) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;
      setMeasuredSize({
        width: Math.max(MIN_MEASURED_SIZE, Math.round(width)),
        height: Math.max(MIN_MEASURED_SIZE, Math.round(height)),
      });
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [lens.height, lens.width]);

  useEffect(() => {
    setFilterRevision((revision) => revision + 1);
  }, [mapSignature]);

  const displacementMapUrl = useMemo(() => {
    if (!isMounted || prefersReducedMotion || !isSupported) {
      return '';
    }

    return lensMapToDataUrl(mapResult.data, mapResult.width, mapResult.height);
  }, [
    isMounted,
    isSupported,
    mapResult.data,
    mapResult.height,
    mapResult.width,
    prefersReducedMotion,
  ]);

  const useStaticFallback =
    !isMounted || prefersReducedMotion || !isSupported || !displacementMapUrl;

  const filterId = `${baseFilterId}-liquid-glass-layer-${filterRevision}`;
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

  const chromaOffset = mapResult.chromaAmount;
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
                scale={mapResult.scale}
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
