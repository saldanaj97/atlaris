import { describe, it, expect } from 'vitest';
import {
  computeJobPriority,
  isPriorityTopic,
  PRIORITY_TOPICS,
} from '@/lib/queue/priority';

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

describe('isPriorityTopic', () => {
  it('matches exact priority topics', () => {
    expect(isPriorityTopic('interview prep')).toBe(true);
    expect(isPriorityTopic('AI ENGINEERING')).toBe(true); // case insensitive
    expect(isPriorityTopic('machine learning')).toBe(true);
  });

  it('does not match non-priority topics', () => {
    expect(isPriorityTopic('random topic')).toBe(false);
    expect(isPriorityTopic('')).toBe(false);
  });

  it('prevents substring false positives with word boundaries', () => {
    // These should NOT match due to word boundaries
    expect(isPriorityTopic('hair engineering')).toBe(false); // contains "ai" but not "ai engineering"
    expect(isPriorityTopic('data structure algorithms')).toBe(false); // "structure" != "structures"
    expect(isPriorityTopic('preparing for interview')).toBe(false); // contains "interview" but not "interview prep"
  });

  it('matches multi-word phrases correctly', () => {
    expect(isPriorityTopic('I want to learn ai engineering')).toBe(true);
    expect(isPriorityTopic('machine learning is cool')).toBe(true);
    expect(isPriorityTopic('data structures and algorithms')).toBe(true);
  });
});
