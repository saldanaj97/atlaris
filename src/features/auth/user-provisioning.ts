import type {
  ActorUser,
  CreateUserData,
} from '@/lib/db/queries/types/users.types';

import { getOrCreateUser } from '@/lib/db/queries/users';
import { db as serviceRoleDb } from '@supabase/service-role';

/**
 * Creates a first local row from Clerk data already verified by the auth boundary.
 */
export async function provisionUserFromVerifiedAuthSession(
  userData: CreateUserData,
): Promise<ActorUser | undefined> {
  return getOrCreateUser(userData, serviceRoleDb);
}
