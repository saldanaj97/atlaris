import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { POST } from '@/app/api/v1/plans/stream/route';
import type { GenerationFailureResult } from '@/lib/ai/orchestrator';
import { learningPlans, modules } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import {
  computePdfExtractionHash,
  issuePdfExtractionProof,
} from '@/lib/security/pdf-extraction-proof';

import { setTestUser } from '../../helpers/auth';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';
import {
  readStreamingResponse,
  type StreamingEvent,
} from '../../helpers/streaming';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

const ORIGINAL_ENV = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  MOCK_GENERATION_DELAY_MS: process.env.MOCK_GENERATION_DELAY_MS,
};

beforeAll(() => {
  process.env.AI_PROVIDER = 'mock';
  process.env.MOCK_GENERATION_DELAY_MS = '10';
});

afterAll(() => {
  process.env.AI_PROVIDER = ORIGINAL_ENV.AI_PROVIDER;
  process.env.MOCK_GENERATION_DELAY_MS = ORIGINAL_ENV.MOCK_GENERATION_DELAY_MS;
});

describe('POST /api/v1/plans/stream', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
  });

  it('streams generation and persists plan data', async () => {
    const authUserId = buildTestAuthUserId('stream-user');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning TypeScript',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-01-01',
      visibility: 'private',
      origin: 'ai',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const completeEvent = events.find((event) => event.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
    const planId = completeEvent?.data?.planId as string;

    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, planId))
      .limit(1);

    expect(plan?.generationStatus).toBe('ready');
    expect(plan?.isQuotaEligible).toBe(true);

    const moduleRows = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, planId));

    expect(moduleRows.length).toBeGreaterThan(0);
  });

  it('marks plan failed on generation error', async () => {
    const authUserId = buildTestAuthUserId('stream-failure');
    await ensureUser({ authUserId, email: buildTestEmail(authUserId) });
    setTestUser(authUserId);

    // Mock the orchestrator to throw during generation
    const orchestrator = await import('@/lib/ai/orchestrator');
    vi.spyOn(orchestrator, 'runGenerationAttempt').mockImplementation(
      async () => {
        throw new Error('boom');
      }
    );

    const payload = {
      topic: 'Failing Plan',
      skillLevel: 'beginner',
      weeklyHours: 1,
      learningStyle: 'mixed',
      deadlineDate: '2030-01-01',
      visibility: 'private',
      origin: 'ai',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    let events: StreamingEvent[] = [];
    try {
      events = await readStreamingResponse(response);
    } catch {
      // Stream may error after marking failure; swallow the stream error
    } finally {
      vi.restoreAllMocks();
    }

    const startEvent = events.find((e) => e.type === 'plan_start');
    expect(startEvent?.data?.planId).toBeTruthy();
    const planId = startEvent?.data?.planId as string;

    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, planId))
      .limit(1);

    expect(plan?.generationStatus).toBe('failed');
  });

  it('returns sanitized SSE error payloads to clients on generation failure', async () => {
    const authUserId = buildTestAuthUserId('stream-sanitized-error');
    await ensureUser({ authUserId, email: buildTestEmail(authUserId) });
    setTestUser(authUserId);

    const orchestrator = await import('@/lib/ai/orchestrator');
    const mockedFailure: GenerationFailureResult = {
      status: 'failure',
      classification: 'provider_error',
      error: new Error(
        'OpenRouter upstream failure: api_key=sk-live-secret-value'
      ),
      durationMs: 250,
      extendedTimeout: false,
      timedOut: false,
      attempt: {
        id: 'attempt-sanitized-error',
        planId: 'plan-sanitized-error',
        status: 'failure',
        classification: 'provider_error',
        durationMs: 250,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: null,
        metadata: null,
        createdAt: new Date(),
      },
    };

    vi.spyOn(orchestrator, 'runGenerationAttempt').mockResolvedValue(
      mockedFailure
    );

    const payload = {
      topic: 'Sanitized Failure Plan',
      skillLevel: 'beginner',
      weeklyHours: 2,
      learningStyle: 'mixed',
      deadlineDate: '2030-01-01',
      visibility: 'private',
      origin: 'ai',
    };

    try {
      const request = new Request('http://localhost/api/v1/plans/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const events = await readStreamingResponse(response);
      const errorEvent = events.find((event) => event.type === 'error');

      expect(errorEvent?.data).toMatchObject({
        code: 'GENERATION_FAILED',
        message: 'Plan generation encountered an error. Please try again.',
        classification: 'provider_error',
        retryable: true,
      });
      const errorMessage =
        typeof errorEvent?.data?.message === 'string'
          ? errorEvent.data.message
          : '';
      expect(errorMessage).not.toContain('api_key');
      expect(errorMessage).not.toContain('sk-live-secret-value');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('accepts valid model override via query param', async () => {
    const authUserId = buildTestAuthUserId('stream-model-override');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning React',
      skillLevel: 'intermediate',
      weeklyHours: 8,
      learningStyle: 'video',
      deadlineDate: '2030-06-01',
      visibility: 'private',
    };

    // Use a different valid model to verify override is working
    // (using a model different from the default AI_DEFAULT_MODEL)
    const request = new Request(
      'http://localhost/api/v1/plans/stream?model=openai/gpt-oss-20b:free',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const completeEvent = events.find((event) => event.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
  });

  it('falls back to default model when invalid model override is provided', async () => {
    const authUserId = buildTestAuthUserId('stream-invalid-model');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning Vue',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-03-01',
      visibility: 'private',
    };

    // Use an invalid model override - should fall back to default
    const request = new Request(
      'http://localhost/api/v1/plans/stream?model=invalid/model-id',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const response = await POST(request);
    // Should succeed with default model fallback, not error
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const completeEvent = events.find((event) => event.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
  });

  it('works without model param (uses default)', async () => {
    const authUserId = buildTestAuthUserId('stream-no-model');
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    setTestUser(authUserId);

    const payload = {
      topic: 'Learning Python',
      skillLevel: 'advanced',
      weeklyHours: 10,
      learningStyle: 'practice',
      deadlineDate: '2030-12-01',
      visibility: 'private',
    };

    // No model param - should use default
    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const events = await readStreamingResponse(response);
    const completeEvent = events.find((event) => event.type === 'complete');
    expect(completeEvent?.data?.planId).toBeTruthy();
  });

  it('rejects PDF-origin stream request with forged extraction hash', async () => {
    const authUserId = buildTestAuthUserId('stream-pdf-forged-hash');
    await ensureUser({ authUserId, email: buildTestEmail(authUserId) });
    setTestUser(authUserId);

    const extractedContent = {
      mainTopic: 'TypeScript from PDF',
      sections: [
        {
          title: 'Intro',
          content: 'Basics and setup',
          level: 1,
        },
      ],
    };

    const validHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId,
      extractionHash: validHash,
    });

    const forgedHash =
      'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

    const payload = {
      origin: 'pdf',
      extractedContent,
      pdfProofToken: token,
      pdfExtractionHash: forgedHash,
      topic: extractedContent.mainTopic,
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      deadlineDate: '2030-01-01',
      visibility: 'private',
    };

    const request = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe('Invalid or expired PDF extraction proof.');
  });

  it('rejects replayed PDF extraction proof token', async () => {
    const authUserId = buildTestAuthUserId('stream-pdf-replay');
    await ensureUser({ authUserId, email: buildTestEmail(authUserId) });
    setTestUser(authUserId);

    const extractedContent = {
      mainTopic: 'React from PDF',
      sections: [
        {
          title: 'Foundations',
          content: 'Components and props',
          level: 1,
        },
      ],
    };

    const extractionHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId,
      extractionHash,
    });

    const payload = {
      origin: 'pdf',
      extractedContent,
      pdfProofToken: token,
      pdfExtractionHash: extractionHash,
      topic: extractedContent.mainTopic,
      skillLevel: 'beginner',
      weeklyHours: 4,
      learningStyle: 'mixed',
      deadlineDate: '2030-02-01',
      visibility: 'private',
    };

    const firstRequest = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const firstResponse = await POST(firstRequest);
    expect(firstResponse.status).toBe(200);
    await readStreamingResponse(firstResponse);

    const replayRequest = new Request('http://localhost/api/v1/plans/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const replayResponse = await POST(replayRequest);
    expect(replayResponse.status).toBe(403);
    const body = (await replayResponse.json()) as { error?: string };
    expect(body.error).toBe('Invalid or expired PDF extraction proof.');
  });

  it('persists PDF context and forwards it to generation input', async () => {
    const authUserId = buildTestAuthUserId('stream-pdf-context');
    await ensureUser({ authUserId, email: buildTestEmail(authUserId) });
    setTestUser(authUserId);

    const extractedContent = {
      mainTopic: 'TypeScript from PDF context',
      sections: [
        {
          title: 'Core concepts',
          content: `${'x'.repeat(3_000)}TAIL_MARKER`,
          level: 1,
          suggestedTopic: 'Type system',
        },
      ],
    };

    const extractionHash = computePdfExtractionHash(extractedContent);
    const { token } = await issuePdfExtractionProof({
      authUserId,
      extractionHash,
    });

    const orchestrator = await import('@/lib/ai/orchestrator');
    const runSpy = vi.spyOn(orchestrator, 'runGenerationAttempt');

    try {
      const payload = {
        origin: 'pdf',
        extractedContent,
        pdfProofToken: token,
        pdfExtractionHash: extractionHash,
        topic: extractedContent.mainTopic,
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        deadlineDate: '2030-04-01',
        visibility: 'private',
      };

      const request = new Request('http://localhost/api/v1/plans/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const events = await readStreamingResponse(response);
      const completeEvent = events.find((event) => event.type === 'complete');
      expect(completeEvent?.data?.planId).toBeTruthy();
      const planId = completeEvent?.data?.planId as string;

      expect(runSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            pdfContext: expect.objectContaining({
              mainTopic: 'TypeScript from PDF context',
              sections: expect.arrayContaining([
                expect.objectContaining({
                  title: 'Core concepts',
                  content: expect.any(String),
                }),
              ]),
            }),
          }),
        }),
        expect.anything()
      );

      const capturedInput = runSpy.mock.calls[0]?.[0]?.input;
      const capturedSection = capturedInput?.pdfContext?.sections?.[0];
      const extractedSection = extractedContent.sections?.[0];
      expect(capturedSection).toBeDefined();
      expect(extractedSection).toBeDefined();
      if (extractedSection && capturedSection) {
        expect(capturedSection.content.length).toBeLessThan(
          extractedSection.content.length
        );
      }

      const [plan] = await db
        .select()
        .from(learningPlans)
        .where(eq(learningPlans.id, planId))
        .limit(1);

      expect(plan?.extractedContext).toMatchObject({
        mainTopic: 'TypeScript from PDF context',
        sections: expect.arrayContaining([
          expect.objectContaining({ title: 'Core concepts' }),
        ]),
      });
      expect(
        plan?.extractedContext?.sections?.[0]?.content.length
      ).toBeLessThan(extractedContent.sections[0].content.length);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
