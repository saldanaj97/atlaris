/**
 * Local stand-in for the Vercel-build-only `@vercel/flags-definitions` package.
 * `@vercel/flags-core` optional-imports it; missing files are a valid fallback.
 * See https://github.com/vercel/flags/issues/384
 */
export function get(_sdkKey: string): Record<string, unknown> | null {
  return null;
}
