import { SubscriptionTier } from '../stripe/usage';
export const PRIORITY_TOPICS = [
  // seed examples; business can tune this list
  'interview prep',
  'ai engineering',
  'machine learning',
  'data structures',
] as const;

function escapeRegex(s: string): string {
  // Escape special RegExp characters: \ ^ $ * + ? . ( ) | { } [ ]
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isPriorityTopic(topic: string): boolean {
  // Split topic into tokens by common delimiters, trim, lowercase
  const tokens = topic
    .toLowerCase()
    .split(/[\s,\/\-_]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  // Check for exact match of any PRIORITY_TOPICS
  if (PRIORITY_TOPICS.some((t) => tokens.includes(t))) {
    return true;
  }

  // Additionally, allow whole-word match as alternative (covers phrases)
  const lower = topic.trim().toLowerCase();
  return PRIORITY_TOPICS.some((t) => {
    const re = new RegExp(`\\b${escapeRegex(t)}\\b`, 'i');
    return re.test(lower);
  });
}

export function computeJobPriority(params: {
  tier: SubscriptionTier;
  isPriorityTopic: boolean;
}): number {
  const tierPriorities: Record<SubscriptionTier, number> = {
    free: 1,
    starter: 5,
    pro: 10,
  };
  const base = tierPriorities[params.tier];
  if (base === undefined) {
    throw new Error(`Invalid tier: ${params.tier}`);
  }
  const topicBoost = params.isPriorityTopic ? 3 : 0;
  return base + topicBoost;
}
