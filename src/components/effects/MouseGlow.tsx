'use client';

import { useMouseGlow } from '@/hooks/useMouseGlow';
import { useRef } from 'react';

/** Configuration for trail segments */
const TRAIL_SEGMENTS = [4, 3, 2, 1, 0] as const;

/** Initial CSS custom properties for glow positioning */
const INITIAL_GLOW_VARS = {
  '--glow-x': '50%',
  '--glow-y': '50%',
  '--trail-x-0': '50%',
  '--trail-y-0': '50%',
  '--trail-x-1': '50%',
  '--trail-y-1': '50%',
  '--trail-x-2': '50%',
  '--trail-y-2': '50%',
  '--trail-x-3': '50%',
  '--trail-y-3': '50%',
  '--trail-x-4': '50%',
  '--trail-y-4': '50%',
} as React.CSSProperties;

interface MouseGlowContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Container component that adds a mouse-following glow effect.
 * Wraps children and tracks mouse movement within the container bounds.
 *
 * @example
 * ```tsx
 * <MouseGlowContainer className="fixed inset-0">
 *   <YourContent />
 * </MouseGlowContainer>
 * ```
 */
export function MouseGlowContainer({
  children,
  className = '',
}: MouseGlowContainerProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const { glowRef, isActive } = useMouseGlow(containerRef);

  return (
    <div ref={containerRef} className={className}>
      <MouseGlowEffect glowRef={glowRef} isActive={isActive} />
      {children}
    </div>
  );
}

interface MouseGlowEffectProps {
  glowRef: React.RefObject<HTMLDivElement | null>;
  isActive: boolean;
}

/**
 * The visual glow effect component with trailing tail.
 * Renders the main glow and trail segments using CSS custom properties.
 */
function MouseGlowEffect({
  glowRef,
  isActive,
}: MouseGlowEffectProps): React.ReactElement {
  return (
    <div
      ref={glowRef}
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
      style={INITIAL_GLOW_VARS}
      aria-hidden="true"
    >
      {/* Trail segments - rendered back to front */}
      {TRAIL_SEGMENTS.map((i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: `var(--trail-x-${i})`,
            top: `var(--trail-y-${i})`,
            width: `${500 - i * 40}px`,
            height: `${500 - i * 40}px`,
            background: `
              radial-gradient(
                circle at center,
                color-mix(in oklch, var(--primary) ${35 - i * 5}%, transparent) 0%,
                color-mix(in oklch, var(--accent) ${20 - i * 3}%, transparent) 40%,
                transparent 65%
              )
            `,
            filter: `blur(${70 + i * 10}px)`,
            opacity: isActive ? 0.85 - i * 0.1 : 0,
            transition: 'opacity 0.4s ease-out',
          }}
        />
      ))}
      {/* Main glow at cursor position */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: 'var(--glow-x)',
          top: 'var(--glow-y)',
          width: '450px',
          height: '450px',
          background: `
            radial-gradient(
              circle at center,
              color-mix(in oklch, var(--primary) 50%, transparent) 0%,
              color-mix(in oklch, var(--accent) 30%, transparent) 35%,
              transparent 60%
            )
          `,
          filter: 'blur(50px)',
          opacity: isActive ? 1 : 0,
          transition: 'opacity 0.4s ease-out',
        }}
      />
    </div>
  );
}
