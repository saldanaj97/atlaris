import { describe, it, expect } from 'vitest';
import { computeJobPriority, PRIORITY_TOPICS } from '@/lib/queue/priority';

describe('computeJobPriority', () => {
  it('gives higher base priority to paid tiers', () => {
    expect(
      computeJobPriority({ tier: 'pro', isPriorityTopic: false })
    ).toBeGreaterThan(
      computeJobPriority({ tier: 'free', isPriorityTopic: false })
    );
  });
  it('boosts priority for priority topics', () => {
    const freeBase = computeJobPriority({
      tier: 'free',
      isPriorityTopic: false,
    });
    const freePriority = computeJobPriority({
      tier: 'free',
      isPriorityTopic: true,
    });
    expect(freePriority).toBeGreaterThan(freeBase);
  });
  it('PRIORITY_TOPICS contains non-empty list', () => {
    expect(PRIORITY_TOPICS.length).toBeGreaterThan(0);
  });
});
