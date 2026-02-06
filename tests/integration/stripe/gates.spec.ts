import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { ensureUser, truncateAll } from '@/../tests/helpers/db';
import { setTestUser } from '@/../tests/helpers/auth';
import { db } from '@/lib/db/service-role';
import { learningPlans, usageMetrics, users } from '@/lib/db/schema';
import {
  requireSubscription,
  checkFeatureLimit,
  hasSubscriptionTier,
  canUseFeature,
} from '@/lib/api/gates';

describe('Gating Middleware', () => {
  beforeEach(async () => {
    await truncateAll();
    vi.clearAllMocks();
  });

  describe('requireSubscription', () => {
    it('allows access for user with sufficient tier', async () => {
      const userId = await ensureUser({
        authUserId: 'user_has_starter',
        email: 'has.starter@example.com',
      });

      // Upgrade to starter
      await db
        .update(users)
        .set({ subscriptionTier: 'starter' })
        .where(sql`id = ${userId}`);

      setTestUser('user_has_starter');

      const middleware = requireSubscription('starter');
      const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
      const handler = middleware(mockHandler);

      const response = await handler(new Request('http://localhost/test'));

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('blocks access for user with insufficient tier', async () => {
      await ensureUser({
        authUserId: 'user_only_free',
        email: 'only.free@example.com',
      });

      // User is free tier (default)
      setTestUser('user_only_free');

      const middleware = requireSubscription('pro');
      const mockHandler = vi.fn();
      const handler = middleware(mockHandler);

      const response = await handler(new Request('http://localhost/test'));

      expect(response.status).toBe(403);
      expect(mockHandler).not.toHaveBeenCalled();

      const body = await response.json();
      expect(body.error.code).toBe('INSUFFICIENT_SUBSCRIPTION_TIER');
      expect(body.error.details.currentTier).toBe('free');
      expect(body.error.details.requiredTier).toBe('pro');
    });

    it('allows pro tier access for starter-required endpoint', async () => {
      const userId = await ensureUser({
        authUserId: 'user_pro',
        email: 'pro@example.com',
      });

      // Upgrade to pro
      await db
        .update(users)
        .set({ subscriptionTier: 'pro' })
        .where(sql`id = ${userId}`);

      setTestUser('user_pro');

      const middleware = requireSubscription('starter');
      const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
      const handler = middleware(mockHandler);

      const response = await handler(new Request('http://localhost/test'));

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalled();
    });

    it('returns 401 if user not authenticated', async () => {
      setTestUser(''); // Clear user

      const middleware = requireSubscription('free');
      const mockHandler = vi.fn();
      const handler = middleware(mockHandler);

      const response = await handler(new Request('http://localhost/test'));

      expect(response.status).toBe(401);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('returns 404 if user not found in database', async () => {
      setTestUser('user_does_not_exist');

      const middleware = requireSubscription('free');
      const mockHandler = vi.fn();
      const handler = middleware(mockHandler);

      const response = await handler(new Request('http://localhost/test'));

      expect(response.status).toBe(404);
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('checkFeatureLimit', () => {
    describe('plan feature', () => {
      it('allows plan creation when under limit', async () => {
        const userId = await ensureUser({
          authUserId: 'user_under_plan_limit',
          email: 'under.plan@example.com',
        });

        // Create 2 plans (free limit is 3)
        await db.insert(learningPlans).values([
          {
            userId,
            topic: 'Topic 1',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
            isQuotaEligible: true,
          },
          {
            userId,
            topic: 'Topic 2',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
            isQuotaEligible: true,
          },
        ]);

        setTestUser('user_under_plan_limit');

        const middleware = checkFeatureLimit('plan');
        const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
        const handler = middleware(mockHandler);

        const response = await handler(new Request('http://localhost/test'));

        expect(response.status).toBe(200);
        expect(mockHandler).toHaveBeenCalled();
      });

      it('blocks plan creation when at limit', async () => {
        const userId = await ensureUser({
          authUserId: 'user_at_plan_limit',
          email: 'at.plan@example.com',
        });

        // Create 3 plans (free limit is 3)
        await db.insert(learningPlans).values([
          {
            userId,
            topic: 'Topic 1',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
            isQuotaEligible: true,
          },
          {
            userId,
            topic: 'Topic 2',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
            isQuotaEligible: true,
          },
          {
            userId,
            topic: 'Topic 3',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'mixed',
            isQuotaEligible: true,
          },
        ]);

        setTestUser('user_at_plan_limit');

        const middleware = checkFeatureLimit('plan');
        const mockHandler = vi.fn();
        const handler = middleware(mockHandler);

        const response = await handler(new Request('http://localhost/test'));

        expect(response.status).toBe(403);
        expect(mockHandler).not.toHaveBeenCalled();

        const body = await response.json();
        expect(body.error.code).toBe('FEATURE_LIMIT_EXCEEDED');
        expect(body.error.details.feature).toBe('plan');
        expect(body.error.details.tier).toBe('free');
      });
    });

    describe('regeneration feature', () => {
      it('allows regeneration when under limit', async () => {
        const userId = await ensureUser({
          authUserId: 'user_under_regen_limit',
          email: 'under.regen@example.com',
        });

        // Use 4 regenerations (free limit is 5)
        const month = new Date().toISOString().slice(0, 7); // Current month
        await db.insert(usageMetrics).values({
          userId,
          month,
          regenerationsUsed: 4,
        });

        setTestUser('user_under_regen_limit');

        const middleware = checkFeatureLimit('regeneration');
        const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
        const handler = middleware(mockHandler);

        const response = await handler(new Request('http://localhost/test'));

        expect(response.status).toBe(200);
        expect(mockHandler).toHaveBeenCalled();
      });

      it('blocks regeneration when at limit', async () => {
        const userId = await ensureUser({
          authUserId: 'user_at_regen_limit',
          email: 'at.regen@example.com',
        });

        // Use 5 regenerations (free limit is 5)
        const month = new Date().toISOString().slice(0, 7);
        await db.insert(usageMetrics).values({
          userId,
          month,
          regenerationsUsed: 5,
        });

        setTestUser('user_at_regen_limit');

        const middleware = checkFeatureLimit('regeneration');
        const mockHandler = vi.fn();
        const handler = middleware(mockHandler);

        const response = await handler(new Request('http://localhost/test'));

        expect(response.status).toBe(403);
        expect(mockHandler).not.toHaveBeenCalled();

        const body = await response.json();
        expect(body.error.code).toBe('FEATURE_LIMIT_EXCEEDED');
        expect(body.error.details.feature).toBe('regeneration');
      });
    });

    describe('export feature', () => {
      it('allows export when under limit', async () => {
        const userId = await ensureUser({
          authUserId: 'user_under_export_limit',
          email: 'under.export@example.com',
        });

        // Use 9 exports (free limit is 10)
        const month = new Date().toISOString().slice(0, 7);
        await db.insert(usageMetrics).values({
          userId,
          month,
          exportsUsed: 9,
        });

        setTestUser('user_under_export_limit');

        const middleware = checkFeatureLimit('export');
        const mockHandler = vi.fn().mockResolvedValue(new Response('OK'));
        const handler = middleware(mockHandler);

        const response = await handler(new Request('http://localhost/test'));

        expect(response.status).toBe(200);
        expect(mockHandler).toHaveBeenCalled();
      });

      it('blocks export when at limit', async () => {
        const userId = await ensureUser({
          authUserId: 'user_at_export_limit',
          email: 'at.export@example.com',
        });

        // Use 10 exports (free limit is 10)
        const month = new Date().toISOString().slice(0, 7);
        await db.insert(usageMetrics).values({
          userId,
          month,
          exportsUsed: 10,
        });

        setTestUser('user_at_export_limit');

        const middleware = checkFeatureLimit('export');
        const mockHandler = vi.fn();
        const handler = middleware(mockHandler);

        const response = await handler(new Request('http://localhost/test'));

        expect(response.status).toBe(403);
        expect(mockHandler).not.toHaveBeenCalled();
      });
    });
  });

  describe('hasSubscriptionTier', () => {
    it('returns true for exact tier match', async () => {
      const userId = await ensureUser({
        authUserId: 'user_exact_match',
        email: 'exact@example.com',
      });

      await db
        .update(users)
        .set({ subscriptionTier: 'starter' })
        .where(sql`id = ${userId}`);

      const result = await hasSubscriptionTier('user_exact_match', 'starter');
      expect(result).toBe(true);
    });

    it('returns true for higher tier', async () => {
      const userId = await ensureUser({
        authUserId: 'user_higher_tier',
        email: 'higher@example.com',
      });

      await db
        .update(users)
        .set({ subscriptionTier: 'pro' })
        .where(sql`id = ${userId}`);

      const result = await hasSubscriptionTier('user_higher_tier', 'starter');
      expect(result).toBe(true);
    });

    it('returns false for lower tier', async () => {
      await ensureUser({
        authUserId: 'user_lower_tier',
        email: 'lower@example.com',
      });

      // User is free tier (default)

      const result = await hasSubscriptionTier('user_lower_tier', 'pro');
      expect(result).toBe(false);
    });

    it('returns false for nonexistent user', async () => {
      const result = await hasSubscriptionTier('user_does_not_exist', 'free');
      expect(result).toBe(false);
    });
  });

  describe('canUseFeature', () => {
    it('returns true when user can create plans', async () => {
      const userId = await ensureUser({
        authUserId: 'user_can_create_plan',
        email: 'can.plan@example.com',
      });

      const result = await canUseFeature(userId, 'plan');
      expect(result).toBe(true);
    });

    it('returns false when user cannot create plans', async () => {
      const userId = await ensureUser({
        authUserId: 'user_cannot_create_plan',
        email: 'cannot.plan@example.com',
      });

      // Create 3 plans (at limit)
      await db.insert(learningPlans).values([
        {
          userId,
          topic: 'Topic 1',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          isQuotaEligible: true,
        },
        {
          userId,
          topic: 'Topic 2',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          isQuotaEligible: true,
        },
        {
          userId,
          topic: 'Topic 3',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'mixed',
          isQuotaEligible: true,
        },
      ]);

      const result = await canUseFeature(userId, 'plan');
      expect(result).toBe(false);
    });

    it('returns true when user can use regenerations', async () => {
      const userId = await ensureUser({
        authUserId: 'user_can_regen',
        email: 'can.regen@example.com',
      });

      const result = await canUseFeature(userId, 'regeneration');
      expect(result).toBe(true);
    });

    it('returns true when user can export', async () => {
      const userId = await ensureUser({
        authUserId: 'user_can_export',
        email: 'can.export@example.com',
      });

      const result = await canUseFeature(userId, 'export');
      expect(result).toBe(true);
    });
  });
});
