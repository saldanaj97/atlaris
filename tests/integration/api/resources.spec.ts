import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resources } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

import { setTestUser, clearTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { auth } from '../../mocks/shared/auth-server';

const authUserId = 'auth_resources_test_user';

const authenticatedSession = {
  data: {
    user: {
      id: authUserId,
      email: 'resources@example.com',
      name: 'Resources Test',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
    },
  },
} as const;

describe('GET /api/v1/resources', () => {
  async function seedResources(): Promise<void> {
    await db.insert(resources).values([
      {
        type: 'article',
        title: 'Article Resource',
        url: 'https://example.com/articles/intro',
        domain: 'example.com',
        author: 'Author A',
        durationMinutes: 15,
        tags: ['intro', 'article'],
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      },
      {
        type: 'youtube',
        title: 'Video Resource',
        url: 'https://youtube.com/watch?v=resource123',
        domain: 'youtube.com',
        author: 'Author B',
        durationMinutes: 25,
        tags: ['video'],
        createdAt: new Date('2026-01-01T11:00:00.000Z'),
      },
      {
        type: 'doc',
        title: 'Docs Resource',
        url: 'https://docs.example.com/getting-started',
        domain: 'docs.example.com',
        author: 'Author C',
        durationMinutes: 10,
        tags: ['docs'],
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
      },
    ]);
  }

  beforeEach(async () => {
    vi.mocked(auth.getSession).mockResolvedValue(authenticatedSession);

    setTestUser(authUserId);

    await ensureUser({
      authUserId,
      email: 'resources@example.com',
    });

    await seedResources();
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('returns resources with the expected public fields', async () => {
    const { GET } = await import('@/app/api/v1/resources/route');
    const request = new NextRequest('http://localhost:3000/api/v1/resources', {
      method: 'GET',
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    expect(body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        type: expect.any(String),
        title: expect.any(String),
        url: expect.any(String),
      })
    );

    for (const resource of body) {
      expect(Object.keys(resource).sort()).toEqual([
        'author',
        'domain',
        'durationMinutes',
        'id',
        'tags',
        'title',
        'type',
        'url',
      ]);
    }
  });

  it('filters resources by type', async () => {
    const { GET } = await import('@/app/api/v1/resources/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/resources?type=youtube',
      {
        method: 'GET',
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0]?.type).toBe('youtube');
    expect(body[0]?.title).toBe('Video Resource');
  });

  it('supports limit and offset pagination', async () => {
    const { GET } = await import('@/app/api/v1/resources/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/resources?limit=1&offset=1',
      {
        method: 'GET',
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0]?.title).toBe('Video Resource');
  });

  it('rejects invalid query parameters', async () => {
    const { GET } = await import('@/app/api/v1/resources/route');
    const request = new NextRequest(
      'http://localhost:3000/api/v1/resources?limit=999',
      {
        method: 'GET',
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('should require authentication', async () => {
    clearTestUser();

    vi.mocked(auth.getSession).mockResolvedValue({ data: null });

    const { GET } = await import('@/app/api/v1/resources/route');
    const request = new NextRequest('http://localhost:3000/api/v1/resources', {
      method: 'GET',
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});
