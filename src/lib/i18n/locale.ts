/**
 * Resolves the first Accept-Language tag supported by Intl.DateTimeFormat.
 */
export function getSupportedLocale(
  acceptLanguage: string | null,
): string | undefined {
  if (!acceptLanguage) {
    return undefined;
  }

  const localeCandidates = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0]?.trim())
    .filter((part): part is string => Boolean(part) && part !== '*');

  return Intl.DateTimeFormat.supportedLocalesOf(localeCandidates)[0];
}
