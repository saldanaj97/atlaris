import { useEffect, type RefObject } from 'react';

const PRICING_CARD_SELECTOR = '[data-pricing-card]';
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function resetCardParallax(card: HTMLElement): void {
  card.style.setProperty('--card-tilt-x', '0deg');
  card.style.setProperty('--card-tilt-y', '0deg');
  card.style.setProperty('--card-content-x', '0px');
  card.style.setProperty('--card-content-y', '0px');
  card.style.setProperty('--card-shine-x', '50%');
  card.style.setProperty('--card-shine-y', '50%');
  card.style.setProperty('--card-shine-opacity', '0');
}

function updateCardParallax(
  card: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  const bounds = card.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;

  const x = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1);
  const y = Math.min(Math.max((clientY - bounds.top) / bounds.height, 0), 1);
  const horizontal = x - 0.5;
  const vertical = y - 0.5;

  card.style.setProperty('--card-tilt-x', `${(-vertical * 8).toFixed(2)}deg`);
  card.style.setProperty('--card-tilt-y', `${(horizontal * 10).toFixed(2)}deg`);
  card.style.setProperty(
    '--card-content-x',
    `${(horizontal * 6).toFixed(2)}px`,
  );
  card.style.setProperty('--card-content-y', `${(vertical * 6).toFixed(2)}px`);
  card.style.setProperty('--card-shine-x', `${(x * 100).toFixed(1)}%`);
  card.style.setProperty('--card-shine-y', `${(y * 100).toFixed(1)}%`);
  card.style.setProperty('--card-shine-opacity', '1');
}

export function usePricingCardParallax(
  rootRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window.matchMedia !== 'function') return;

    const finePointer = window.matchMedia(FINE_POINTER_QUERY);
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    let activeCard: HTMLElement | null = null;
    let frameId: number | null = null;
    let pendingPointer: {
      card: HTMLElement;
      clientX: number;
      clientY: number;
    } | null = null;

    const cancelPendingFrame = () => {
      pendingPointer = null;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    };

    const resetActiveCard = () => {
      cancelPendingFrame();
      if (activeCard) resetCardParallax(activeCard);
      activeCard = null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!finePointer.matches || reducedMotion.matches) {
        resetActiveCard();
        return;
      }

      const target = event.target;
      const card =
        target instanceof Element
          ? target.closest<HTMLElement>(PRICING_CARD_SELECTOR)
          : null;

      if (!card) {
        resetActiveCard();
        return;
      }

      if (activeCard && activeCard !== card) resetCardParallax(activeCard);
      activeCard = card;
      pendingPointer = {
        card,
        clientX: event.clientX,
        clientY: event.clientY,
      };

      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        if (!pendingPointer) return;
        updateCardParallax(
          pendingPointer.card,
          pendingPointer.clientX,
          pendingPointer.clientY,
        );
        pendingPointer = null;
      });
    };

    root.addEventListener('pointermove', handlePointerMove);
    root.addEventListener('pointerleave', resetActiveCard);
    root.addEventListener('pointercancel', resetActiveCard);

    return () => {
      resetActiveCard();
      root.removeEventListener('pointermove', handlePointerMove);
      root.removeEventListener('pointerleave', resetActiveCard);
      root.removeEventListener('pointercancel', resetActiveCard);
    };
  }, [rootRef]);
}
