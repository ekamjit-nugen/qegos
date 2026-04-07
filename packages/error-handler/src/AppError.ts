import { ErrorCode, type AppErrorOptions, type FieldError } from './types';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly errors?: FieldError[];
  public readonly isOperational: boolean;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.errors = options.errors;
    this.isOperational = options.isOperational ?? true;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  public toJSON(): { status: number; code: string; message: string; errors?: FieldError[] } {
    const response: { status: number; code: string; message: string; errors?: FieldError[] } = {
      status: this.statusCode,
      code: this.code,
      message: this.message,
    };
    if (this.errors && this.errors.length > 0) {
      response.errors = this.errors;
    }
    return response;
  }

  static badRequest(message: string, errors?: FieldError[]): AppError {
    return new AppError({
      statusCode: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message,
      errors,
    });
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError({
      statusCode: 401,
      code: ErrorCode.UNAUTHORIZED,
      message,
    });
  }

  static invalidCredentials(message = 'Invalid credentials'): AppError {
    return new AppError({
      statusCode: 401,
      code: ErrorCode.INVALID_CREDENTIALS,
      message,
    });
  }

  static tokenExpired(message = 'Token has expired'): AppError {
    return new AppError({
      statusCode: 401,
      code: ErrorCode.TOKEN_EXPIRED,
      message,
    });
  }

  static forbidden(message = 'Insufficient permissions'): AppError {
    return new AppError({
      statusCode: 403,
      code: ErrorCode.FORBIDDEN,
      message,
    });
  }

  static notFound(resource = 'Resource'): AppError {
    return new AppError({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
      message: `${resource} not found`,
    });
  }

  static conflict(message: string): AppError {
    return new AppError({
      statusCode: 409,
      code: ErrorCode.CONFLICT,
      message,
    });
  }

  static rateLimited(message = 'Too many requests. Please try again later.'): AppError {
    return new AppError({
      statusCode: 429,
      code: ErrorCode.RATE_LIMITED,
      message,
    });
  }

  static gatewayError(message = 'External service error'): AppError {
    return new AppError({
      statusCode: 502,
      code: ErrorCode.GATEWAY_ERROR,
      message,
    });
  }

  static serviceUnavailable(message = 'Service temporarily unavailable'): AppError {
    return new AppError({
      statusCode: 503,
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message,
    });
  }

  static internal(message = 'An unexpected error occurred'): AppError {
    return new AppError({
      statusCode: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message,
      isOperational: false,
    });
  }
}
