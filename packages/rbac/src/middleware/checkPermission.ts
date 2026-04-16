import type { Response, NextFunction, RequestHandler } from 'express';
import type { Model } from 'mongoose';
import type Redis from 'ioredis';
import { AppError } from '@nugen/error-handler';
import type {
  IRoleDocument,
  PermissionAction,
  AuthenticatedRbacRequest,
  RbacConfig,
} from '../types';

const DEFAULT_CACHE_TTL = 300; // 5 minutes (RBAC-INV-11)

let _RoleModel: Model<IRoleDocument> | null = null;
let _redisClient: Redis | null = null;
let _config: RbacConfig = {};

export function initCheckPermission(
  RoleModel: Model<IRoleDocument>,
  redisClient?: Redis,
  config?: RbacConfig,
): void {
  _RoleModel = RoleModel;
  _redisClient = redisClient ?? null;
  _config = config ?? {};
}

/**
 * Get role from Redis cache or MongoDB.
 * Uses GET/SET instead of KEYS (FIX for Vegeta S-5: KEYS is O(N) and blocks Redis).
 */
async function getRoleById(roleId: string): Promise<IRoleDocument | null> {
  const cacheKey = `role:${roleId}`;
  const ttl = _config.cacheTtl ?? DEFAULT_CACHE_TTL;

  // Try cache first
  if (_redisClient) {
    try {
      const cached = await _redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as IRoleDocument;
      }
    } catch {
      // Cache miss or error — fall through to DB
    }
  }

  // Fetch from DB
  if (!_RoleModel) {
    throw new Error('RBAC not initialized. Call initCheckPermission first.');
  }
  const role = await _RoleModel.findById(roleId).lean<IRoleDocument>();
  if (!role) {
    return null;
  }

  // Cache the result
  if (_redisClient) {
    try {
      await _redisClient.set(cacheKey, JSON.stringify(role), 'EX', ttl);
    } catch {
      // Cache write failure is non-fatal
    }
  }

  return role;
}

/**
 * Invalidate the cache for a specific role.
 * FIX for Vegeta S-5: Uses DEL on specific key, not KEYS scan.
 */
export async function invalidateRoleCache(roleId: string): Promise<void> {
  if (_redisClient) {
    try {
      await _redisClient.del(`role:${roleId}`);
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Invalidate all role caches by incrementing a version prefix.
 * FIX for Vegeta S-5: Uses SCAN iterator instead of KEYS command.
 */
export async function invalidateAllRoleCaches(): Promise<void> {
  if (!_redisClient) {
    return;
  }

  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await _redisClient.scan(cursor, 'MATCH', 'role:*', 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await _redisClient.del(...keys);
      }
    } while (cursor !== '0');
  } catch {
    // Non-fatal
  }
}

/**
 * RBAC middleware: checkPermission(resource, action).
 *
 * Flow per PRD Section 2.5:
 * 1. Extract userId, roleId from req.user (set by auth middleware)
 * 2. Fetch role (cache → DB)
 * 3. Find permission for resource
 * 4. Check action is allowed
 * 5. Based on scope, inject query filter to req.scopeFilter
 * 6. 403 is identical regardless of resource existence (RBAC-INV-08)
 */
export function check(resource: string, action: PermissionAction): RequestHandler {
  return async (req, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRbacRequest;
      if (!authReq.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const { userId, roleId } = authReq.user;
      const role = await getRoleById(roleId);

      if (!role) {
        throw AppError.forbidden('Insufficient permissions');
      }

      // RBAC-INV-12: Disabled role = zero permissions
      if (!role.isActive) {
        throw AppError.forbidden('Insufficient permissions');
      }

      // Find permission for the requested resource
      const permission = role.permissions.find((p) => p.resource === resource);
      if (!permission) {
        throw AppError.forbidden('Insufficient permissions');
      }

      // Check if the requested action is allowed
      if (!permission.actions.includes(action)) {
        throw AppError.forbidden('Insufficient permissions');
      }

      // Inject scope filter based on permission scope
      switch (permission.scope) {
        case 'all':
          authReq.scopeFilter = {};
          break;
        case 'assigned':
          authReq.scopeFilter = {
            $or: [{ assignedTo: userId }, { processingBy: userId }],
          };
          break;
        case 'own':
          authReq.scopeFilter = { userId };
          break;
        case 'none':
          throw AppError.forbidden('Insufficient permissions');
        default:
          throw AppError.forbidden('Insufficient permissions');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
