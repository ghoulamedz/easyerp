/**
 * Domain failures.
 *
 * A `DomainError` carries the HTTP status it maps to, so a rule violation in the
 * domain layer never has to know about HTTP, and an unexpected failure is never
 * dressed up as one: `invariant` distinguishes "the data is wrong" (409/422)
 * from "the code is wrong" (500).
 */

export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'ILLEGAL_TRANSITION'
  | 'INSUFFICIENT_STOCK'
  | 'INVARIANT_VIOLATION';

const STATUS_BY_CODE: Readonly<Record<DomainErrorCode, number>> = {
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  ILLEGAL_TRANSITION: 409,
  INSUFFICIENT_STOCK: 409,
  INVARIANT_VIOLATION: 500,
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly status: number;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function notFound(entity: string, id: string): DomainError {
  return new DomainError('NOT_FOUND', `${entity} ${id} was not found`, { entity, id });
}

export function validationFailed(
  message: string,
  details: Record<string, unknown> = {},
): DomainError {
  return new DomainError('VALIDATION_FAILED', message, details);
}

export function forbidden(message: string): DomainError {
  return new DomainError('FORBIDDEN', message);
}

export function unauthorized(message = 'Authentication is required'): DomainError {
  return new DomainError('UNAUTHORIZED', message);
}

/** A state change that would contradict data already committed. */
export function conflict(message: string, details: Record<string, unknown> = {}): DomainError {
  return new DomainError('CONFLICT', message, details);
}

/** A state change the Document transition table does not allow (ADR 0006). */
export function illegalTransition(from: string, to: string, entity = 'Document'): DomainError {
  return new DomainError('ILLEGAL_TRANSITION', `${entity} cannot move from ${from} to ${to}`, {
    from,
    to,
  });
}

/**
 * A rule the code guarantees. A violation means the code is wrong, so it is a
 * 500 with the message kept for the log — never shown to a client verbatim.
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new DomainError('INVARIANT_VIOLATION', message);
  }
}
