'use client';

import { useCallback } from 'react';

export function useScrollCue<T extends HTMLElement>() {
  return useCallback((element: T | null) => {
    if (!element) return;

    const update = () => {
      const maxScroll = element.scrollWidth - element.clientWidth;
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
