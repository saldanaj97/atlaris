import { createOAuthStateStore } from './oauth-state-store';
import type { OAuthStateStore } from './oauth-state.types';

let defaultStore: OAuthStateStore | null = null;

function getDefaultStore(): OAuthStateStore {
  if (!defaultStore) {
    defaultStore = createOAuthStateStore();
  }
  return defaultStore;
}

export async function generateAndStoreOAuthStateToken(
  clerkUserId: string,
  provider?: string,
  store: OAuthStateStore = getDefaultStore()
): Promise<string> {
  return store.issue({ clerkUserId, provider });
}

export async function validateOAuthStateToken(
  stateToken: string,
  store: OAuthStateStore = getDefaultStore()
): Promise<string | null> {
  return store.consume({ stateToken });
}

export { createOAuthStateStore } from './oauth-state-store';
export type { OAuthStateStore } from './oauth-state.types';
