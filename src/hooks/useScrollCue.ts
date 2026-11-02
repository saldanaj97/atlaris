'use client';

import { useCallback } from 'react';

/**
 * Ref callback for a horizontal scroller with the `scroll-cue-x` utility. It
 * marks which edges have hidden content (`data-scroll-cue="start end"`), so
 * the cut-off side fades in every browser, whatever its scroll-timeline support.
 */
export function useScrollCue<T extends HTMLElement>() {
  return useCallback((element: T | null) => {
    if (!element) return;

    const update = () => {
      const maxScroll = element.scrollWidth - element.clientWidth;
      // Absolute, so right-to-left scrollers (negative scrollLeft) work too.
      const scrolled = Math.abs(element.scrollLeft);
      const edges = [
        scrolled > 1 ? 'start' : null,
        maxScroll - scrolled > 1 ? 'end' : null,
      ].filter(Boolean);

      if (edges.length > 0) {
        element.dataset.scrollCue = edges.join(' ');
      } else {
        delete element.dataset.scrollCue;
      }
    };

    update();
    element.addEventListener('scroll', update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);
    if (element.firstElementChild) {
      resizeObserver.observe(element.firstElementChild);
    }

    return () => {
      element.removeEventListener('scroll', update);
      resizeObserver.disconnect();
    };
  }, []);
}
