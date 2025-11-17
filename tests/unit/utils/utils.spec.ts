import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn (className utility)', () => {
  it('should merge multiple class names', () => {
    const result = cn('text-red-500', 'bg-blue-500');
    expect(result).toContain('text-red-500');
    expect(result).toContain('bg-blue-500');
  });

  it('should handle conditional classes with falsy values', () => {
    const result = cn('base-class', false && 'hidden-class', 'visible-class');
    expect(result).toContain('base-class');
    expect(result).toContain('visible-class');
    expect(result).not.toContain('hidden-class');
  });

  it('should handle undefined and null values', () => {
    const result = cn('base-class', undefined, null, 'other-class');
    expect(result).toContain('base-class');
    expect(result).toContain('other-class');
  });

  it('should handle empty strings', () => {
    const result = cn('base-class', '', 'other-class');
    expect(result).toContain('base-class');
    expect(result).toContain('other-class');
  });

  it('should merge conflicting Tailwind classes correctly', () => {
    // tailwind-merge should keep the last conflicting class
    const result = cn('p-4', 'p-8');
    expect(result).toBe('p-8');
  });

  it('should handle array of classes', () => {
    const result = cn(['text-sm', 'font-bold'], 'text-blue-500');
    expect(result).toContain('text-sm');
    expect(result).toContain('font-bold');
    expect(result).toContain('text-blue-500');
  });

  it('should handle object with conditional classes', () => {
    const result = cn({
      'base-class': true,
      'conditional-class': false,
      'another-class': true,
    });
    expect(result).toContain('base-class');
    expect(result).toContain('another-class');
    expect(result).not.toContain('conditional-class');
  });

  it('should handle mixed input types', () => {
    const result = cn(
      'base-class',
      ['array-class'],
      { 'object-class': true },
      undefined,
      'final-class'
    );
    expect(result).toContain('base-class');
    expect(result).toContain('array-class');
    expect(result).toContain('object-class');
    expect(result).toContain('final-class');
  });

  it('should deduplicate identical classes', () => {
    const result = cn('text-red-500', 'text-red-500');
    // Count occurrences - should only appear once
    const matches = result.match(/text-red-500/g);
    expect(matches?.length).toBe(1);
  });

  it('should handle responsive and state variants', () => {
    const result = cn('text-sm', 'md:text-lg', 'hover:text-blue-500');
    expect(result).toContain('text-sm');
    expect(result).toContain('md:text-lg');
    expect(result).toContain('hover:text-blue-500');
  });

  it('should properly override conflicting responsive classes', () => {
    const result = cn('md:p-4', 'md:p-8');
    expect(result).toBe('md:p-8');
  });

  it('should handle no arguments', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('should handle single argument', () => {
    const result = cn('single-class');
    expect(result).toBe('single-class');
  });

  it('should trim whitespace', () => {
    const result = cn('  leading-space', 'trailing-space  ', '  both-spaces  ');
    expect(result).not.toMatch(/^\s/);
    expect(result).not.toMatch(/\s$/);
  });
});
