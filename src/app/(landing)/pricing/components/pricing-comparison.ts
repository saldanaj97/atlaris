const FEATURE_WORD_SEPARATOR = /[^a-z0-9]+/;
const SHARED_CAPABILITY_PREFIX_WORDS = 2;

function featureWords(label: string): string[] {
  return label
    .toLocaleLowerCase()
    .split(FEATURE_WORD_SEPARATOR)
    .filter(Boolean);
}

function featuresShareCapabilityPrefix(left: string, right: string): boolean {
  const leftWords = featureWords(left);
  const rightWords = featureWords(right);
  const sharedLimit = Math.min(leftWords.length, rightWords.length);
  let shared = 0;

  for (let index = 0; index < sharedLimit; index += 1) {
    if (leftWords[index] !== rightWords[index]) break;
    shared += 1;
  }

  return shared >= SHARED_CAPABILITY_PREFIX_WORDS;
}

export function planListsFeature(
  plan: { features: readonly string[] },
  featureKey: string,
): boolean {
  return plan.features.some((feature) => {
    const label = feature.trim();
    if (!label) return false;
    if (label.toLocaleLowerCase() === featureKey) return true;
    return featuresShareCapabilityPrefix(label, featureKey);
  });
}
