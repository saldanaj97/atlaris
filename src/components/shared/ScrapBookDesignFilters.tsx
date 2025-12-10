export function ScrapbookDesignFilters() {
  return (
    <svg
      className="pointer-events-none absolute hidden h-0 w-0"
      aria-hidden="true"
    >
      <defs>
        {/* Original scribble filter for subtle hand-drawn effect */}
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

        {/* Marker bleed filter for highlighter - simulates ink bleeding into paper fibers */}
        <filter id="marker-bleed" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves="3"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Heavy sketch filter - more pronounced hand-drawn borders */}
        {/* <filter id="sketch" x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence
            type="turbulence"
            baseFrequency="0.015"
            numOctaves="3"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter> */}

        {/* Torn paper edge filter - creates fibrous, rough edges (single seed) */}
        {/* <filter id="torn-edge" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.06"
            numOctaves="4"
            seed="3"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="12"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter> */}

        {/* Torn paper edge filters - multiple seeds for varied edge shapes */}
        {/* Creates natural-looking torn edges with soft fibrous blending */}
        {[1, 7, 19, 42].map((seed) => (
          <filter
            key={seed}
            id={`torn-edge-${seed}`}
            x="-8%"
            y="-8%"
            width="116%"
            height="116%"
          >
            {/* Generate noise for irregular tear pattern */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.02"
              numOctaves="4"
              seed={seed}
              result="noise"
            />
            {/* Displace edges to create torn effect */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="24"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            {/* Create expanded edge for fiber effect */}
            <feMorphology
              in="displaced"
              operator="dilate"
              radius="1.5"
              result="expanded"
            />
            {/* Blur the expanded edge to create soft fibers */}
            <feGaussianBlur in="expanded" stdDeviation="2" result="fibers" />
            {/* Make the fiber layer white/off-white */}
            <feFlood floodColor="#f8f8f6" floodOpacity="0.85" result="white" />
            <feComposite
              in="white"
              in2="fibers"
              operator="in"
              result="coloredFibers"
            />
            {/* Stack: fibers underneath, then the crisp displaced paper on top */}
            <feMerge>
              <feMergeNode in="coloredFibers" />
              <feMergeNode in="displaced" />
            </feMerge>
          </filter>
        ))}
      </defs>
    </svg>
  );
}
