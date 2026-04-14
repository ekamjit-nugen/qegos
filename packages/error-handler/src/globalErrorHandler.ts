import type { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError';
import { ErrorCode } from './types';
import type { Logger } from './types';

interface MongooseValidationError extends Error {
  name: 'ValidationError';
  errors: Record<string, { message: string; path: string }>;
}

interface MongooseCastError extends Error {
  name: 'CastError';
  path: string;
  value: unknown;
}

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue: Record<string, unknown>;
}

interface JsonWebTokenError extends Error {
  name: 'JsonWebTokenError' | 'TokenExpiredError';
}

function isMongooseValidationError(err: Error): err is MongooseValidationError {
  return err.name === 'ValidationError' && 'errors' in err;
}

function isMongooseCastError(err: Error): err is MongooseCastError {
  return err.name === 'CastError';
}

function isMongoDuplicateKeyError(err: Error): err is MongoDuplicateKeyError {
  return 'code' in err && (err as MongoDuplicateKeyError).code === 11000;
}

function isJwtError(err: Error): err is JsonWebTokenError {
  return err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError';
}

let _logger: Logger | null = null;

export function setErrorLogger(logger: Logger): void {
  _logger = logger;
}

function logError(message: string, meta?: Record<string, unknown>): void {
  if (_logger) {
    _logger.error(message, meta);
  } else {
    console.error(message, meta); // eslint-disable-line no-console
  }
}

/**
 * Global Express error handler middleware.
 * Handles Mongoose validation/cast/duplicate errors, JWT errors,
 * and AppError instances. Strips stack traces in production (SEC-INV-13).
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Extract requestId from request (set by requestId middleware)
  const requestId = (req as unknown as { requestId?: string }).requestId;

  // If already an AppError, use it directly
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logError('Non-operational error', { message: err.message, stack: err.stack, requestId });
    }
    const json = err.toJSON();
    if (requestId) (json as Record<string, unknown>).requestId = requestId;
    res.status(err.statusCode).json(json);
    return;
  }

  // Mongoose ValidationError
  if (isMongooseValidationError(err)) {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    res.status(400).json({
      status: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      errors,
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  // Mongoose CastError (invalid ObjectId, etc.)
  if (isMongooseCastError(err)) {
    res.status(400).json({
      status: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: `Invalid value for ${err.path}`,
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  // MongoDB duplicate key error
  if (isMongoDuplicateKeyError(err)) {
    const field = Object.keys(err.keyValue)[0] || 'field';
    res.status(409).json({
      status: 409,
      code: ErrorCode.CONFLICT,
      message: `Duplicate value for ${field}`,
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  // JWT errors
  if (isJwtError(err)) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        status: 401,
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Token has expired',
        ...(requestId ? { requestId } : {}),
      });
      return;
    }
    res.status(401).json({
      status: 401,
      code: ErrorCode.UNAUTHORIZED,
      message: 'Invalid token',
      ...(requestId ? { requestId } : {}),
    });
    return;
  }

  // Unknown/unexpected error — log full details, return generic message (SEC-INV-13)
  logError('Unhandled error', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    requestId,
  });

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    status: 500,
    code: ErrorCode.INTERNAL_ERROR,
    message: isProduction ? 'An unexpected error occurred' : err.message,
    ...(requestId ? { requestId } : {}),
  });
}
