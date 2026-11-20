import { cn } from '@/lib/utils';
import { describe, expect, it } from 'vitest';

describe('cn (className utility)', () => {
  it('should merge conflicting Tailwind classes correctly', () => {
    // tailwind-merge should keep the last conflicting class
    const result = cn('p-4', 'p-8');
    expect(result).toBe('p-8');
  });

  it('should let a later type role replace earlier type classes', () => {
    expect(cn('text-sm leading-6 font-medium tracking-wide', 'type-body')).toBe(
      'type-body',
    );
    expect(cn('type-body', 'type-label')).toBe('type-label');
  });

  it('should keep single-property modifiers after a type role', () => {
    expect(cn('type-meta', 'font-medium')).toBe('type-meta font-medium');
    expect(cn('type-meta', 'font-mono')).toBe('type-meta font-mono');
  });
});
