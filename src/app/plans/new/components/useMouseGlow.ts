'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook for smooth mouse glow effect with trailing tail.
 * Uses CSS custom properties for GPU-accelerated animations.
 * The tail trails behind the cursor movement direction.
 *
 * @param containerRef - Ref to the container element to track mouse movement within
 * @returns glowRef - Ref to attach to the glow container element
 * @returns isActive - Whether the mouse is currently within the container
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { glowRef, isActive } = useMouseGlow(containerRef);
 *
 * return (
 *   <div ref={containerRef}>
 *     <div ref={glowRef} style={{ opacity: isActive ? 1 : 0 }}>
 *       // Glow elements using CSS vars: --glow-x, --glow-y, --trail-x-0, etc.
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useMouseGlow(
  containerRef: React.RefObject<HTMLDivElement | null>
): { glowRef: React.RefObject<HTMLDivElement | null>; isActive: boolean } {
  const [isActive, setIsActive] = useState(false);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const glow = glowRef.current;
    if (!container || !glow) return;

    let animationId: number | null = null;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    // Trail positions - each one follows the previous with delay
    const trailCount = 5;
    const trailPositions = Array.from({ length: trailCount }, () => ({
      x: 0,
      y: 0,
    }));

    const animate = () => {
      // Main glow follows cursor
      currentX += (targetX - currentX) * 0.15;
      currentY += (targetY - currentY) * 0.15;

      // Each trail segment follows the one ahead of it with tighter following
      trailPositions[0].x += (currentX - trailPositions[0].x) * 0.12;
      trailPositions[0].y += (currentY - trailPositions[0].y) * 0.12;

      for (let i = 1; i < trailCount; i++) {
        // Tighter follow speeds so segments stay connected
        const followSpeed = 0.1 - i * 0.015;
        trailPositions[i].x +=
          (trailPositions[i - 1].x - trailPositions[i].x) * followSpeed;
        trailPositions[i].y +=
          (trailPositions[i - 1].y - trailPositions[i].y) * followSpeed;
      }

      // Set CSS variables
      glow.style.setProperty('--glow-x', `${currentX}px`);
      glow.style.setProperty('--glow-y', `${currentY}px`);

      for (let i = 0; i < trailCount; i++) {
        glow.style.setProperty('--trail-x-' + i, `${trailPositions[i].x}px`);
        glow.style.setProperty('--trail-y-' + i, `${trailPositions[i].y}px`);
      }

      animationId = requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      targetX = e.clientX - rect.left;
      targetY = e.clientY - rect.top;
    };

    const handleMouseEnter = () => setIsActive(true);
    const handleMouseLeave = () => setIsActive(false);

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    animationId = requestAnimationFrame(animate);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [containerRef]);

  return { glowRef, isActive };
}
