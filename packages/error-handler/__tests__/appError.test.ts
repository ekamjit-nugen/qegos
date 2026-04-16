import { AppError, ErrorCode } from '../src';

describe('AppError', () => {
  describe('constructor', () => {
    it('should create an error with all properties', () => {
      const error = new AppError({
        statusCode: 400,
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Test error',
        errors: [{ field: 'email', message: 'Invalid email' }],
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Test error');
      expect(error.errors).toHaveLength(1);
      expect(error.isOperational).toBe(true);
    });

    it('should default isOperational to true', () => {
      const error = new AppError({
        statusCode: 500,
        code: 'ERROR',
        message: 'fail',
      });
      expect(error.isOperational).toBe(true);
    });

    it('should allow setting isOperational to false', () => {
      const error = new AppError({
        statusCode: 500,
        code: 'ERROR',
        message: 'crash',
        isOperational: false,
      });
      expect(error.isOperational).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should serialize to standard error response format', () => {
      const error = AppError.badRequest('Invalid input', [{ field: 'name', message: 'Required' }]);
      const json = error.toJSON();

      expect(json).toEqual({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        errors: [{ field: 'name', message: 'Required' }],
      });
    });

    it('should omit errors field when empty', () => {
      const error = AppError.notFound('User');
      const json = error.toJSON();

      expect(json).not.toHaveProperty('errors');
    });
  });

  describe('factory methods', () => {
    it('badRequest returns 400 with VALIDATION_ERROR code', () => {
      const error = AppError.badRequest('Bad input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('unauthorized returns 401 with UNAUTHORIZED code', () => {
      const error = AppError.unauthorized();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('invalidCredentials returns 401 with INVALID_CREDENTIALS code', () => {
      const error = AppError.invalidCredentials();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    });

    it('tokenExpired returns 401 with TOKEN_EXPIRED code', () => {
      const error = AppError.tokenExpired();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ErrorCode.TOKEN_EXPIRED);
    });

    it('forbidden returns 403 with FORBIDDEN code', () => {
      const error = AppError.forbidden();
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(ErrorCode.FORBIDDEN);
      expect(error.message).toBe('Insufficient permissions');
    });

    it('notFound returns 404 with resource name in message', () => {
      const error = AppError.notFound('Order');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Order not found');
    });

    it('conflict returns 409', () => {
      const error = AppError.conflict('Already exists');
      expect(error.statusCode).toBe(409);
    });

    it('rateLimited returns 429', () => {
      const error = AppError.rateLimited();
      expect(error.statusCode).toBe(429);
    });

    it('internal returns 500 with isOperational=false', () => {
      const error = AppError.internal();
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('ErrorCode enum', () => {
    it('should have all required error codes from PRD Section 4.3', () => {
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCode.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
      expect(ErrorCode.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.CONFLICT).toBe('CONFLICT');
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCode.GATEWAY_ERROR).toBe('GATEWAY_ERROR');
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
    });
  });
});
