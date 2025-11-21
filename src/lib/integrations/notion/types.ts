import type {
  BlockObjectRequest,
  CreatePageParameters,
  CreatePageResponse,
  UpdatePageParameters,
  UpdatePageResponse,
  AppendBlockChildrenResponse,
} from '@notionhq/client/build/src/api-endpoints';

/**
 * Minimal interface for the Notion client used by exportPlanToNotion.
 * Only includes the methods actually used by our sync logic.
 */
export interface NotionIntegrationClient {
  createPage(params: CreatePageParameters): Promise<CreatePageResponse>;
  updatePage(params: UpdatePageParameters): Promise<UpdatePageResponse>;
  appendBlocks(
    pageId: string,
    blocks: BlockObjectRequest[]
  ): Promise<AppendBlockChildrenResponse>;
  replaceBlocks(
    pageId: string,
    blocks: BlockObjectRequest[]
  ): Promise<AppendBlockChildrenResponse>;
}
