const FEATURE_WORD_SEPARATOR = /[^a-z0-9]+/;
const SHARED_CAPABILITY_PREFIX_WORDS = 2;
const FILLER_FEATURE_WORDS = new Set(['access']);

function featureWords(label: string): string[] {
  return label
    .toLocaleLowerCase()
    .split(FEATURE_WORD_SEPARATOR)
    .filter(Boolean);
}

/** True when the plan feature is the same capability or a richer variant of the row. */
function planFeatureCoversRow(planLabel: string, rowKey: string): boolean {
  const planWords = featureWords(planLabel);
  const rowWords = featureWords(rowKey);
  const sharedLimit = Math.min(planWords.length, rowWords.length);
  let shared = 0;

  for (let index = 0; index < sharedLimit; index += 1) {
    if (planWords[index] !== rowWords[index]) break;
    shared += 1;
  }

  if (shared < SHARED_CAPABILITY_PREFIX_WORDS) {
    return false;
  }

  return rowWords.slice(shared).every((word) => FILLER_FEATURE_WORDS.has(word));
}

export function planListsFeature(
  plan: { features: readonly string[] },
  featureKey: string,
): boolean {
  return plan.features.some((feature) => {
    const label = feature.trim();
    if (!label) return false;
    if (label.toLocaleLowerCase() === featureKey) return true;
    return planFeatureCoversRow(label, featureKey);
  });
}
