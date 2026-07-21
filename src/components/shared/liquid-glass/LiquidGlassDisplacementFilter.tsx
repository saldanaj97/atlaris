'use client';

import type { LiquidGlassLens } from './types';

type LiquidGlassDisplacementFilterProps = {
  filterId: string;
  effectiveLens: LiquidGlassLens;
  displacementMapUrl: string;
  displacementScale: number;
  chromaOffset: number;
  edgeHighlight: number;
  light: { x: number; y: number; z: number };
};

export function LiquidGlassDisplacementFilter({
  filterId,
  effectiveLens,
  displacementMapUrl,
  displacementScale,
  chromaOffset,
  edgeHighlight,
  light,
}: LiquidGlassDisplacementFilterProps) {
  return (
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
              {/*
                Warm peach/plum fringe (After Hours): red vs amber (R+G),
                not red vs blue — classic R/B chroma reads Progress Jam violet.
              */}
              <feOffset
                in='displaced'
                dx={chromaOffset}
                dy={0}
                result='shiftedWarm'
              />
              <feOffset
                in='displaced'
                dx={-chromaOffset}
                dy={0}
                result='shiftedPeach'
              />
              <feColorMatrix
                in='shiftedWarm'
                type='matrix'
                values='1 0 0 0 0  0 0.35 0 0 0  0 0 0 0 0  0 0 0 1 0'
                result='warmChannel'
              />
              <feColorMatrix
                in='displaced'
                type='matrix'
                values='0.15 0 0 0 0  0 0.55 0 0 0  0 0 0.2 0 0  0 0 0 1 0'
                result='midChannel'
              />
              <feColorMatrix
                in='shiftedPeach'
                type='matrix'
                values='1 0 0 0 0  0 0.65 0 0 0  0 0 0.15 0 0  0 0 0 1 0'
                result='peachChannel'
              />
              <feBlend
                in='warmChannel'
                in2='midChannel'
                mode='screen'
                result='wm'
              />
              <feBlend
                in='wm'
                in2='peachChannel'
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
                <feFuncA type='linear' slope={edgeHighlight} intercept={0} />
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
              lightingColor='var(--primary)'
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
  );
}
