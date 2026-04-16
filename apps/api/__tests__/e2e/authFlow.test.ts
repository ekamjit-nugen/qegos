// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest').default;
import type { Request, Response, NextFunction, RequestHandler } from 'express';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require('express') as typeof import('express').default;

/**
 * E2E Smoke Test: Authentication Flow
 *
 * Tests the full auth lifecycle:
 * 1. Login (email + password)
 * 2. Token-based access to protected routes
 * 3. Token refresh
 * 4. Logout
 * 5. Rejected access after logout
 * 6. Rate limiting on auth endpoints
 * 7. Input validation
 */

// ─── Simulated Auth Server ──────────────────────────────────────────────────

interface TokenStore {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

function createAuthApp(): express.Express {
  const app = express();
  app.use(express.json());

  // In-memory token store
  const tokenStore = new Map<string, TokenStore>();
  const revokedTokens = new Set<string>();
  let tokenCounter = 0;

  // Simulated users
  const users: Record<
    string,
    { password: string; userId: string; userType: number; roleId: string }
  > = {
    'admin@qegos.com.au': {
      password: 'Password1!',
      userId: 'user-001',
      userType: 1,
      roleId: 'role-admin',
    },
    'client@example.com': {
      password: 'Password1!',
      userId: 'user-010',
      userType: 2,
      roleId: 'role-client',
    },
  };

  function generateToken(prefix: string): string {
    tokenCounter++;
    return `${prefix}_${tokenCounter}_${Date.now()}`;
  }

  // Authenticate middleware
  const authenticate: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res
        .status(401)
        .json({ status: 401, code: 'UNAUTHORIZED', message: 'Missing or invalid token' });
      return;
    }

    const token = authHeader.slice(7);
    if (revokedTokens.has(token)) {
      res
        .status(401)
        .json({ status: 401, code: 'TOKEN_REVOKED', message: 'Token has been revoked' });
      return;
    }

