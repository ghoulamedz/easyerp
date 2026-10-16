/**
 * Maps failures to responses.
 *
 * A `DomainError` carries its own status and reaches the client as a small,
 * specific message. Anything else is logged in full and returned as a bare 500:
 * the legacy API turned every `RuntimeException` into a 400 with the raw message,
 * which both mislabelled server faults as client errors and leaked internals.
 */

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { DomainError } from './errors.js';

export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const body = this.toBody(exception, request);

    if (body.error.code === 'INTERNAL_ERROR') {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // An HttpException names its own status; the body code (`REQUEST_FAILED`)
    // carries no status, so mapping it back through `statusOf` would answer
    // every such failure with the wrong one (500).
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : body.error.code === 'INTERNAL_ERROR'
          ? 500
          : statusOf(body.error.code);

    response.status(status).json(body);
  }

  private toBody(exception: unknown, request: Request): ErrorBody {
    if (exception instanceof DomainError) {
      return {
        error: {
          code: exception.code,
          message: exception.message,
          ...(Object.keys(exception.details).length > 0 ? { details: exception.details } : {}),
        },
      };
    }

    if (exception instanceof ZodError) {
      return {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body did not match the expected shape',
          details: {
            issues: exception.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        error: {
          code: status === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED',
          message: exception.message,
        },
      };
    }

    void request;
    return { error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed' } };
  }
}

function statusOf(code: string): number {
  const known: Readonly<Record<string, number>> = {
    NOT_FOUND: 404,
    VALIDATION_FAILED: 422,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    CONFLICT: 409,
    ILLEGAL_TRANSITION: 409,
    INSUFFICIENT_STOCK: 409,
  };
  return known[code] ?? 500;
}
