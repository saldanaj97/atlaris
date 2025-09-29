export interface TruncationResult {
  value: string | undefined;
  truncated: boolean;
  originalLength: number | undefined;
}

export function truncateToLength(
  input: string | null | undefined,
  maxLength: number
): TruncationResult {
  if (maxLength <= 0) {
    throw new Error('maxLength must be greater than zero');
  }

  if (typeof input !== 'string') {
    return { value: undefined, truncated: false, originalLength: undefined };
  }

  const originalLength = input.length;
  if (originalLength <= maxLength) {
    return { value: input, truncated: false, originalLength };
  }

  return {
    value: input.slice(0, maxLength),
    truncated: true,
    originalLength,
  };
}
