import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge<'type-role'>({
  extend: {
    classGroups: {
      'type-role': [
        {
          type: [
            'display',
            'display-compact',
            'display-section',
            'title-hero',
            'title',
            'title-compact',
            'section',
            'card',
            'reading',
            'body',
            'label',
            'input',
            'meta',
            'eyebrow',
            'code',
          ],
        },
      ],
    },
    conflictingClassGroups: {
      'type-role': [
        'font-size',
        'leading',
        'tracking',
        'font-weight',
        'font-family',
        'text-transform',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
