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

  for (const locale of localeCandidates) {
    try {
      const [supportedLocale] = Intl.DateTimeFormat.supportedLocalesOf([
        locale,
      ]);
      if (supportedLocale) {
        return supportedLocale;
      }
    } catch {
      // Ignore malformed BCP-47 tags from untrusted Accept-Language headers.
    }
  }

  return undefined;
}
