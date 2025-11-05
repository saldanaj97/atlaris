import { Client } from '@notionhq/client';
import type {
  AppendBlockChildrenResponse,
  BlockObjectRequest,
  CreatePageParameters,
  CreatePageResponse,
  UpdatePageParameters,
  UpdatePageResponse,
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

  async createPage(params: CreatePageParameters): Promise<CreatePageResponse> {
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
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.warn(
            `Notion API attempt ${error.attemptNumber} failed:`,
            errorMessage
          );
        },
      }
    );
  }

  async updatePage(params: UpdatePageParameters): Promise<UpdatePageResponse> {
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
        onFailedAttempt: (error) => {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.warn(
            `Notion API attempt ${error.attemptNumber} failed:`,
            errorMessage
          );
        },
      }
    );
  }

  async appendBlocks(
    pageId: string,
    blocks: BlockObjectRequest[]
  ): Promise<AppendBlockChildrenResponse> {
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
        onFailedAttempt: (error) => {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.warn(
            `Notion API attempt ${error.attemptNumber} failed:`,
            errorMessage
          );
        },
      }
    );
  }
}
