/**
 * Database Client Entry Point
 *
 * This is the main entry point for database access in the application.
 * By default, this module exports RLS-enforced clients for security.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * DEFAULT EXPORTS (RLS-enforced):
 * ═══════════════════════════════════════════════════════════════════════
 * These clients enforce Row Level Security and should be used in:
 * - API routes (src/app/api/...)
 * - Server actions (src/app/.../actions.ts)
 * - Request handlers (src/lib/api/...)
 * - Any code that handles user requests
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SERVICE ROLE CLIENT (RLS-bypassed):
 * ═══════════════════════════════════════════════════════════════════════
 * For workers, migrations, and administrative tasks, explicitly import:
 * import { serviceRoleDb } from '@/lib/db/service-role';
 *
 * See src/lib/db/service-role.ts for usage guidelines and warnings.
 */

// ============================================================================
// RLS-ENFORCED CLIENTS (DEFAULT)
// ============================================================================
export { createAuthenticatedRlsClient, createAnonymousRlsClient } from './rls';

// ============================================================================
// SCHEMA AND TYPES
// ============================================================================
export * from './schema';
export * from './enums';

// ============================================================================
// QUERY UTILITIES
// ============================================================================
export * from './queries';