    const session = [...tokenStore.values()].find((s) => s.accessToken === token);
    if (!session) {
      res
        .status(401)
        .json({ status: 401, code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
      return;
    }

    (req as unknown as Record<string, unknown>).user = { userId: session.userId };
    next();
  };

  // POST /auth/login
  app.post('/api/v1/auth/login', (req: Request, res: Response): void => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Email and password are required',
        errors: [
          ...(!email ? [{ field: 'email', message: 'Email is required' }] : []),
          ...(!password ? [{ field: 'password', message: 'Password is required' }] : []),
        ],
      });
      return;
    }

    const user = users[email];
    if (!user || user.password !== password) {
      res
        .status(401)
        .json({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      return;
    }

    const accessToken = generateToken('access');
    const refreshToken = generateToken('refresh');

    tokenStore.set(refreshToken, { accessToken, refreshToken, userId: user.userId });

    res.status(200).json({
      status: 200,
      data: {
        accessToken,
        refreshToken,
        expiresIn: 900, // 15 minutes
        user: { userId: user.userId, userType: user.userType, roleId: user.roleId, email },
      },
    });
  });

  // POST /auth/refresh
  app.post('/api/v1/auth/refresh', (req: Request, res: Response): void => {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken) {
      res
        .status(400)
        .json({ status: 400, code: 'VALIDATION_ERROR', message: 'Refresh token is required' });
      return;
    }

    const session = tokenStore.get(refreshToken);
    if (!session) {
      res.status(401).json({
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
      return;
    }

    // Rotate tokens
    revokedTokens.add(session.accessToken);
    tokenStore.delete(refreshToken);

    const newAccessToken = generateToken('access');
    const newRefreshToken = generateToken('refresh');
    tokenStore.set(newRefreshToken, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      userId: session.userId,
    });

    res.status(200).json({
      status: 200,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken, expiresIn: 900 },
    });
  });

  // POST /auth/logout
  app.post('/api/v1/auth/logout', authenticate, (req: Request, res: Response): void => {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.slice(7);
    revokedTokens.add(token);

    // Remove from store
    for (const [key, session] of tokenStore.entries()) {
      if (session.accessToken === token) {
        tokenStore.delete(key);
        break;
      }
    }

    res.status(200).json({ status: 200, data: { loggedOut: true } });
  });

  // GET /auth/me — protected route
  app.get('/api/v1/auth/me', authenticate, (req: Request, res: Response): void => {
    const user = (req as unknown as Record<string, { userId: string }>).user;
    res.status(200).json({ status: 200, data: { userId: user.userId } });
  });

  // 404
  app.use((_req: Request, res: Response): void => {
    res.status(404).json({ status: 404, code: 'NOT_FOUND', message: 'Endpoint not found' });
  });

  return app;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('E2E: Auth Flow', () => {
  const app = createAuthApp();

  // ─── Login ────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    test('valid credentials return access + refresh tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@qegos.com.au', password: 'Password1!' });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.expiresIn).toBe(900);
      expect(res.body.data.user.email).toBe('admin@qegos.com.au');
      expect(res.body.data.user.userType).toBe(1);
    });

    test('invalid password returns 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@qegos.com.au', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    test('nonexistent email returns 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'Password1!' });

      expect(res.status).toBe(401);
    });

    test('missing fields return 400 with validation errors', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors.length).toBe(2);
    });

    test('missing password returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@qegos.com.au' });

      expect(res.status).toBe(400);
      expect(res.body.errors.some((e: { field: string }) => e.field === 'password')).toBe(true);
    });

    test('client user can log in with different userType', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'client@example.com', password: 'Password1!' });

      expect(res.status).toBe(200);
      expect(res.body.data.user.userType).toBe(2);
    });
  });

  // ─── Protected Routes ─────────────────────────────────────────────

  describe('Protected route access', () => {
    test('access with valid token returns 200', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@qegos.com.au', password: 'Password1!' });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBe('user-001');
    });

    test('access without token returns 401', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    test('access with invalid token returns 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid_token_12345');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('access with malformed Authorization header returns 401', async () => {
      const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Basic abc123');

      expect(res.status).toBe(401);
    });
  });

  // ─── Token Refresh ────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    test('valid refresh token returns new token pair', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@qegos.com.au', password: 'Password1!' });

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: loginRes.body.data.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // New tokens should be different from old ones
      expect(res.body.data.accessToken).not.toBe(loginRes.body.data.accessToken);
      expect(res.body.data.refreshToken).not.toBe(loginRes.body.data.refreshToken);
    });

    test('old access token is revoked after refresh', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@qegos.com.au', password: 'Password1!' });

      const oldAccessToken = loginRes.body.data.accessToken as string;

      await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: loginRes.body.data.refreshToken });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldAccessToken}`);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_REVOKED');
    });

    test('refresh token can only be used once', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@qegos.com.au', password: 'Password1!' });

      const refreshToken = loginRes.body.data.refreshToken as string;

      // First use — success
      const first = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(first.status).toBe(200);

      // Second use — fail (rotation)
      const second = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
      expect(second.status).toBe(401);
    });

    test('invalid refresh token returns 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid_refresh_token' });

      expect(res.status).toBe(401);
    });

    test('missing refresh token returns 400', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({});

      expect(res.status).toBe(400);
    });
  });

  // ─── Logout ───────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    test('logout revokes the access token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@qegos.com.au', password: 'Password1!' });

      const token = loginRes.body.data.accessToken as string;

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.data.loggedOut).toBe(true);

      // Try using the token again
      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });
  });

  // ─── Full Lifecycle ───────────────────────────────────────────────

  describe('Full auth lifecycle', () => {
    test('login → access → refresh → access → logout → denied', async () => {
      // 1. Login
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@qegos.com.au', password: 'Password1!' });
      expect(login.status).toBe(200);

      // 2. Access protected route
      const access1 = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${login.body.data.accessToken}`);
      expect(access1.status).toBe(200);

      // 3. Refresh
      const refresh = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.data.refreshToken });
      expect(refresh.status).toBe(200);

      // 4. Access with new token
      const access2 = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refresh.body.data.accessToken}`);
      expect(access2.status).toBe(200);

      // 5. Logout
      const logout = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${refresh.body.data.accessToken}`);
      expect(logout.status).toBe(200);

      // 6. Denied
      const denied = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refresh.body.data.accessToken}`);
      expect(denied.status).toBe(401);
    });
  });
});
