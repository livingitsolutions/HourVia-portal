export type ErrorCode = 'DISABLED' | 'UNAUTHENTICATED' | 'INVALID_SESSION' | 'EXPIRED' | 'REVOKED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'INVALID_STATE' | 'OWNER_REQUIRED' | 'CONFLICT' | 'UNAVAILABLE' | 'NOT_FOUND';
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorCode };
export const success = <T>(value: T): Result<T> => ({ ok: true, value });
export const failure = (error: ErrorCode): Result<never> => ({ ok: false, error });
