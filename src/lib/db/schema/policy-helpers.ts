import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';

import { currentUserId } from './tables/common';
import { users } from './tables/users';

type BasePlanParams = {
  planIdColumn: AnyPgColumn;
  planTable: AnyPgTable;
  planIdReferenceColumn: AnyPgColumn;
};

/**
 * Shared SQL fragments for RLS policies that validate user ownership or plan visibility.
 * Keeps the table definitions easier to scan and eliminates duplicated SQL strings that are easy to mistype.
 */

/**
 * SQL fragment that ensures a row belongs to the current authenticated user.
 */
export const recordOwnedByCurrentUser = (userIdColumn: AnyPgColumn): SQL =>
  sql`
    ${userIdColumn} IN (
      SELECT id FROM ${users} WHERE ${users.authUserId} = ${currentUserId}
    )
  `;

type PlanOwnershipParams = BasePlanParams & {
  planUserIdColumn: AnyPgColumn;
};

/**
 * SQL fragment that ensures the referenced plan belongs to the current user.
 */
export const planOwnedByCurrentUser = ({
  planIdColumn,
  planTable,
  planIdReferenceColumn,
  planUserIdColumn,
}: PlanOwnershipParams): SQL =>
  sql`
    EXISTS (
      SELECT 1 FROM ${planTable}
      WHERE ${planIdReferenceColumn} = ${planIdColumn}
      AND ${planUserIdColumn} IN (
        SELECT id FROM ${users} WHERE ${users.authUserId} = ${currentUserId}
      )
    )
  `;

type PlanAndUserOwnershipParams = PlanOwnershipParams & {
  userIdColumn: AnyPgColumn;
};

/**
 * SQL fragment that ensures both the record owner and related plan owner are the current user.
 */
export const userAndPlanOwnedByCurrentUser = ({
  userIdColumn,
  ...planParams
}: PlanAndUserOwnershipParams): SQL => {
  const userOwnership = recordOwnedByCurrentUser(userIdColumn);
  const planOwnership = planOwnedByCurrentUser(planParams);
  return sql`${userOwnership} AND ${planOwnership}`;
};

type TaskAndUserOwnershipParams = {
  userIdColumn: AnyPgColumn;
  taskIdColumn: AnyPgColumn;
  taskTable: AnyPgTable;
  taskIdReferenceColumn: AnyPgColumn;
  taskModuleIdColumn: AnyPgColumn;
  moduleTable: AnyPgTable;
  moduleIdReferenceColumn: AnyPgColumn;
  modulePlanIdColumn: AnyPgColumn;
  planTable: AnyPgTable;
  planIdReferenceColumn: AnyPgColumn;
  planUserIdColumn: AnyPgColumn;
};

/**
 * SQL fragment that ensures both the record owner and referenced task ownership
 * resolve to the current authenticated user.
 */
export const userAndTaskOwnedByCurrentUser = ({
  userIdColumn,
  taskIdColumn,
  taskTable,
  taskIdReferenceColumn,
  taskModuleIdColumn,
  moduleTable,
  moduleIdReferenceColumn,
  modulePlanIdColumn,
  planTable,
  planIdReferenceColumn,
  planUserIdColumn,
}: TaskAndUserOwnershipParams): SQL => {
  const userOwnership = recordOwnedByCurrentUser(userIdColumn);
  const taskOwnership = sql`
    EXISTS (
      SELECT 1 FROM ${taskTable}
      JOIN ${moduleTable} ON ${moduleIdReferenceColumn} = ${taskModuleIdColumn}
      JOIN ${planTable} ON ${planIdReferenceColumn} = ${modulePlanIdColumn}
      WHERE ${taskIdReferenceColumn} = ${taskIdColumn}
      AND ${planUserIdColumn} IN (
        SELECT id FROM ${users} WHERE ${users.authUserId} = ${currentUserId}
      )
    )
  `;

  return sql`${userOwnership} AND ${taskOwnership}`;
};

/**
 * Utility to compose ad-hoc conditions with parentheses in callers.
 */
export const wrapCondition = (condition: SQL): SQL => sql`(${condition})`;
