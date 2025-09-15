# Row Level Security (RLS) Concepts with Drizzle + Supabase

## Table of Contents

1. [What is Row Level Security?](#what-is-row-level-security)
2. [Why Use RLS?](#why-use-rls)
3. [RLS with Supabase](#rls-with-supabase)
4. [Drizzle RLS Implementation](#drizzle-rls-implementation)
5. [Supabase Predefined Roles](#supabase-predefined-roles)
6. [Policy Types and Structure](#policy-types-and-structure)
7. [Common RLS Patterns](#common-rls-patterns)
8. [Configuration Setup](#configuration-setup)
9. [Runtime Implementation](#runtime-implementation)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

## What is Row Level Security?

Row Level Security (RLS) is a PostgreSQL feature that allows you to control access to individual rows in a table based on the characteristics of the user executing a query. Instead of granting or denying access to entire tables, RLS lets you define policies that determine which rows a user can see, insert, update, or delete.

### Key Concepts

- **Policies**: Rules that define what data users can access
- **Roles**: Database users or groups that policies apply to
- **Security Context**: Information about the current user (like user ID, role, etc.)

### Example Scenario

Imagine a `learning_plans` table where users should only see their own learning plans:

- Without RLS: Users could potentially access all learning plans
- With RLS: A policy ensures users only see plans where `user_id = auth.uid()`

## Why Use RLS?

### Security Benefits

1. **Defense in Depth**: Even if application logic fails, database enforces security
2. **Automatic Protection**: Security is enforced at the database level, not application level
3. **Granular Control**: Control access down to individual rows
4. **Audit Trail**: PostgreSQL logs can track policy enforcement

### Use Cases in Learning Path App

- Users can only see their own learning plans
- Users can only modify their own task progress
- Admin users can see all data
- Public plans can be viewed by anyone
- Private plans are only visible to the creator

## RLS with Supabase

Supabase is built on PostgreSQL and fully supports RLS. It provides:

### Built-in Authentication Functions

- `auth.uid()`: Returns the current user's UUID (or Clerk user ID when using Clerk)
- `auth.jwt()`: Returns the current JWT token
- `auth.role()`: Returns the current user's role

### Important Note for Clerk + Supabase Integration

When using **Clerk** as your authentication provider with Supabase:

- `auth.uid()` returns the **Clerk user ID** (text), not a Supabase UUID
- This affects how you design your RLS policies
- You need to either:
  1. Use Clerk IDs directly in your policies
  2. Map Clerk IDs to internal UUIDs in your policies
  3. Store Clerk IDs as primary keys in your tables

### Predefined Roles

- `anon`: Unauthenticated users
- `authenticated`: Logged-in users
- `service_role`: Backend service access (bypasses RLS)

### How Supabase RLS Works

1. User authenticates and receives a JWT token
2. JWT contains user ID and role information
3. Database queries include JWT context
4. RLS policies evaluate against JWT claims
5. Only matching rows are returned/affected

## Drizzle RLS Implementation

Drizzle ORM provides TypeScript-first RLS implementation with compile-time safety.

### Basic RLS Enablement

```typescript
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid().primaryKey(),
  email: text().notNull(),
}).enableRLS();
```

### Importing Supabase Utilities

```typescript
import {
  anonRole,
  authenticatedRole,
  serviceRole,
  authUsers,
  authUid,
} from 'drizzle-orm/supabase';
```

## Supabase Predefined Roles

### Available Roles from `drizzle-orm/supabase`

```typescript
// Anonymous/unauthenticated users
export const anonRole = pgRole('anon').existing();

// Authenticated users
export const authenticatedRole = pgRole('authenticated').existing();

// Service role (bypasses RLS, for admin operations)
export const serviceRole = pgRole('service_role').existing();

// PostgreSQL superuser role
export const postgresRole = pgRole('postgres_role').existing();

// Supabase auth admin role
export const supabaseAuthAdminRole = pgRole('supabase_auth_admin').existing();
```

### When to Use Each Role

- **`anonRole`**: Public read access (e.g., public learning plans)
- **`authenticatedRole`**: Logged-in user access (e.g., user's own data)
- **`serviceRole`**: Admin operations, data migrations, background jobs
- **`postgresRole`**: Database administration
- **`supabaseAuthAdminRole`**: Supabase auth system operations

## Policy Types and Structure

### Policy Structure

```typescript
pgPolicy('policy_name', {
  as: 'permissive' | 'restrictive', // Default: 'permissive'
  to: role, // Which role this applies to
  for: 'all' | 'select' | 'insert' | 'update' | 'delete',
  using: sql`condition`, // USING clause
  withCheck: sql`condition`, // WITH CHECK clause
});
```

### Policy Types

#### 1. **Permissive Policies** (Default)

- Allow access if ANY permissive policy matches
- Use `OR` logic between policies
- Most common type

#### 2. **Restrictive Policies**

- Must ALL pass for access to be granted
- Use `AND` logic with permissive policies
- Used for additional constraints

### Policy Commands

- **`all`**: Applies to all operations
- **`select`**: Read operations
- **`insert`**: Create operations
- **`update`**: Modify operations
- **`delete`**: Remove operations

### USING vs WITH CHECK

- **`using`**: Condition for existing rows (SELECT, UPDATE, DELETE)
- **`withCheck`**: Condition for new/modified rows (INSERT, UPDATE)

## Common RLS Patterns

### 1. User Owns Resource Pattern

When using **Clerk + Supabase**, there are different approaches depending on your schema design:

#### Pattern A: Clerk ID as Primary Key (Simple)

```typescript
import { sql } from 'drizzle-orm';
import { authenticatedRole, authUid } from 'drizzle-orm/supabase';

export const learningPlans = pgTable(
  'learning_plans',
  {
    id: text().primaryKey(), // Clerk user ID directly
    title: text().notNull(),
    // ... other fields
  },
  (table) => [
    // Users can only access their own learning plans
    pgPolicy('user_owns_learning_plan', {
      for: 'all',
      to: authenticatedRole,
      using: sql`${table.id} = ${authUid}`,
    }),
  ]
);
```

#### Pattern B: Internal UUID + Clerk ID Mapping (Recommended)

```typescript
export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  clerkUserId: text().notNull().unique(),
  email: text().notNull(),
  // ... other fields
});

export const learningPlans = pgTable(
  'learning_plans',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    // ... other fields
  },
  (table) => [
    // Users can only access their own learning plans
    // Note: auth.uid() returns Clerk user ID, so we need to lookup internal UUID
    pgPolicy('user_owns_learning_plan', {
      for: 'all',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
        SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${authUid}
      )`,
    }),
  ]
);
```

#### Pattern C: Direct Clerk ID Reference (Alternative)

```typescript
export const learningPlans = pgTable(
  'learning_plans',
  {
    id: uuid().primaryKey().defaultRandom(),
    clerkUserId: text().notNull(), // Direct reference to Clerk ID
    title: text().notNull(),
    // ... other fields
  },
  (table) => [
    // Simple direct comparison
    pgPolicy('user_owns_learning_plan', {
      for: 'all',
      to: authenticatedRole,
      using: sql`${table.clerkUserId} = ${authUid}`,
    }),
  ]
);
```

````

### 2. Public Read, Private Write Pattern

```typescript
export const learningPlans = pgTable(
  'learning_plans',
  {
    id: uuid().primaryKey(),
    userId: uuid().notNull(),
    isPublic: boolean().default(false),
    // ... other fields
  },
  (table) => [
    // Anyone can read public plans
    pgPolicy('public_plans_read', {
      for: 'select',
      to: anonRole,
      using: sql`${table.isPublic} = true`,
    }),

    // Authenticated users can read public plans
    pgPolicy('authenticated_public_read', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.isPublic} = true`,
    }),

    // Users can manage their own plans
    pgPolicy('user_manages_own_plans', {
      for: 'all',
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
  ]
);
````

### 3. Admin Access Pattern

```typescript
// Define admin role
export const adminRole = pgRole('admin');

export const learningPlans = pgTable(
  'learning_plans',
  {
    // ... fields
  },
  (table) => [
    // Admins can do anything
    pgPolicy('admin_full_access', {
      for: 'all',
      to: adminRole,
      using: sql`true`,
    }),

    // Regular user policies...
  ]
);
```

### 4. Related Data Access Pattern

```typescript
export const taskProgress = pgTable(
  'task_progress',
  {
    id: uuid().primaryKey(),
    userId: uuid().notNull(),
    taskId: uuid().notNull(),
    status: text().$type<'not_started' | 'in_progress' | 'completed'>(),
  },
  (table) => [
    // Users can only access their own progress
    pgPolicy('user_owns_progress', {
      for: 'all',
      to: authenticatedRole,
      using: sql`${table.userId} = ${authUid}`,
    }),
  ]
);
```

### 5. Complex Relationship Pattern

```typescript
export const modules = pgTable(
  'modules',
  {
    id: uuid().primaryKey(),
    planId: uuid().notNull(),
    // ... other fields
  },
  (table) => [
    // Users can access modules if they own the learning plan
    pgPolicy('user_accesses_own_plan_modules', {
      for: 'all',
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM learning_plans 
          WHERE learning_plans.id = ${table.planId} 
          AND learning_plans.user_id = ${authUid}
        )
      `,
    }),
  ]
);
```

### 6. Linking Policies to Existing Supabase Tables

```typescript
import { realtimeMessages } from 'drizzle-orm/supabase';

// Add policy to existing Supabase table
export const realtimePolicy = pgPolicy('authenticated_realtime_access', {
  for: 'insert',
  to: authenticatedRole,
  using: sql`true`,
}).link(realtimeMessages);
```

## Configuration Setup

### 1. Drizzle Config for Supabase

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
  entities: {
    roles: {
      provider: 'supabase', // Excludes Supabase system roles from management
    },
  },
});
```

### 2. Environment Variables

```bash
# .env.local
DATABASE_URL="postgresql://[user]:[password]@[host]:[port]/[database]?sslmode=require"
```

### 3. Enable Role Management (if needed)

```typescript
// drizzle.config.ts
export default defineConfig({
  // ... other config
  entities: {
    roles: true, // Enable role management
  },
});
```

## Runtime Implementation

### 1. Basic Query Execution

```typescript
// RLS policies are automatically enforced
const userPlans = await db
  .select()
  .from(learningPlans)
  .where(eq(learningPlans.userId, userId));
```

### 2. Advanced RLS Context Setting

```typescript
// Based on Drizzle SupaSecureSlack example
type SupabaseToken = {
  iss?: string;
  sub?: string; // User ID
  aud?: string[] | string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  role?: string; // Database role
};

export function createDrizzle(
  token: SupabaseToken,
  { admin, client }: { admin: PgDatabase<any>; client: PgDatabase<any> }
) {
  return {
    admin,
    rls: (async (transaction, ...rest) => {
      return await client.transaction(
        async (tx) => {
          try {
            // Set Supabase context
            await tx.execute(sql`
            -- Set JWT claims for auth.jwt()
            select set_config('request.jwt.claims', '${sql.raw(
              JSON.stringify(token)
            )}', TRUE);
            
            -- Set user ID for auth.uid()
            select set_config('request.jwt.claim.sub', '${sql.raw(
              token.sub ?? ''
            )}', TRUE);
            
            -- Set database role
            set local role ${sql.raw(token.role ?? 'anon')};
          `);

            return await transaction(tx);
          } finally {
            // Reset context
            await tx.execute(sql`
            select set_config('request.jwt.claims', NULL, TRUE);
            select set_config('request.jwt.claim.sub', NULL, TRUE);
            reset role;
          `);
          }
        },
        ...rest
      );
    }) as typeof client.transaction,
  };
}
```

### 3. Usage with Supabase Client

```typescript
import { createClient } from '@supabase/supabase-js';
import { decode } from 'jsonwebtoken';

export async function createDrizzleSupabaseClient() {
  const {
    data: { session },
  } = await createClient().auth.getSession();

  return createDrizzle(decode(session?.access_token ?? ''), {
    admin,
    client,
  });
}

// Usage
async function getUserPlans() {
  const db = await createDrizzleSupabaseClient();
  return db.rls((tx) => tx.select().from(learningPlans));
}
```

## Best Practices

### 1. **Start Simple**

- Begin with basic user ownership patterns
- Add complexity gradually as needed
- Test policies thoroughly

### 2. **Policy Naming**

- Use descriptive names: `user_owns_learning_plan`
- Include operation: `admin_delete_any_plan`
- Be consistent across your schema

### 3. **Performance Considerations**

- RLS policies add WHERE clauses to queries
- Index columns used in policies
- Consider query performance impact

### 4. **Security**

- Always use parameterized queries in policies
- Avoid SQL injection in policy conditions
- Test with different user contexts

### 5. **Development vs Production**

- Use service role for admin operations
- Test RLS with actual user tokens
- Monitor policy performance

### 6. **Error Handling**

- RLS violations return empty results (not errors)
- Log unexpected empty results
- Provide meaningful user feedback

## Troubleshooting

### 1. **No Rows Returned**

```sql
-- Check if RLS is enabled
SELECT schemaname, tablename, rowsecurity, forcerls
FROM pg_tables
WHERE tablename = 'your_table';

-- Check active policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'your_table';
```

### 2. **Policy Not Working**

- Verify user authentication
- Check JWT token claims
- Test policy condition manually
- Ensure role matches policy target

### 3. **Performance Issues**

- Add indexes on policy condition columns
- Simplify complex policy conditions
- Consider denormalizing for performance

### 4. **Development Testing**

```typescript
// Bypass RLS for testing (use service role)
const adminDb = drizzle(adminConnection);

// Test with specific user context
const userDb = createDrizzle(testUserToken, { admin: adminDb, client: userDb });
```

### 5. **Common Mistakes**

- Forgetting to enable RLS on tables
- Using wrong role in policy
- Not setting proper JWT context
- Missing indexes on policy columns

## Learning Path App Specific Patterns

### Clerk + Supabase Authentication Integration

Our Learning Path App uses Clerk for authentication with Supabase as the database. This requires specific RLS patterns:

#### User Table Structure

```typescript
export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(), // Internal UUID
    clerkUserId: text().notNull().unique(), // Clerk's user ID
    email: text().notNull(),
    // ... other fields
  },
  (table) => [
    // RLS Policy: Users can only access their own record
    pgPolicy('users_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.clerkUserId} = ${authUid}`, // Compare with Clerk ID
    }),
  ]
);
```

#### Related Data Access Pattern

```typescript
export const learningPlans = pgTable(
  'learning_plans',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id), // References internal UUID
    // ... other fields
  },
  (table) => [
    // RLS Policy: Users can access plans they own
    pgPolicy('learning_plans_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${table.userId} IN (
      SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${authUid}
    )`, // Lookup internal UUID from Clerk ID
    }),
  ]
);
```

#### Key Patterns for Clerk Integration

1. **Direct Clerk ID Comparison**: When the table stores `clerk_user_id`

   ```sql
   ${table.clerkUserId} = ${authUid}
   ```

2. **Internal UUID Lookup**: When the table references internal UUIDs

   ```sql
   ${table.userId} IN (
     SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${authUid}
   )
   ```

3. **Complex Relationship Policies**: For related data access
   ```sql
   EXISTS (
     SELECT 1 FROM ${learningPlans}
     WHERE ${learningPlans.id} = ${table.planId}
     AND ${learningPlans.userId} IN (
       SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${authUid}
     )
   )
   ```

### User Data Isolation

```typescript
// Users can only access their own data
export const userDataPolicy = {
  for: 'all' as const,
  to: authenticatedRole,
  using: sql`${table.clerkUserId} = ${authUid}`, // For tables with clerk_user_id
  // OR
  using: sql`${table.userId} IN (
    SELECT id FROM ${users} WHERE ${users.clerkUserId} = ${authUid}
  )`, // For tables with internal user_id references
};
```

````

### Public vs Private Plans

```typescript
// Public plans readable by all, private only by owner
export const planVisibilityPolicies = [
  pgPolicy('public_plans_read', {
    for: 'select',
    to: anonRole,
    using: sql`is_public = true`,
  }),
  pgPolicy('owner_full_access', {
    for: 'all',
    to: authenticatedRole,
    using: sql`user_id = auth.uid()`,
  }),
];
````

### Progress Tracking

```typescript
// Task progress belongs to specific users
export const progressPolicy = pgPolicy('user_progress_access', {
  for: 'all',
  to: authenticatedRole,
  using: sql`user_id = auth.uid()`,
});
```
