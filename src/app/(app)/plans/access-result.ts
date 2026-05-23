export type AccessErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR';

export type AccessError = {
  code: AccessErrorCode;
  message: string;
};

export type AccessResult<T> =
  | { success: true; data: T }
  | { success: false; error: AccessError };

export function accessSuccess<T>(data: T): AccessResult<T> {
  return { success: true, data };
}

export function accessError(
  code: AccessErrorCode,
  message: string,
): AccessResult<never> {
  return { success: false, error: { code, message } };
}

export function isAccessSuccess<T>(
  result: AccessResult<T>,
): result is { success: true; data: T } {
  return result.success === true;
}

export function getAccessError<T>(result: AccessResult<T>): AccessError {
  if (result.success === false) {
    return result.error;
  }
  throw new Error('Cannot get error from successful result');
}
