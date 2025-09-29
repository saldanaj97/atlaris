/**
 * Standardized error handling system for the application
 *
 * This module re-exports the error handling utilities from @/lib/api/errors
 * to provide a consistent interface across the application.
 */

export {
  AppError,
  AttemptCapExceededError,
  AuthError,
  ConflictError,
  createGenerationError,
  createNotFoundError,
  createValidationError,
  ErrorCodes,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  toErrorResponse,
  ValidationError,
  type ErrorCode,
} from '@/lib/api/errors';

/**
 * API Error interface for client-side error responses
 */
export interface ApiError {
  error: string;
  code: string;
  timestamp: string;
  details?: Record<string, unknown>;
  classification?: string;
}
