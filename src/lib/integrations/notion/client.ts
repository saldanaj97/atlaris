import { Client, APIResponseError } from '@notionhq/client';
import type {
  CreatePageParameters,
  UpdatePageParameters,
  AppendBlockChildrenParameters,
} from '@notionhq/client/build/src/api-endpoints';
import type {
  PageObjectResponse,
  PartialPageObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';
import pRetry from 'p-retry';

const MAX_REQUESTS_PER_SECOND = 3;
const REQUEST_INTERVAL = 1000 / MAX_REQUESTS_PER_SECOND;

function isRetriableError(error: unknown): boolean {
  if (error instanceof APIResponseError) {
    const status = error.status;
    // Don't retry 4xx client errors (auth, validation, etc.)
    if (status >= 400 && status < 500) {
      return false;
    }
    // Retry 5xx server errors and rate limits (429)
    return status >= 500 || status === 429;
  }
  // Retry network errors and other unknown errors
  return true;
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

  async createPage(
    params: CreatePageParameters
  ): Promise<PageObjectResponse | PartialPageObjectResponse> {
    return pRetry(
      async () => {
        await this.rateLimit();
        const response = await this.client.pages.create(params);
        return response;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
        shouldRetry: ({ error }) => isRetriableError(error),
        onFailedAttempt: ({ error, attemptNumber }) => {
          console.warn(
            `Notion API createPage attempt ${attemptNumber} failed:`,
            error.message
          );
        },
      }
    );
  }

  async updatePage(
    params: UpdatePageParameters
  ): Promise<PageObjectResponse | PartialPageObjectResponse> {
    return pRetry(
      async () => {
        await this.rateLimit();
        const response = await this.client.pages.update(params);
        return response;
      },
      {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 5000,
        shouldRetry: ({ error }) => isRetriableError(error),
        onFailedAttempt: ({ error, attemptNumber }) => {
          console.warn(
            `Notion API updatePage attempt ${attemptNumber} failed:`,
            error.message
          );
        },
      }
    );
  }

  async appendBlocks(
    pageId: string,
    blocks: AppendBlockChildrenParameters['children']
  ): Promise<ReturnType<Client['blocks']['children']['append']>> {
    return pRetry(
      async () => {
        await this.rateLimit();
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
        shouldRetry: ({ error }) => isRetriableError(error),
        onFailedAttempt: ({ error, attemptNumber }) => {
          console.warn(
            `Notion API appendBlocks (pageId: ${pageId}) attempt ${attemptNumber} failed:`,
            error.message
          );
        },
      }
    );
  }
}
