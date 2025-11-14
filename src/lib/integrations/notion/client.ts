import { Client } from '@notionhq/client';
import type {
  AppendBlockChildrenResponse,
  BlockObjectRequest,
  CreatePageParameters,
  CreatePageResponse,
  ListBlockChildrenResponse,
  UpdateBlockResponse,
  UpdatePageParameters,
  UpdatePageResponse,
} from '@notionhq/client/build/src/api-endpoints';
import pRetry from 'p-retry';
import { logger } from '@/lib/logging/logger';

const MAX_REQUESTS_PER_SECOND = 3;
const REQUEST_INTERVAL = 1000 / MAX_REQUESTS_PER_SECOND;

function logNotionAttemptFailure(
  operation: string,
  error: unknown
): void {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const errorRecord = error as Record<string, unknown>;
  logger.warn(
    {
      operation,
      attemptNumber:
        typeof errorRecord.attemptNumber === 'number'
          ? errorRecord.attemptNumber
          : undefined,
      retriesLeft:
        typeof errorRecord.retriesLeft === 'number'
          ? errorRecord.retriesLeft
          : undefined,
      message,
    },
    `Notion API ${operation} attempt failed`
  );
}

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

  async createPage(params: CreatePageParameters): Promise<CreatePageResponse> {
    await this.rateLimit();

    return pRetry<CreatePageResponse>(
      async () => {
        const response = await this.client.pages.create(params);
        return response;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
        onFailedAttempt: (error) => {
          logNotionAttemptFailure('create_page', error);
        },
      }
    );
  }

  async updatePage(params: UpdatePageParameters): Promise<UpdatePageResponse> {
    await this.rateLimit();

    return pRetry<UpdatePageResponse>(
      async () => {
        const response = await this.client.pages.update(params);
        return response;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
        onFailedAttempt: (error) => {
          logNotionAttemptFailure('update_page', error);
        },
      }
    );
  }

  async appendBlocks(
    pageId: string,
    blocks: BlockObjectRequest[]
  ): Promise<AppendBlockChildrenResponse> {
    await this.rateLimit();

    return pRetry<AppendBlockChildrenResponse>(
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
        onFailedAttempt: (error) => {
          logNotionAttemptFailure('append_blocks', error);
        },
      }
    );
  }

  async replaceBlocks(
    pageId: string,
    blocks: BlockObjectRequest[]
  ): Promise<AppendBlockChildrenResponse> {
    // Step 1: List all existing children blocks (handle pagination)
    const existingBlockIds: string[] = [];
    let nextCursor: string | undefined;

    do {
      await this.rateLimit();

      const response = await pRetry<ListBlockChildrenResponse>(
        async () => {
          return await this.client.blocks.children.list({
            block_id: pageId,
            start_cursor: nextCursor,
          });
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
          onFailedAttempt: (error) => {
            logNotionAttemptFailure('list_children', error);
          },
        }
      );

      // Collect block IDs
      for (const block of response.results) {
        existingBlockIds.push(block.id);
      }

      nextCursor = response.next_cursor ?? undefined;
    } while (nextCursor);

    // Step 2: Archive all existing blocks
    for (const blockId of existingBlockIds) {
      await this.rateLimit();

      await pRetry<UpdateBlockResponse>(
        async () => {
          return await this.client.blocks.update({
            block_id: blockId,
            archived: true,
          });
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
          onFailedAttempt: (error) => {
            logNotionAttemptFailure(`archive_block_${blockId}`, error);
          },
        }
      );
    }

    // Step 3: Append new blocks
    return await this.appendBlocks(pageId, blocks);
  }
}
