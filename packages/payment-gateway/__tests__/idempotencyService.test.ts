import {
  initIdempotencyService,
  checkIdempotencyKey,
  storeIdempotencyResponse,
  removeIdempotencyKey,
} from '../src/services/idempotencyService';
import type { IdempotencyCachedResponse } from '../src/types';

// ─── Redis Mock ──────────────────────────────────────────────────────────────

const store: Map<string, { value: string; expiresAt: number }> = new Map();

const mockRedis = {
  get: jest.fn(async (key: string): Promise<string | null> => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }),
  set: jest.fn(async (key: string, value: string, _mode: string, ttl: number): Promise<string> => {
    store.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
    return 'OK';
  }),
  del: jest.fn(async (key: string): Promise<number> => {
    return store.delete(key) ? 1 : 0;
  }),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IdempotencyService', () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
    initIdempotencyService(mockRedis as never);
  });

  describe('checkIdempotencyKey', () => {
    it('should return null for a new key (PAY-INV-01)', async () => {
      const result = await checkIdempotencyKey('new-key-uuid');
      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith('idempotency:new-key-uuid');
    });

    it('should return cached response for duplicate key (PAY-INV-01)', async () => {
      const cachedResponse: IdempotencyCachedResponse = {
        statusCode: 201,
        body: { status: 201, data: { paymentId: '123' } },
        createdAt: Date.now(),
      };

      await storeIdempotencyResponse('dup-key', cachedResponse);

      const result = await checkIdempotencyKey('dup-key');
      expect(result).not.toBeNull();
      expect(result?.statusCode).toBe(201);
      expect(result?.body).toEqual(cachedResponse.body);
    });
  });

  describe('storeIdempotencyResponse', () => {
    it('should store response with 24hr TTL', async () => {
      const response: IdempotencyCachedResponse = {
        statusCode: 200,
        body: { status: 200, data: {} },
        createdAt: Date.now(),
      };

      await storeIdempotencyResponse('store-key', response);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'idempotency:store-key',
        expect.any(String),
        'EX',
        86400, // 24 hours
      );
    });
  });

  describe('removeIdempotencyKey', () => {
    it('should remove the key from Redis', async () => {
      const response: IdempotencyCachedResponse = {
        statusCode: 200,
        body: { status: 200, data: {} },
        createdAt: Date.now(),
      };
      await storeIdempotencyResponse('remove-key', response);

      await removeIdempotencyKey('remove-key');

      const result = await checkIdempotencyKey('remove-key');
      expect(result).toBeNull();
    });
  });

  describe('expired key behavior', () => {
    it('should return null for expired key (>24hr), treating it as new', async () => {
      // Manually insert an expired entry
      store.set('idempotency:expired-key', {
        value: JSON.stringify({
          statusCode: 200,
          body: { status: 200 },
          createdAt: Date.now() - 90000000, // 25 hours ago
        }),
        expiresAt: Date.now() - 1000, // Already expired
      });

      const result = await checkIdempotencyKey('expired-key');
      expect(result).toBeNull();
    });
  });
});
