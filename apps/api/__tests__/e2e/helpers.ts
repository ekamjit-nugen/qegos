/**
 * E2E Test Helpers
 *
 * Provides a lightweight Express app with auth middleware for E2E testing.
 * Does NOT require MongoDB/Redis — uses mocked models and in-memory state.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import type { RequestHandler } from 'express';

// ─── Simulated JWT Auth ─────────────────────────────────────────────────────

export interface MockUser {
  userId: string;
  userType: number;
  roleId: string;
  firstName: string;
  lastName: string;
  email: string;
}

export const MOCK_USERS: Record<string, MockUser> = {
  superadmin: {
    userId: '670000000000000000000001',
    userType: 1,
    roleId: '660000000000000000000001',
    firstName: 'Super',
    lastName: 'Admin',
    email: 'superadmin@qegos.com.au',
  },
  admin: {
    userId: '670000000000000000000002',
    userType: 1,
    roleId: '660000000000000000000002',
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@qegos.com.au',
  },
  staff: {
    userId: '670000000000000000000003',
    userType: 1,
    roleId: '660000000000000000000005',
    firstName: 'Staff',
    lastName: 'Member',
    email: 'staff@qegos.com.au',
  },
  client: {
    userId: '670000000000000000000010',
    userType: 2,
    roleId: '660000000000000000000006',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
  },
};

/**
 * Create a mock authenticate middleware that injects a user into the request.
 * Pass the user key to specify which mock user to authenticate as.
 */
export function mockAuthenticate(userKey: string = 'superadmin'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = MOCK_USERS[userKey];
    if (user) {
      (req as unknown as Record<string, unknown>).user = user;
    }
    next();
  };
}

/**
 * Create a mock checkPermission middleware that always allows.
 * For permission-denied tests, use mockDenyPermission().
 */
export function mockCheckPermission(): (_resource: string, _action: string) => RequestHandler {
  return (_resource: string, _action: string): RequestHandler => {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  };
}

/**
 * Create a mock checkPermission middleware that always denies.
 */
export function mockDenyPermission(): (_resource: string, _action: string) => RequestHandler {
  return (_resource: string, _action: string): RequestHandler => {
    return (_req: Request, res: Response): void => {
      res.status(403).json({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    };
  };
}

/**
 * Mock audit log that captures log entries for assertion.
 */
export interface CapturedAuditEntry {
  action: string;
  resource: string;
  resourceId: string;
  description: string;
}

export function createMockAuditLog(): {
  log: (...args: unknown[]) => Promise<void>;
  logFromRequest: (req: unknown, data: Record<string, unknown>) => Promise<void>;
  entries: CapturedAuditEntry[];
} {
  const entries: CapturedAuditEntry[] = [];
  return {
    log: async (..._args: unknown[]): Promise<void> => {
      // no-op
    },
    logFromRequest: async (_req: unknown, data: Record<string, unknown>): Promise<void> => {
      entries.push({
        action: data.action as string,
        resource: data.resource as string,
        resourceId: data.resourceId as string,
        description: data.description as string,
      });
    },
    entries,
  };
}

// ─── Express App Factory ────────────────────────────────────────────────────

/**
 * Create a minimal Express app for E2E testing.
 * Includes JSON parsing, error handler, but no auth/rate-limiting/CSRF.
 */
export function createTestApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  return app;
}

/**
 * Add a global error handler to the test app.
 * Must be called AFTER mounting routes.
 */
export function addErrorHandler(app: express.Express): void {
  // 404
  app.use((_req: Request, res: Response): void => {
    res.status(404).json({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
    const statusCode = (err as unknown as { statusCode?: number }).statusCode ?? 500;
    res.status(statusCode).json({
      status: statusCode,
      code: (err as unknown as { code?: string }).code ?? 'INTERNAL_ERROR',
      message: err.message,
    });
  });
}
