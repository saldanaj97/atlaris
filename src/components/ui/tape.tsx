"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type TapeVariant = "sm" | "md" | "lg"
type TapeAngle = "straight" | "left" | "right"

type TapeProps = React.ComponentProps<"div"> & {
  variant?: TapeVariant
  angle?: TapeAngle
}

const variantDimensions: Record<TapeVariant, { width: number; height: number }> =
  {
    sm: { width: 64, height: 16 },
    md: { width: 96, height: 28 },
    lg: { width: 96, height: 40 },
  }

const angleClasses: Record<TapeAngle, string> = {
  straight: "",
  left: "-rotate-6",
  right: "rotate-6",
}

// Seeded random number generator for consistent shapes per instance
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
}

// Generate the SVG path for tape with jagged/torn edges
function generateTapePath(
  width: number,
  height: number,
  seed: number,
): string {
  const random = seededRandom(seed)
  const jagDepth = 3
  const leftOffset = jagDepth + 1
  const rightOffset = width - jagDepth - 1

  // More segments for finer, more realistic torn edges
  const segmentHeight = 3
  const numSegments = Math.floor(height / segmentHeight)

  // Start at top-left
  let path = `M ${leftOffset + (random() - 0.5) * 2} 0`

  // Top edge (slight wobble)
  const topMidX = width / 2
  path += ` Q ${topMidX} ${random() * 0.5}, ${rightOffset + (random() - 0.5) * 2} 0`

  // Right edge (jagged going down) - torn tape effect
  for (let i = 1; i <= numSegments; i++) {
    const y = (i / numSegments) * height
    // Alternate in/out with varying depths for natural torn look
    const baseJag = i % 2 === 0 ? jagDepth * 0.7 : -jagDepth * 0.5
    const variation = (random() - 0.5) * jagDepth * 0.8
    const jag = baseJag + variation
    path += ` L ${rightOffset + jag} ${y}`
  }

  // Bottom edge (slight wobble)
  const bottomMidX = width / 2
  path += ` Q ${bottomMidX} ${height + random() * 0.5}, ${leftOffset + (random() - 0.5) * 2} ${height}`

  // Left edge (jagged going up) - torn tape effect
  for (let i = numSegments - 1; i >= 0; i--) {
    const y = (i / numSegments) * height
    // Alternate in/out with varying depths
    const baseJag = i % 2 === 0 ? -jagDepth * 0.6 : jagDepth * 0.5
    const variation = (random() - 0.5) * jagDepth * 0.8
    const jag = baseJag + variation
    path += ` L ${leftOffset + jag} ${y}`
  }

  path += " Z"
  return path
}

export function Tape({
  className,
  variant = "md",
  angle = "straight",
  ...props
}: TapeProps) {
  const { width, height } = variantDimensions[variant]

  // Generate seed only on client to avoid hydration mismatch
  const [seed, setSeed] = React.useState<number | null>(null)

  React.useEffect(() => {
    setSeed(Math.floor(Math.random() * 10000))
  }, [])

  // Generate path only when we have a seed (client-side)
  const tapePath = React.useMemo(() => {
    if (seed === null) {
      // Simple rectangle fallback for SSR
      return `M 4 0 L ${width - 4} 0 L ${width - 4} ${height} L 4 ${height} Z`
    }
    return generateTapePath(width, height, seed)
  }, [width, height, seed])

  const uniqueId = React.useId()
  const noiseFilterId = `tape-noise-${uniqueId}`
  const fiberPatternId = `tape-fiber-${uniqueId}`

  // Use a fixed seed for SSR, then client seed for filters
  const filterSeed = seed ?? 1

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative inline-block pointer-events-none",
        angleClasses[angle],
        className,
      )}
      style={{ width, height }}
      {...props}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0"
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.22))" }}
      >
        <defs>
          {/* Noise filter for paper/fiber texture */}
          <filter
            id={noiseFilterId}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.7 0.9"
              numOctaves="4"
              result="noise"
              seed={filterSeed}
            />
            <feColorMatrix
              type="matrix"
              values="0.3 0 0 0 0.1
                      0 0.3 0 0 0.08
                      0 0 0.3 0 0.05
                      0 0 0 0.15 0"
              in="noise"
              result="coloredNoise"
            />
            <feBlend in="SourceGraphic" in2="coloredNoise" mode="multiply" result="blended" />
            {/* Clip to source shape to prevent rectangular overflow */}
            <feComposite in="blended" in2="SourceAlpha" operator="in" />
          </filter>

          {/* Fiber-like streaks pattern */}
          <filter id={fiberPatternId} x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.02 0.4"
              numOctaves="2"
              seed={filterSeed + 1}
              result="fibers"
            />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 0.08 0"
              in="fibers"
              result="coloredFibers"
            />
            {/* Clip to source shape */}
            <feComposite in="coloredFibers" in2="SourceAlpha" operator="in" />
          </filter>
        </defs>

        {/* Main tape body with base color */}
        <path
          d={tapePath}
          fill="var(--color-tape, rgb(215, 205, 180))"
          opacity=".3"
        />

        {/* Noise texture layer */}
        <path
          d={tapePath}
          fill="var(--color-tape, rgb(215, 205, 180))"
          filter={`url(#${noiseFilterId})`}
          opacity=".6"
        />

        {/* Fiber streaks overlay */}
        <path
          d={tapePath}
          fill="rgba(180, 170, 150, 0.8)"
          filter={`url(#${fiberPatternId})`}
          style={{ mixBlendMode: "multiply" }}
        />

        {/* Very subtle edge definition */}
        <path
          d={tapePath}
          fill="none"
          stroke="rgba(0,0,0,0.1)"
          strokeWidth="0.5"
        />
      </svg>
    </div>
  )
}
