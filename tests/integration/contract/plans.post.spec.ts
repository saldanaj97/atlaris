import { afterEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/v1/plans/route';
import { generationAttempts, learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import {
  computePdfExtractionHash,
  issuePdfExtractionProof,
} from '@/lib/security/pdf-extraction-proof';
import { createPdfProof } from '../../fixtures/validation';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

const BASE_URL = 'http://localhost/api/v1/plans';

async function createRequest(body: unknown) {
  return new Request(BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/plans', () => {
  const authUserId = buildTestAuthUserId('contract-post');
  const authEmail = buildTestEmail(authUserId);

  afterEach(async () => {
    // ensure we do not leak plans across tests in case truncate hook is bypassed
    await db.delete(learningPlans);
  });

  it('creates a new plan and returns 201 with persisted payload', async () => {
    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail, subscriptionTier: 'pro' });

    const request = await createRequest({
      topic: 'Applied Machine Learning',
      skillLevel: 'intermediate',
      weeklyHours: 6,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      notes: 'Focus on notebooks and end-to-end projects.',
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const payload = await response.json();
    expect(payload).toMatchObject({
      topic: 'Applied Machine Learning',
      skillLevel: 'intermediate',
      weeklyHours: 6,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    });
    expect(payload).toHaveProperty('id');
    expect(payload).toHaveProperty('createdAt');
  });

  it('returns 400 when validation fails', async () => {
    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    const request = await createRequest({
      skillLevel: 'beginner',
      weeklyHours: -1,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload).toHaveProperty('error');
  });

  it('returns 429 when generation attempts are capped for follow-up requests', async () => {
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'pro',
    });
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Capped Plan',
        skillLevel: 'beginner',
        weeklyHours: 4,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    // Insert 3 failure attempts directly to reflect capped state (implementation should block further attempts)
    await db.insert(generationAttempts).values([
      {
        planId: plan.id,
        status: 'failure',
        classification: 'timeout',
        durationMs: 10_000,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: null,
        metadata: null,
      },
      {
        planId: plan.id,
        status: 'failure',
        classification: 'rate_limit',
        durationMs: 8_000,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: null,
        metadata: null,
      },
      {
        planId: plan.id,
        status: 'failure',
        classification: 'validation',
        durationMs: 500,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: null,
        metadata: null,
      },
    ]);

    const request = await createRequest({
      topic: 'New Topic After Cap',
      skillLevel: 'beginner',
      weeklyHours: 2,
      learningStyle: 'reading',
      visibility: 'private',
      origin: 'ai',
    });

    const response = await POST(request);
    expect(response.status).toBe(429);

    const payload = await response.json();
    expect(payload).toMatchObject({ classification: 'capped' });
  });

  it('accepts PDF-origin create request with valid proof', async () => {
    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail, subscriptionTier: 'pro' });

    const extractedContent = {
      mainTopic: 'Data Structures from PDF',
      sections: [
        {
          title: 'Arrays',
          content: 'Time complexity and traversal.',
          level: 1,
        },
      ],
    };
    const extractionHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId,
      extractionHash,
      dbClient: db,
    });

    const pdfProof = createPdfProof({
      pdfProofToken: token,
      pdfExtractionHash: extractionHash,
    });
    const request = await createRequest({
      origin: 'pdf',
      extractedContent,
      ...pdfProof,
      topic: extractedContent.mainTopic,
      skillLevel: 'beginner',
      weeklyHours: 4,
      learningStyle: 'mixed',
      visibility: 'private',
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const payload = await response.json();
    expect(payload.origin).toBe('pdf');
    expect(payload.topic).toBe(extractedContent.mainTopic);
  });

  it('rejects PDF-origin create request with wrong-user proof token', async () => {
    const ownerAuthUserId = buildTestAuthUserId('contract-pdf-owner');
    const attackerAuthUserId = buildTestAuthUserId('contract-pdf-attacker');
    await ensureUser({
      authUserId: ownerAuthUserId,
      email: buildTestEmail(ownerAuthUserId),
      subscriptionTier: 'pro',
    });
    await ensureUser({
      authUserId: attackerAuthUserId,
      email: buildTestEmail(attackerAuthUserId),
      subscriptionTier: 'pro',
    });
    setTestUser(attackerAuthUserId);

    const extractedContent = {
      mainTopic: 'Algorithms from PDF',
      sections: [
        {
          title: 'Sorting',
          content: 'Merge sort and quicksort.',
          level: 1,
        },
      ],
    };
    const extractionHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId: ownerAuthUserId,
      extractionHash,
      dbClient: db,
    });

    const pdfProof = createPdfProof({
      pdfProofToken: token,
      pdfExtractionHash: extractionHash,
    });
    const request = await createRequest({
      origin: 'pdf',
      extractedContent,
      ...pdfProof,
      topic: extractedContent.mainTopic,
      skillLevel: 'beginner',
      weeklyHours: 4,
      learningStyle: 'mixed',
      visibility: 'private',
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe('Invalid or expired PDF extraction proof.');
  });

  it('rejects PDF-origin create request with expired proof token', async () => {
    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail, subscriptionTier: 'pro' });

    const extractedContent = {
      mainTopic: 'Networking from PDF',
      sections: [
        {
          title: 'OSI Model',
          content: 'Layer responsibilities and examples.',
          level: 1,
        },
      ],
    };
    const extractionHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId,
      extractionHash,
      dbClient: db,
      now: () => new Date(0),
    });

    const pdfProof = createPdfProof({
      pdfProofToken: token,
      pdfExtractionHash: extractionHash,
    });
    const request = await createRequest({
      origin: 'pdf',
      extractedContent,
      ...pdfProof,
      topic: extractedContent.mainTopic,
      skillLevel: 'beginner',
      weeklyHours: 4,
      learningStyle: 'mixed',
      visibility: 'private',
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe('Invalid or expired PDF extraction proof.');
  });
});
