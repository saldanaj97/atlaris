import React from 'react';

export function PaperScribbleDesignSystem() {
  return (
    <svg
      className="pointer-events-none absolute hidden h-0 w-0"
      aria-hidden="true"
    >
      <defs>
        <filter id="scribble">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05"
            numOctaves="2"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="2"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
