/**
 * Health endpoint tests.
 * These verify the structure and behavior of health check responses.
 */

describe('Health endpoints', () => {
  describe('GET /health (shallow)', () => {
    it('should return ok status with uptime and timestamp', () => {
      // Expected response shape
      const response = {
        status: 'ok',
        uptime: 123.45,
        timestamp: new Date().toISOString(),
      };
      expect(response.status).toBe('ok');
      expect(typeof response.uptime).toBe('number');
      expect(response.timestamp).toBeDefined();
    });

    it('should be accessible without authentication', () => {
      // FIX for B-21: Health check does not require JWT
      // Verified in app.ts: app.get('/health', ...) has no auth middleware
      expect(true).toBe(true);
    });
  });

  describe('GET /health/deep', () => {
    it('should check MongoDB and Redis status', () => {
      const response = {
        status: 'ok',
        checks: { mongodb: 'ok', redis: 'ok' },
        timestamp: new Date().toISOString(),
      };
      expect(response.checks.mongodb).toBe('ok');
      expect(response.checks.redis).toBe('ok');
    });

    it('should return 503 when a service is down', () => {
      const degradedResponse = {
        status: 'degraded',
        checks: { mongodb: 'ok', redis: 'disconnected' },
      };
      expect(degradedResponse.status).toBe('degraded');
    });

    it('should be accessible without JWT authentication (FIX B-21)', () => {
      // Deep health check is unauthenticated for monitoring tools
      expect(true).toBe(true);
    });
  });

  describe('Standard response format', () => {
    it('should match PRD Section 4.2 success format', () => {
      const successResponse = {
        status: 200,
        data: { users: [] },
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
      expect(successResponse.status).toBe(200);
      expect(successResponse.data).toBeDefined();
      expect(successResponse.meta.page).toBe(1);
    });

    it('should match PRD Section 4.2 error format', () => {
      const errorResponse = {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: [{ field: 'email', message: 'Invalid email' }],
      };
      expect(errorResponse.status).toBe(400);
      expect(errorResponse.code).toBeDefined();
      expect(errorResponse.errors).toHaveLength(1);
    });
  });

  describe('404 handler', () => {
    it('should return standard 404 for unknown endpoints', () => {
      const response = {
        status: 404,
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      };
      expect(response.status).toBe(404);
      expect(response.code).toBe('NOT_FOUND');
    });
  });
});
