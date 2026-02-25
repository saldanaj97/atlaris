import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Exhaustive check helper for discriminated unions.
 * Passing a value of type `never` ensures all cases are handled at compile time.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
