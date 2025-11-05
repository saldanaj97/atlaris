## Task 8: Notion Integration - Client with Rate Limiting

**Files:**

- Create: `src/lib/integrations/notion/client.ts`
- Create: `tests/unit/integrations/notion-client.spec.ts`

**Step 1: Write failing test for rate-limited client**

Create `tests/unit/integrations/notion-client.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotionClient } from '@/lib/integrations/notion/client';

describe('NotionClient Rate Limiting', () => {
  let client: NotionClient;

  beforeEach(() => {
    client = new NotionClient('test_access_token');
  });

  it('should enforce 3 requests per second limit', async () => {
    const start = Date.now();

    // Queue 6 requests
    const promises = Array(6)
      .fill(null)
      .map(() =>
        client.createPage({
          parent: { page_id: 'test' },
          properties: {},
        })
      );

    await Promise.all(promises);
    const elapsed = Date.now() - start;

    // 6 requests at 3 req/sec = minimum 2 seconds
    expect(elapsed).toBeGreaterThanOrEqual(1800); // Allow some tolerance
  });

  it('should handle API errors with retry', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'page_123' }),
      });

    global.fetch = mockFetch;

    const result = await client.createPage({
      parent: { page_id: 'test' },
      properties: {},
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.id).toBe('page_123');
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run tests/unit/integrations/notion-client.spec.ts
```

Expected: FAIL - Module not found

**Step 3: Implement rate-limited Notion client**

Create `src/lib/integrations/notion/client.ts`:

```typescript
import { Client } from '@notionhq/client';
import type {
  CreatePageParameters,
  UpdatePageParameters,
} from '@notionhq/client/build/src/api-endpoints';
import pRetry from 'p-retry';

const MAX_REQUESTS_PER_SECOND = 3;
const REQUEST_INTERVAL = 1000 / MAX_REQUESTS_PER_SECOND;

export class NotionClient {
  private client: Client;
  private requestQueue: Promise<void> = Promise.resolve();
  private lastRequestTime = 0;

  constructor(accessToken: string) {
    this.client = new Client({ auth: accessToken });
  }

  private async rateLimit(): Promise<void> {
    this.requestQueue = this.requestQueue.then(async () => {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < REQUEST_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, REQUEST_INTERVAL - timeSinceLastRequest)
        );
      }

      this.lastRequestTime = Date.now();
    });

    return this.requestQueue;
  }

  async createPage(params: CreatePageParameters): Promise<any> {
    await this.rateLimit();

    return pRetry(
      async () => {
        const response = await this.client.pages.create(params);
        return response;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
        onFailedAttempt: (error) => {
          console.warn(
            `Notion API attempt ${error.attemptNumber} failed:`,
            error.message
          );
        },
      }
    );
  }

  async updatePage(params: UpdatePageParameters): Promise<any> {
    await this.rateLimit();

    return pRetry(
      async () => {
        const response = await this.client.pages.update(params);
        return response;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
      }
    );
  }

  async appendBlocks(pageId: string, blocks: any[]): Promise<any> {
    await this.rateLimit();

    return pRetry(
      async () => {
        const response = await this.client.blocks.children.append({
          block_id: pageId,
          children: blocks,
        });
        return response;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
      }
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run tests/unit/integrations/notion-client.spec.ts
```

Expected: PASS

**Step 5: Run Coderabbit CLI and implement suggestions**

Run `coderabbit --prompt-only -t uncommitted` and implement any suggestions from the review.

**Step 6: Commit**

```bash
git add src/lib/integrations/notion/client.ts tests/unit/integrations/notion-client.spec.ts
git commit -m "feat(notion): add rate-limited client with retry logic

Implement Notion API client with 3 req/sec rate limiting and exponential
backoff retry. Queues requests to respect API limits.

Changes:
- Add NotionClient class with rate limiting queue
- Add retry logic with p-retry (3 attempts, exponential backoff)
- Support createPage, updatePage, appendBlocks operations

New files:
- src/lib/integrations/notion/client.ts
- tests/unit/integrations/notion-client.spec.ts

Tests cover:
- Rate limit enforcement (3 req/sec)
- Retry on transient failures"
```

**Step 7: Open PR into main**

Create a pull request from the current branch into main, following the commit message guidelines.

---
