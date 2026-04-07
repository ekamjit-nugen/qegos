# Phase 0 Implementation Report: QEGOS TypeScript Rebuild

**Date:** 2026-04-07
**Codebase State:** Current HEAD (post-TypeScript rebuild)
**Scope:** All Tier 1 packages (`packages/`) + Application layer (`apps/api/`)
**Total Source Files:** 53 TypeScript files (41 source + 5 type files + 7 test files)

---

## 1. Architecture Overview

### 1.1 Monorepo Structure

```
qegos/
  tsconfig.json               # Project references (files: [], references to all packages)
  tsconfig.base.json           # Shared compiler options (strict: true, ES2022, commonjs)
  jest.config.ts               # ts-jest with module aliases for all @nugen/* packages
  packages/
    error-handler/             # @nugen/error-handler — Tier 1 foundational
    validator/                 # @nugen/validator — Tier 1 foundational
    rate-limiter/              # @nugen/rate-limiter — Tier 1
    auth/                      # @nugen/auth — Tier 1
    rbac/                      # @nugen/rbac — Tier 1
    audit-log/                 # @nugen/audit-log — Tier 1
  apps/
    api/                       # @qegos/api — Express application
```

### 1.2 TypeScript Configuration

**Root `tsconfig.json`**: Uses project references (`"references"`) pointing to all 7 sub-projects. Contains no files itself (`"files": []`).

**Root `tsconfig.base.json`**: Shared compiler options extended by all packages:
- `strict: true` (all strict checks enabled)
- `target: ES2022`, `module: commonjs`, `moduleResolution: node`
- `composite: true`, `incremental: true`, `declaration: true`, `declarationMap: true`
- `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true`

Each package has its own `tsconfig.json` extending `tsconfig.base.json` with `outDir: "./dist"` and `rootDir: "./src"`.

### 1.3 Dependency Graph

```
                @nugen/error-handler  (foundational — no dependencies)
                       |
                @nugen/validator  (depends on error-handler)
                       |
    +------------------+-------------------+
    |                  |                   |
@nugen/rate-limiter  @nugen/auth        @nugen/rbac
   (standalone)    (depends on          (depends on
                   error-handler,        error-handler,
                   validator)            validator)
                                           |
                                   @nugen/audit-log
                                   (depends on
                                    error-handler,
                                    validator)

                    apps/api
                 (consumes ALL 6 Tier 1 packages)
```

**Dependency direction rule**: Tier 2 (apps) imports Tier 1 (packages). Tier 1 packages only import foundational packages (`error-handler`, `validator`). No circular dependencies. Verified in code — no `@nugen/auth` importing `@nugen/rbac` or vice versa.

### 1.4 Mongoose Plugin Composition Pattern

The User model in `apps/api` is composed from plugins provided by Tier 1 packages:

```
userSchema (QEGOS-specific fields: email, mobile, tfn, address, consent, etc.)
    |
    +-- authPlugin (@nugen/auth)  — adds password, refreshTokens, MFA fields, lockout, etc.
    |
    +-- rbacPlugin (@nugen/rbac)  — adds roleId, userType fields
```

This allows each product (QEGOS, Nexora, etc.) to compose its own User model from the same building blocks.

### 1.5 Event-Driven Integration Points

The audit-log package provides a Mongoose plugin (`auditMiddleware`) that attaches to `post-save` and `post-findOneAndDelete` hooks on any schema. This is the primary cross-package integration point — schemas that apply the audit middleware automatically emit audit log entries without direct function calls to `@nugen/audit-log`.

### 1.6 Test Infrastructure

**Framework:** Jest with `ts-jest` preset, configured in `/jest.config.ts`.
**Module resolution:** Uses `moduleNameMapper` to resolve `@nugen/*` imports to source directories (not dist).
**Coverage collection:** From `packages/*/src/**/*.ts` and `apps/*/src/**/*.ts`, excluding `index.ts` and `types.ts`.

**Test files (7 total):**
| File | Tests | Type |
|------|-------|------|
| `packages/error-handler/__tests__/appError.test.ts` | 11 tests | Unit |
| `packages/validator/__tests__/validators.test.ts` | 11 tests | Unit |
| `packages/auth/__tests__/jwtService.test.ts` | 5 tests | Unit |
| `packages/auth/__tests__/passwordService.test.ts` | 7 tests | Unit |
| `packages/rbac/__tests__/checkPermission.test.ts` | 10 tests | Unit |
| `packages/audit-log/__tests__/auditService.test.ts` | 7 tests | Unit (structural) |
| `apps/api/__tests__/health.test.ts` | 7 tests | Unit (structural) |

---

## 2. Package: @nugen/error-handler

### 2.1 Purpose

Standardized error response framework for all Nugen products. Provides a typed `AppError` class with factory methods, a global Express error handler middleware, and an async wrapper for route handlers.

### 2.2 Exported API (from `index.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `AppError` | Class | Error class with statusCode, code, message, errors, isOperational |
| `globalErrorHandler` | Middleware | Express 4-arg error handler — handles AppError, Mongoose errors, JWT errors |
| `setErrorLogger` | Function | Inject a structured logger; falls back to console.error |
| `asyncHandler` | Function | Wraps async route handlers, catches rejections and calls next(err) |
| `ErrorCode` | Enum | 11 error codes: VALIDATION_ERROR, INVALID_CREDENTIALS, UNAUTHORIZED, TOKEN_EXPIRED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, GATEWAY_ERROR, SERVICE_UNAVAILABLE, INTERNAL_ERROR |
| `ErrorResponse` | Type | `{ status, code, message, errors? }` |
| `FieldError` | Type | `{ field, message }` |
| `AppErrorOptions` | Type | Constructor options for AppError |
| `AsyncHandler` | Type | Async Express handler signature |
| `ErrorMiddleware` | Type | Express error middleware signature |
| `Logger` | Type | `{ error(msg, meta?), warn(msg, meta?) }` |

### 2.3 Key Interfaces

**ErrorResponse:**
```typescript
{ status: number; code: string; message: string; errors?: FieldError[] }
```

**FieldError:**
```typescript
{ field: string; message: string }
```

**ErrorCode enum:** VALIDATION_ERROR, INVALID_CREDENTIALS, UNAUTHORIZED, TOKEN_EXPIRED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, GATEWAY_ERROR, SERVICE_UNAVAILABLE, INTERNAL_ERROR

### 2.4 Implementation Details

**AppError class** (`AppError.ts`):
- Extends native `Error` with `statusCode`, `code`, `errors[]`, `isOperational` (default `true`)
- `Object.setPrototypeOf(this, AppError.prototype)` for correct `instanceof` checks
- `Error.captureStackTrace(this, this.constructor)` for clean stack traces
- `toJSON()` returns the standardized response format, omitting `errors` when empty
- 11 static factory methods: `badRequest`, `unauthorized`, `invalidCredentials`, `tokenExpired`, `forbidden`, `notFound`, `conflict`, `rateLimited`, `gatewayError`, `serviceUnavailable`, `internal`
- `internal()` sets `isOperational: false` (signaling unrecoverable errors)

**globalErrorHandler** (`globalErrorHandler.ts`):
- Uses TypeScript type guards with `is` keyword for Mongoose/JWT error detection
- Handles: `AppError` (direct use), `MongooseValidationError`, `MongooseCastError`, `MongoDuplicateKeyError` (code 11000), `JsonWebTokenError`/`TokenExpiredError`
- For unknown errors: logs full details via injected logger, returns generic message in production (SEC-INV-13)
- Injectable logger via `setErrorLogger()` — avoids coupling to any specific logging library

**asyncHandler** (`asyncHandler.ts`):
- Simple `Promise.resolve(fn(req, res, next)).catch(next)` pattern
- Returns `RequestHandler` type for correct Express typing

### 2.5 Configuration

None required — the package is stateless except for the optional logger injection.

### 2.6 PRD Invariants Enforced

| Invariant | How Enforced |
|-----------|-------------|
| SEC-INV-13 (no stack traces in production) | `globalErrorHandler.ts:137-141` — checks `process.env.NODE_ENV === 'production'`, returns generic message |
| PRD Section 4.3 (standard error format) | `AppError.toJSON()` returns `{status, code, message, errors?}` — matches spec exactly |

### 2.7 File-by-File Breakdown

| File | Lines | Purpose |
|------|-------|---------|
| `src/types.ts` | 54 | ErrorResponse, FieldError, ErrorCode enum, AppErrorOptions, AsyncHandler, ErrorMiddleware, Logger interfaces |
| `src/AppError.ts` | 121 | AppError class with 11 factory methods and toJSON serialization |
| `src/globalErrorHandler.ts` | 144 | Global Express error handler with type guards for Mongoose, JWT, and MongoDB errors |
| `src/asyncHandler.ts` | 14 | Async route handler wrapper |
| `src/index.ts` | 13 | Public API barrel export |

---

## 3. Package: @nugen/validator

### 3.1 Purpose

Express-validator wrapper library providing pre-built validation chains for Australian-specific data formats (TFN, ABN, E.164 mobile, postcode, state) plus common patterns (email, pagination, ObjectId, search, integer cents). Also provides MongoDB injection sanitization middleware.

### 3.2 Exported API (from `index.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `validate` | Function | Middleware factory: accepts `ValidationChain[]`, returns `RequestHandler[]` that run validations then throw `AppError.badRequest` on failure |
| `sanitize` | Function | Middleware factory: returns middleware that runs `mongo-sanitize` on `req.body`, `req.query`, `req.params` |
| `email` | Function | Email validation chain (trim, notEmpty, isEmail, normalizeEmail) |
| `phone` | Function | Australian mobile validation: `/^\+61\d{9}$/` (configurable country code) |
| `objectId` | Function | MongoDB ObjectId validation for param/body/query locations |
| `pagination` | Function | Returns 4 chains: page (int >= 1), limit (int 1-100), sortBy (string), sortOrder (asc/desc) |
| `dateRange` | Function | ISO 8601 date range validation for query params |
| `tfn` | Function | TFN validation with ATO check digit algorithm (weights: 1,4,3,7,5,8,6,9,10; sum mod 11 === 0) |
| `abn` | Function | ABN validation with ABR check digit algorithm (subtract 1 from first digit; weights: 10,1,3,5,7,9,11,13,15,17,19; sum mod 89 === 0) |
| `postcode` | Function | 4-digit Australian postcode validation |
| `auState` | Function | Australian state enum: NSW, VIC, QLD, SA, WA, TAS, NT, ACT |
| `integerCents` | Function | Non-negative integer validation with `Number.isInteger()` check |
| `requiredString` | Function | Generic required string validator for body/query/param |
| `search` | Function | Search query param: optional, max 200 chars |
| `escapeRegex` | Function | Escapes regex special characters to prevent ReDoS |
| `isValidTfn` | Function | TFN check digit validation (exported for testing) |
| `isValidAbn` | Function | ABN check digit validation (exported for testing) |
| `ValidatorFactory` | Type | Validator factory function signature |
| `ValidateMiddleware` | Type | RequestHandler alias |
| `SanitizeOptions` | Type | Options for sanitize middleware |
| `AustralianState` | Type | Union type of 8 Australian states/territories |
| `AUSTRALIAN_STATES` | Const | Array of all 8 state codes |

### 3.3 Key Types

**AustralianState:** `'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT'`

### 3.4 Implementation Details

**TFN check digit** (`validators.ts:10-21`): Strips spaces, verifies exactly 9 digits, applies ATO weighted sum algorithm (weights `[1,4,3,7,5,8,6,9,10]`), checks `sum % 11 === 0`. This fixes Vegeta finding B-4 (format-only validation was insufficient).

**ABN check digit** (`validators.ts:29-42`): Strips spaces, verifies exactly 11 digits, subtracts 1 from first digit, applies ABR weighted sum algorithm (weights `[10,1,3,5,7,9,11,13,15,17,19]`), checks `sum % 89 === 0`. Fixes Vegeta B-5.

**escapeRegex** (`validators.ts:48-50`): Replaces `[.*+?^${}()|[\]\\]` with `\\$&`. Used by `user.service.ts` to prevent ReDoS when user-supplied search strings are passed to `$regex`. Fixes Vegeta S-6 and B-25.

**sanitize middleware** (`sanitize.ts`): Uses `mongo-sanitize` package to strip keys starting with `$` or containing `.` from `req.body`, `req.query`, and `req.params`. Applied globally in `app.ts`. Fixes GAP-C14.

**validate factory** (`validate.ts`): Runs all validation chains, then checks `validationResult(req)`. If errors exist, throws `AppError.badRequest('Validation failed', fieldErrors)` where `fieldErrors` maps each error to `{field, message}`.

### 3.5 Configuration

No initialization required. All validators are pure functions that return express-validator `ValidationChain` instances.

### 3.6 PRD Invariants Enforced

| Invariant | How Enforced |
|-----------|-------------|
| All inputs validated (CLAUDE.md coding standards) | `validate()` middleware blocks requests with invalid data before reaching controllers |
| All monetary values integer cents (CLAUDE.md) | `integerCents()` validator with `Number.isInteger()` custom check |
| Australian phone E.164 (CLAUDE.md) | `phone()` validates `/^\+61\d{9}$/` |
| GAP-C14 (mongo-sanitize globally) | `sanitize()` middleware applied globally in `app.ts:51` |

### 3.7 File-by-File Breakdown

| File | Lines | Purpose |
|------|-------|---------|
| `src/types.ts` | 19 | ValidatorFactory, ValidateMiddleware, SanitizeOptions, AustralianState type and AUSTRALIAN_STATES constant |
| `src/validators.ts` | 202 | All validator chain factories + TFN/ABN check digit algorithms + escapeRegex |
| `src/validate.ts` | 27 | Middleware factory that runs validations and throws AppError on failure |
| `src/sanitize.ts` | 26 | MongoDB injection sanitization middleware using mongo-sanitize |
| `src/index.ts` | 27 | Public API barrel export |

---

## 4. Package: @nugen/rate-limiter

### 4.1 Purpose

Redis-backed rate limiting middleware for Express. Provides pre-configured auth endpoint limiters matching PRD SEC-INV-01 specs, plus a general API limiter (NFR-03). Falls back to in-memory store when Redis is unavailable.

### 4.2 Exported API (from `index.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `createLimiter` | Function | Generic rate limiter factory accepting `RateLimiterConfig` |
| `initRateLimiter` | Function | Inject Redis client for distributed rate limiting |
| `getRedisClient` | Function | Access the injected Redis client |
| `createAuthLimiters` | Function | Returns pre-built auth limiters: `{ otpSend, otpVerify, signin, forgotPassword, mfaVerify }` |
| `createApiLimiter` | Function | General API limiter: 100 req/min per user (or IP) |
| `RateLimiterConfig` | Type | `{ windowMs, max, message?, keyGenerator?, skipSuccessfulRequests?, skipFailedRequests?, standardHeaders?, legacyHeaders? }` |
| `RateLimiterInit` | Type | `{ redisClient? }` |
| `AuthLimiters` | Type | `{ otpSend, otpVerify, signin, forgotPassword, mfaVerify }` |
| `ApiLimiterConfig` | Type | `{ windowMs?, max? }` |

### 4.3 Implementation Details

**createLimiter** (`createLimiter.ts`): Wraps `express-rate-limit` with a standard error response format (`{status: 429, code: 'RATE_LIMITED', message}`). When `_redisClient` is available, dynamically requires `rate-limit-redis` and creates a `RedisStore` with `prefix: 'rl:'`. Falls back to in-memory on import failure.

**Auth limiters** (`authLimiters.ts`):
| Limiter | Window | Max | Key |
|---------|--------|-----|-----|
| otpSend | 15 min | 3 | `otp-send:{mobile or IP}` |
| otpVerify | 15 min | 5 | `otp-verify:{mobile or IP}` |
| signin | 15 min | 5 | `signin:{email or IP}` |
| forgotPassword | 1 hour | 3 | `forgot-pwd:{email or IP}` |
| mfaVerify | 15 min | 5 | `mfa-verify:{userId or IP}` |

The `mfaVerify` limiter was added as a fix for Vegeta S-1 (MFA endpoint was unprotected).

**API limiter** (`apiLimiter.ts`): 100 req/min per user. Uses `req.user.userId` from JWT if available, falls back to `req.ip`.

### 4.4 Configuration

`initRateLimiter(redisClient)` must be called before creating limiters. The Redis client is optional — limiters work with in-memory storage when Redis is unavailable.

### 4.5 PRD Invariants Enforced

| Invariant | How Enforced |
|-----------|-------------|
| SEC-INV-01 (rate limiting on auth) | `createAuthLimiters()` implements exact PRD rates: OTP 3/15min, signin 5/15min, forgot-pwd 3/hr |
| NFR-03 (100 req/min) | `createApiLimiter()` defaults to 100 req/min per user |

### 4.6 File-by-File Breakdown

| File | Lines | Purpose |
|------|-------|---------|
| `src/types.ts` | 31 | RateLimiterConfig, RateLimiterInit, AuthLimiters, ApiLimiterConfig interfaces |
| `src/createLimiter.ts` | 58 | Core limiter factory with Redis store integration |
| `src/authLimiters.ts` | 68 | Pre-built auth endpoint limiters per SEC-INV-01 + S-1 fix |
| `src/apiLimiter.ts` | 20 | General API rate limiter per NFR-03 |
| `src/index.ts` | 10 | Public API barrel export |

---

## 5. Package: @nugen/auth

### 5.1 Purpose

Complete authentication package: JWT access/refresh token lifecycle with replay detection, bcrypt password hashing with configurable policy, OTP generation/verification (hashed storage), TOTP MFA with backup codes (hashed), account lockout, and Mongoose plugin for auth fields. Product-agnostic — configured via `AuthConfig`.

### 5.2 Exported API (from `index.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `init` | Function | Initialize all auth services with config, DB connection, and User model. Returns `{ OtpModel }` |
| `authPlugin` | Function | Mongoose plugin adding auth fields to any schema |
| `createOtpModel` | Function | Factory for OTP Mongoose model |
| `authenticate` | Function | JWT auth middleware factory |
| `initAuthMiddleware` | Function | Inject User model into auth middleware |
| `createAuthRoutes` | Function | Create Express router with 14 auth endpoints |
| `jwtService` | Namespace | `{ initJwtService, generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken, generateMfaChallengeToken, verifyMfaChallengeToken, issueTokenPair, rotateRefreshToken, revokeToken, revokeAllTokens }` |
| `passwordService` | Namespace | `{ initPasswordService, hashPassword, comparePassword, validatePolicy }` |
| `otpService` | Namespace | `{ initOtpService, sendOtp, verifyOtp }` |
| `mfaService` | Namespace | `{ initMfaService, enroll, verifyToken, verifyBackupCode, completeEnrollment, disable }` |
| 13 validator functions | Functions | `signupValidation, signinValidation, sendOtpValidation, verifyOtpValidation, refreshTokenValidation, forgotPasswordValidation, resetPasswordValidation, changePasswordValidation, checkUserValidation, mfaVerifyValidation, mfaEnrollValidation, mfaBackupValidation, mfaDisableValidation` |
| All types from `types.ts` | Types | See section 5.3 |

### 5.3 Key Interfaces/Types

**AuthConfig:**
```typescript
{
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessExpiry: string;        // e.g. "15m"
  jwtRefreshExpiry: string;       // e.g. "7d"
  maxSessions: number;            // e.g. 5
  otpExpiry: number;              // seconds, e.g. 300
  otpLength: number;              // e.g. 6
  bcryptRounds: number;           // e.g. 12
  passwordPolicy: PasswordPolicy;
  phoneRegex: RegExp;             // e.g. /^\+61\d{9}$/
  mfaIssuer: string;              // e.g. "QEGOS"
  sendOtp?: (mobile, otp) => Promise<void>;
  sendPasswordResetEmail?: (email, token) => Promise<void>;
}
```

**PasswordPolicy:** `{ minLength, requireUppercase, requireLowercase, requireNumber, requireSpecial }`

**TokenPayload:** `{ userId, userType, roleId, iat?, exp? }` — JWT access token claims

**RefreshTokenPayload:** `{ userId, deviceId, tokenVersion, iat?, exp? }` — JWT refresh token claims

**RefreshTokenEntry:** `{ token (bcrypt hashed), deviceId, userAgent, ipAddress, createdAt, expiresAt }`

**IAuthFields:** All fields added by the auth plugin — `password, refreshTokens[], failedLoginAttempts, accountLockedUntil, lastLoginAt, lastLoginIp, passwordChangedAt, mfaEnabled, mfaSecret, mfaBackupCodes[] (stored as bcrypt hashes), passwordResetToken, passwordResetExpires`

**IOtp:** `{ mobile, otpHash (bcrypt), expiresAt, isUsed, attempts, createdAt }`

**MfaChallengeToken:** `{ userId, challengeId, expiresAt }` — time-limited token for MFA verification step

**AuthenticatedRequest:** Extends Express `Request` with `user: TokenPayload` and `scopeFilter?`

### 5.4 Implementation Details

**JWT rotation logic** (`jwtService.ts`):
1. `issueTokenPair()`: Generates access token (short-lived) + refresh token (7d). Refresh token is bcrypt-hashed before storage on user document. Enforces max sessions by removing oldest when at limit. Replaces existing session for same deviceId.
2. `rotateRefreshToken()`: Iterates stored hashed tokens, bcrypt-compares against provided token. If match found, removes old entry and issues new pair. **If no match found** (replay attack), revokes ALL tokens (SEC-INV-04).
3. `generateMfaChallengeToken()`: Issues a 5-minute JWT with `type: 'mfa_challenge'` claim. Used as an intermediary between password auth and MFA verification (fix for S-1).

**Password hashing** (`passwordService.ts`):
- Uses bcryptjs at configured rounds (default 12, SEC-INV-07)
- `validatePolicy()` returns array of error messages — empty array means valid

**OTP lifecycle** (`otpService.ts`):
- `sendOtp()`: Deletes existing OTPs for mobile, generates using `crypto.randomInt()`, bcrypt-hashes before storage (fix for S-2), delegates actual delivery to configurable `sendOtp` callback
- `verifyOtp()`: Finds unexpired/unused OTP, bcrypt-compares input against stored hash, deletes on success (single-use, SEC-INV-08)

**MFA** (`mfaService.ts`):
- Uses `otpauth` library for TOTP (SHA1, 6 digits, 30s period, window: 1)
- `enroll()`: Generates TOTP secret, QR code (via `qrcode` lib), 10 backup codes. Backup codes stored as bcrypt hashes (fix for S-3). Returns plaintext codes to show user once.
- `verifyBackupCode()`: Iterates hashed codes, bcrypt-compares, removes used code
- `completeEnrollment()`: Verifies TOTP token, sets `mfaEnabled: true`
- `disable()`: Requires password re-verification (enforced at route level), clears mfaEnabled/mfaSecret/mfaBackupCodes

**Auth plugin** (`authPlugin.ts`):
- Mongoose plugin adding all auth fields to any schema
- Pre-save hook: hashes password using bcrypt at configured rounds. Sets `passwordChangedAt` on non-new documents (SEC-INV-05).
- Instance methods: `isCorrectPassword()`, `isAccountLocked()`, `incrementFailedAttempts()` (locks after 10 attempts for 30 min, SEC-INV-02), `resetFailedAttempts()`
- `toJSON` transform: strips `password`, `refreshTokens`, `mfaSecret`, `mfaBackupCodes`, `passwordResetToken`

**Auth middleware** (`authMiddleware.ts`):
- Extracts Bearer token from Authorization header
- Verifies JWT, fetches user from DB (with `+passwordChangedAt` select)
- Checks: user exists, not deleted, status active, not locked, password not changed after token issued (SEC-INV-05)
- Attaches `req.user = { userId, userType, roleId }`

**Auth routes** (`authRoutes.ts`): 14 endpoints via dependency injection:
| Method | Path | Auth | Rate Limited | Description |
|--------|------|------|-------------|-------------|
| POST | `/send-otp` | No | otpSend | Send OTP to mobile |
| POST | `/verify-otp` | No | otpVerify | Verify OTP, return tokens if user exists |
| POST | `/signup` | No | No | Register new client user with OTP |
| POST | `/signin` | No | signin | Email/password login. Returns MFA challenge token if MFA enabled |
| POST | `/mfa-verify` | No | mfaVerify | Complete MFA with challenge token + TOTP (fix S-1) |
| POST | `/mfa-backup` | No | No | MFA recovery with backup code + challenge token |
| POST | `/refresh` | No | No | Rotate refresh token (replay detection) |
| POST | `/logout` | JWT | No | Revoke current device session |
| POST | `/logout-all` | JWT | No | Revoke all sessions |
| POST | `/forgot-password` | No | forgotPassword | Request password reset (anti-enumeration response) |
| POST | `/reset-password` | No | No | Reset password with token + policy validation |
| POST | `/change-password` | JWT | No | Change password (revokes other sessions) |
| POST | `/check-user` | No | No | Check if user exists by mobile/email |
| POST | `/mfa-enroll` | JWT | No | Start MFA enrollment |
| POST | `/mfa-enroll/verify` | JWT | No | Complete MFA enrollment with TOTP |
| POST | `/mfa-disable` | JWT | No | Disable MFA (requires password) |

### 5.5 Configuration

`auth.init(config, connection, UserModel)` must be called at startup. The `AuthConfig` object controls all behavior — no hardcoded values.

### 5.6 PRD Invariants Enforced

| Invariant | How Enforced | File:Line |
|-----------|-------------|-----------|
| SEC-INV-01 | Rate limiters injected into routes via `authLimiters` config | `authRoutes.ts:50-53,66-68,152-155,210-213` |
| SEC-INV-02 | Account lockout after 10 failed attempts, 30min | `authPlugin.ts:87-95` |
| SEC-INV-03 | Refresh tokens hashed with bcrypt before storage | `jwtService.ts:104` |
| SEC-INV-04 | Replay detection — no match revokes ALL tokens | `jwtService.ts:162-167` |
| SEC-INV-05 | JWT invalidated after password change via passwordChangedAt check | `authMiddleware.ts:64-69`, `authPlugin.ts:63-65` |
| SEC-INV-06 | Max 5 concurrent sessions enforced | `jwtService.ts:122-126` |
| SEC-INV-07 | Bcrypt cost 12 (configurable) | `passwordService.ts:22`, `server.ts:56` |
| SEC-INV-08 | OTP 5-min expiry (TTL index), single use (deleted after verify) | `otpModel.ts:16`, `otpService.ts:102` |

### 5.7 File-by-File Breakdown

| File | Lines | Purpose |
|------|-------|---------|
| `src/types.ts` | 116 | All auth type definitions: AuthConfig, TokenPayload, RefreshTokenPayload, IAuthFields, IOtp, MfaChallengeToken, etc. |
| `src/services/jwtService.ts` | 191 | JWT access/refresh token generation, verification, rotation with replay detection, MFA challenge tokens |
| `src/services/passwordService.ts` | 59 | Bcrypt hashing, comparison, password policy validation |
| `src/services/otpService.ts` | 106 | OTP generation (crypto.randomInt), hashed storage, verification with attempt tracking |
| `src/services/mfaService.ts` | 144 | TOTP enrollment/verification (otpauth), backup code generation (bcrypt-hashed), enable/disable |
| `src/models/authPlugin.ts` | 118 | Mongoose plugin: auth fields, pre-save password hashing, instance methods, toJSON stripping |
| `src/models/otpModel.ts` | 25 | OTP Mongoose schema with TTL index for auto-expiry |
| `src/middleware/authMiddleware.ts` | 84 | JWT authentication middleware with full lifecycle checks |
| `src/validators/authValidators.ts` | 125 | Express-validator chains for all 14 auth endpoints |
| `src/routes/authRoutes.ts` | 600 | Express router factory with all 16 auth routes |
| `src/index.ts` | 61 | Package init function + barrel re-exports |

---

## 6. Package: @nugen/rbac

### 6.1 Purpose

Role-based access control with Redis-cached role lookups, scope-based query filtering (all/assigned/own), permission change snapshots, anomaly detection, and baseline protection for system roles.

### 6.2 Exported API (from `index.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `init` | Function | Initialize RBAC: creates Role + PermissionSnapshot models, initializes middleware. Returns `{ RoleModel, PermissionSnapshotModel }` |
| `seedRoles` | Function | Seed 7 default system roles using `$setOnInsert` (idempotent) |
| `createRoleModel` | Function | Factory for Role Mongoose model |
| `createPermissionSnapshotModel` | Function | Factory for PermissionSnapshot model |
| `computeDiff` | Function | Standalone function: computes diff between two permission arrays |
| `rbacPlugin` | Function | Mongoose plugin adding `roleId` and `userType` fields |
| `check` | Function | RBAC middleware factory: `check(resource, action)` |
| `initCheckPermission` | Function | Inject RoleModel, Redis client, config |
| `invalidateRoleCache` | Function | Invalidate single role cache entry |
| `invalidateAllRoleCaches` | Function | Invalidate all role caches using SCAN (not KEYS) |
| `defaultRoles` | Array | 7 system role definitions with full permission matrices |
| `getBaselinePermissions` | Function | Get baseline permissions for system role (for RBAC-INV-05) |
| `detectAnomalies` | Function | Run 5 anomaly detection rules against user/role state |
| `createRbacRoutes` | Function | Create Express router with 7 RBAC endpoints |
| All types from `types.ts` | Types | See section 6.3 |

### 6.3 Key Interfaces/Types

**IPermission:** `{ resource: string, actions: PermissionAction[], scope: PermissionScope }`

**PermissionAction:** `'create' | 'read' | 'update' | 'delete' | 'assign' | 'export' | 'bulk_action'`

**PermissionScope:** `'all' | 'assigned' | 'own' | 'none'`

**IRole:** `{ name, displayName, permissions: IPermission[], isSystem, isActive, createdBy? }`

**RbacConfig:** `{ cacheTtl?: number (default 300), sensitiveResources?: string[] }`

**PermissionDiff:** `{ resource, action?, scope?, changeType: 'added'|'removed'|'scope_changed', before?, after? }`

**AnomalyResult:** `{ rule, severity, description, affectedUsers: Array<{userId, roleName, detail}> }`

### 6.4 Implementation Details

**Scope filtering** (`checkPermission.ts:118-176`):
1. Extracts `userId`, `roleId` from `req.user` (set by auth middleware)
2. Fetches role from Redis cache (key: `role:{roleId}`, TTL: 300s) or MongoDB
3. Checks: role exists, role is active (RBAC-INV-12), resource permission exists, action is allowed
4. Injects `req.scopeFilter` based on scope:
   - `all` -> `{}` (no filter)
   - `assigned` -> `{ $or: [{ assignedTo: userId }, { processingBy: userId }] }`
   - `own` -> `{ userId }`
   - `none` -> throws 403
5. 403 response is identical regardless of whether the resource exists (RBAC-INV-08)

**Cache invalidation** (`checkPermission.ts:68-105`):
- `invalidateRoleCache(roleId)`: Deletes specific key `role:{roleId}` (fix for S-5)
- `invalidateAllRoleCaches()`: Uses SCAN iterator with `MATCH role:* COUNT 100` instead of `KEYS` command (fix for S-5)

**Permission snapshots** (`permissionSnapshotModel.ts`):
- `computeDiff()`: Standalone function (not model static, fix for B-15). Compares before/after permission arrays to detect added/removed resources, added/removed actions, and scope changes.
- Schema stores: `snapshotId` (UUID), `roleId`, `roleName`, `permissionsBefore`, `permissionsAfter`, `diff`, `changedBy`, `reason` (required, PRM-INV-02)

**Baseline protection** (`defaultRoles.ts:174-177` and `rbacRoutes.ts:29-58`):
- `getBaselinePermissions(roleName)`: Returns seed permissions for system roles
- `validateBaselinePermissions()`: Checks proposed permissions don't remove resources, actions, or restrict scope below baseline for system roles (RBAC-INV-05, fix for B-13)

**Anomaly detector** (`anomalyDetector.ts`): 5 rules:
1. Staff with admin-level access (CRUD/all on payments/system_config/audit_logs) — Critical
2. Orphaned users (active user with disabled role) — High
3. Over-privileged scope (staff with "all" where "assigned" is standard) — Warning
4. No reviewer available (zero active roles with reviews:update:all) — Critical
5. Unused admin accounts (90+ days no login) — Warning

**Default roles** (`defaultRoles.ts`): 7 system roles with full permission matrices across 18 resources:
- super_admin (userType 0): CRUD/all on everything
- admin (userType 1): Same as super_admin except system_config has no delete
- office_manager (userType 5): Read-heavy, CRUD on orders/leads, read on most others
- senior_staff (userType 6): assigned scope on orders/users/vault, all on leads
- staff (userType 3): assigned scope on most resources
- client (userType 2): own scope, CRUD on vault_documents
- student (userType 4): Same as client

**RBAC routes** (`rbacRoutes.ts`): 7 endpoints:
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/roles` | system_config:read | List all roles |
| POST | `/roles` | system_config:create | Create custom role (super_admin only) |
| PUT | `/roles/:id` | system_config:update | Update role (with baseline check, snapshot, escalation guard) |
| DELETE | `/roles/:id` | system_config:delete | Delete non-system role (only if no users assigned) |
| PUT | `/roles/assign/:userId` | staff_mgmt:update | Assign role to user (escalation prevention, B-27 fix) |
| GET | `/permissions/anomalies` | system_config:read | Run anomaly detection |
| GET | `/permissions/history` | system_config:read | Paginated permission change history |
| POST | `/permissions/simulate` | system_config:read | Simulate permission changes (read-only, PRM-INV-05) |

### 6.5 Configuration

`rbac.init(connection, redisClient?, config?)` — Redis is optional. Config accepts `cacheTtl` (default 300s) and `sensitiveResources` array.

### 6.6 PRD Invariants Enforced

| Invariant | How Enforced | File:Line |
|-----------|-------------|-----------|
| RBAC-INV-01 | 7 system roles with baseline permissions | `defaultRoles.ts:26-167` |
| RBAC-INV-02 | Scope filter injection (all/assigned/own) | `checkPermission.ts:150-169` |
| RBAC-INV-05 | System roles cannot be reduced below baseline | `rbacRoutes.ts:29-58` + `defaultRoles.ts:174-177` |
| RBAC-INV-08 | 403 identical regardless of resource existence | `checkPermission.ts:130-142` — always "Insufficient permissions" |
| RBAC-INV-11 | Role cache TTL 5 minutes | `checkPermission.ts:7` — `DEFAULT_CACHE_TTL = 300` |
| RBAC-INV-12 | Disabled role = zero permissions | `checkPermission.ts:134-136` |
| PRM-INV-01 | Permission change snapshots | `rbacRoutes.ts:148-157` |
| PRM-INV-02 | Reason required for permission changes | `rbacRoutes.ts:109` — `requiredString('reason')` validation |
| PRM-INV-03 | Sensitive resource escalation requires super_admin | `rbacRoutes.ts:122-137` |
| PRM-INV-05 | Simulate is read-only | `rbacRoutes.ts:291-330` — no writes |

### 6.7 File-by-File Breakdown

| File | Lines | Purpose |
|------|-------|---------|
| `src/types.ts` | 99 | All RBAC types: IPermission, IRole, PermissionScope, PermissionAction, ScopeFilter, AnomalyResult, PermissionDiff, RbacConfig |
| `src/models/roleModel.ts` | 59 | Role Mongoose schema with permission sub-schema, indexes (name unique, isSystem, isActive) |
| `src/models/rbacPlugin.ts` | 18 | Mongoose plugin adding roleId (ref: Role) and userType (enum 0-6) |
| `src/models/permissionSnapshotModel.ts` | 115 | PermissionSnapshot schema + standalone `computeDiff()` function |
| `src/middleware/checkPermission.ts` | 177 | RBAC middleware: cache lookup, permission check, scope injection, cache invalidation |
| `src/seed/defaultRoles.ts` | 178 | 7 system role definitions with full permission matrices + `getBaselinePermissions()` |
| `src/services/anomalyDetector.ts` | 134 | 5 anomaly detection rules |
| `src/routes/rbacRoutes.ts` | 334 | 8 RBAC API endpoints with baseline validation and escalation prevention |
| `src/index.ts` | 56 | Package init, seedRoles function, barrel re-exports |

---

## 7. Package: @nugen/audit-log

### 7.1 Purpose

Append-only audit logging with Mongoose pre-hook enforcement, configurable middleware for automatic create/update/delete tracking, text-search-based log querying (not `$regex`), cursor-based export streaming, and aggregated stats.

### 7.2 Exported API (from `index.ts`)

| Export | Type | Description |
|--------|------|-------------|
| `init` | Function | Initialize audit-log: creates AuditLog model, initializes service. Returns `{ AuditLogModel }` |
| `createAuditLogModel` | Function | Factory for AuditLog Mongoose model |
| `log` | Function | Direct audit entry logging |
| `logFromRequest` | Function | Log from Express request, extracting actor/metadata |
| `initAuditService` | Function | Inject AuditLog model into service |
| `auditMiddleware` | Function | Mongoose plugin for automatic audit logging on save/delete |
| `createAuditRoutes` | Function | Create Express router with 3 audit endpoints |
| All types from `types.ts` | Types | See section 7.3 |

### 7.3 Key Interfaces/Types

**AuditAction:** 18 actions — `'create' | 'read' | 'update' | 'delete' | 'status_change' | 'assign' | 'reassign' | 'login' | 'login_failed' | 'logout' | 'export' | 'bulk_action' | 'convert' | 'merge' | 'refund' | 'void' | 'payment_capture' | 'config_change'`

**AuditSeverity:** `'info' | 'warning' | 'critical'`

**AuditActorType:** 9 types — `'super_admin' | 'admin' | 'office_manager' | 'senior_staff' | 'staff' | 'client' | 'student' | 'system' | 'cron'`

**IAuditLog:** `{ actor, actorType, action, resource, resourceId, resourceNumber?, changes?, description?, metadata?, severity, timestamp }`

**AuditChanges:** `{ [field]: { from, to } }` — field-level change tracking

**AuditMetadata:** `{ ipAddress?, userAgent?, requestMethod?, requestPath?, sessionId?, geoLocation? }`

### 7.4 Implementation Details

**Append-only enforcement** (`auditLogModel.ts:62-96`):
- Pre-hooks block `updateOne`, `updateMany`, `findOneAndUpdate`, `findOneAndDelete`, `deleteOne`, `deleteMany`
- Each throws `Error('Audit logs cannot be modified/deleted. Append-only collection.')`
- Archival bypass: `updateOne` and `deleteOne`/`deleteMany` check `this.getOptions().__archival` — if truthy, allows the operation (for future S3 archival cron)

**Indexes** (`auditLogModel.ts:52-59`):
- `{ timestamp: -1 }` — primary query sort
- `{ actor: 1, timestamp: -1 }` — actor-scoped queries
- `{ resource: 1, resourceId: 1 }` — resource-scoped queries
- `{ severity: 1, timestamp: -1 }` — severity-filtered queries
- `{ action: 1, timestamp: -1 }` — action-filtered queries
- `{ description: 'text', resourceNumber: 'text' }` — text search index (fix for S-6: replaces `$regex`)

**Audit service** (`auditService.ts`):
- `log(entry)`: Creates AuditLog document with current timestamp
- `logFromRequest(req, entry)`: Extracts actor from `req.user`, maps `userType` number to `AuditActorType` string, captures IP/userAgent/method/path metadata
- User type mapping: `{0: 'super_admin', 1: 'admin', 2: 'client', 3: 'staff', 4: 'student', 5: 'office_manager', 6: 'senior_staff'}`

**Audit middleware** (`auditMiddleware.ts`):
- Mongoose plugin that auto-logs create/update/delete operations
- Pre-save: Sets `$locals._wasNew = this.isNew`, captures `modifiedPaths()` (fix for B-17: guards `$locals` access)
- Post-save: Uses only `_wasNew` flag (fix for B-16: avoids unreliable `$isNew`), logs action with modified field tracking
- Post-findOneAndDelete: Logs deletion events
- All audit failures are caught and silently ignored (audit logging never breaks the operation)

**Audit routes** (`auditRoutes.ts`): 3 endpoints:
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/` | audit_logs:read | Query audit logs with filters, pagination, text search |
| POST | `/export` | audit_logs:export | Stream audit logs as JSON file using cursor (fix for G-5) |
| GET | `/stats` | audit_logs:read | Aggregated stats: actions/day, top actors, critical count, failed logins (30 days) |

**Search implementation** (`auditRoutes.ts:48-49`): Uses `$text: { $search: searchTerm }` with MongoDB text index instead of `$regex` (fix for S-6: prevents ReDoS).

**Export streaming** (`auditRoutes.ts:93-107`): Uses `AuditLogModel.find(filter).cursor()` with `for await...of` to stream results instead of loading all into memory (fix for G-5).

### 7.5 Configuration

`auditLog.init(connection)` — requires only a Mongoose connection. The audit middleware accepts `AuditMiddlewareOptions: { resource, getActorId?, getSeverity? }`.

### 7.6 PRD Invariants Enforced

| Invariant | How Enforced | File:Line |
|-----------|-------------|-----------|
| RBAC-INV-07 | Append-only: pre-hooks block update/delete | `auditLogModel.ts:62-96` |

### 7.7 File-by-File Breakdown

| File | Lines | Purpose |
|------|-------|---------|
| `src/types.ts` | 88 | AuditAction, AuditSeverity, AuditActorType, IAuditLog, AuditChanges, AuditMetadata, AuditMiddlewareOptions |
| `src/models/auditLogModel.ts` | 104 | AuditLog Mongoose schema with 6 indexes, text search index, append-only pre-hooks |
| `src/services/auditService.ts` | 70 | log() and logFromRequest() functions with userType mapping |
| `src/middleware/auditMiddleware.ts` | 90 | Mongoose plugin for automatic audit logging |
| `src/routes/auditRoutes.ts` | 156 | 3 audit API endpoints: query, export (streaming), stats |
| `src/index.ts` | 25 | Package init + barrel re-exports |

---

## 8. Application: apps/api

### 8.1 Express App Assembly

**Middleware chain** (`app.ts`, order matters):

1. `helmet()` — Security headers (HSTS 1 year, frameguard deny). CSP disabled in development.
2. `cors()` — Whitelist from `CORS_ORIGINS` env var. Credentials enabled. Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS. Headers: Content-Type, Authorization, X-CSRF-Token, X-Device-Id.
3. `express.json({ limit: '10mb' })` — JSON body parser
4. `express.urlencoded({ extended: true, limit: '10mb' })` — URL-encoded parser
5. `cookieParser()` — Cookie parsing (for refresh token in cookies)
6. `compression()` — Response compression
7. `sanitize()` — MongoDB injection sanitization on body/query/params (GAP-C14)
8. `createApiLimiter()` — 100 req/min per user on `/api/v1/*`
9. `GET /health` — Shallow health check (no auth)

**Route mounting** (`app.ts:94-99`, after database initialization):
```
/api/v1/auth         -> authRouter (16 endpoints)
/api/v1              -> rbacRouter (8 endpoints)
/api/v1/audit-logs   -> auditRouter (3 endpoints)
/api/v1/users        -> userRouter (8 endpoints)
/api/v1/tax-rules    -> taxRuleRouter (6 endpoints)
GET /health/deep     -> deepHealthCheck (no auth, fix for B-21)
```

10. 404 handler — `{status: 404, code: 'NOT_FOUND', message: 'Endpoint not found'}`
11. `globalErrorHandler` — Global error handler (must be last)

### 8.2 Bootstrap Sequence (`server.ts`)

1. Load and validate environment (`loadConfig()` — Zod validation, fails fast)
2. Create Express app (`createApp()`)
3. Connect to MongoDB
4. Create and connect to Redis (continues without Redis if connection fails)
5. Initialize Tier 1 packages in dependency order:
   - `initRateLimiter(redisClient)` — inject Redis into rate limiter
   - `rbac.init(connection, redisClient)` — creates RoleModel, PermissionSnapshotModel
   - `createUserModel(connection)` — User model with auth/rbac plugins
   - `auth.init(authConfig, connection, UserModel)` — creates OTP model, initializes all services
   - `auditLog.init(connection)` — creates AuditLogModel
   - `createTaxRuleConfigModel(connection)` — tax rules model
6. Seed data:
   - `rbac.seedRoles(RoleModel)` — idempotent seed of 7 system roles
   - `seedTaxRules(TaxRuleConfigModel, systemUser._id)` — FY2024-25 tax brackets (if super_admin exists)
7. Create route factories with injected dependencies
8. Finalize app (mount routes, error handler)
9. Start HTTP server
10. Register graceful shutdown handlers (SIGTERM, SIGINT) — closes HTTP server, disconnects MongoDB and Redis, force exits after 10s timeout

### 8.3 Environment Config (`config/env.ts`)

Zod-validated environment with fail-fast on startup:

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `NODE_ENV` | enum | `development` | No | Environment mode |
| `PORT` | number | `5000` | No | Server port |
| `API_VERSION` | string | `v1` | No | API version prefix |
| `MONGODB_URI` | string | — | Yes | MongoDB connection string |
| `REDIS_HOST` | string | `127.0.0.1` | No | Redis host |
| `REDIS_PORT` | number | `6379` | No | Redis port |
| `REDIS_PASSWORD` | string | `''` | No | Redis password |
| `JWT_ACCESS_SECRET` | string (min 32) | — | Yes | JWT signing secret for access tokens |
| `JWT_REFRESH_SECRET` | string (min 32) | — | Yes | JWT signing secret for refresh tokens |
| `JWT_ACCESS_EXPIRY` | string | `15m` | No | Access token expiry |
| `JWT_REFRESH_EXPIRY` | string | `7d` | No | Refresh token expiry |
| `ENCRYPTION_KEY` | string (min 32) | — | Yes | AES-256-GCM key for TFN encryption (hex) |
| `CORS_ORIGINS` | string | `http://localhost:3000,3001` | No | Comma-separated CORS origins |
| `CSRF_SECRET` | string (min 32) | — | No | CSRF secret (optional) |
| `RATE_LIMIT_WINDOW_MS` | number | `60000` | No | API rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | number | `100` | No | API rate limit max |
| `LOG_LEVEL` | string | `debug` | No | Logging level |
| `MFA_ISSUER` | string | `QEGOS` | No | MFA TOTP issuer name |
| `TWILIO_ACCOUNT_SID` | string | — | No | Twilio SID (OTP delivery) |
| `TWILIO_AUTH_TOKEN` | string | — | No | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | string | — | No | Twilio sender number |

### 8.4 User Module

**Types** (`user.types.ts`): `IUser` extends `IAuthFields` (from `@nugen/auth`) and `IRbacFields` (from `@nugen/rbac`), adding QEGOS-specific fields:

| Field | Type | Notes |
|-------|------|-------|
| email | string (optional) | Lowercase, trimmed, sparse index |
| mobile | string (optional) | Sparse index |
| firstName, lastName | string (required) | Trimmed |
| status | boolean | Default true |
| profileImage | string | URL |
| dateOfBirth | Date | |
| gender | enum | male, female, other, prefer_not_to_say |
| address | embedded | street, suburb, state (AU enum), postcode (/^\d{4}$/), country (default AU) |
| tfnLastThree | string | Last 3 digits of TFN (for display) |
| tfnEncrypted | string | AES-256-GCM encrypted TFN (select: false) |
| abnNumber | string | |
| maritalStatus | enum | single, married, de_facto, separated, divorced, widowed |
| preferredLanguage | enum | en, zh, hi, pa, vi, ar, other |
| preferredContact | enum | call, sms, email, whatsapp |
| timezone | string | Default Australia/Sydney |
| referralCode | string | Unique, sparse |
| creditBalance | number | Default 0 (cents) |
| storageUsed | number | Bytes, default 0 |
| storageQuota | number | Bytes, default 524288000 (500MB) |
| fcmTokens | array | `{ token, deviceId, platform (ios/android/web), lastUsed }` |
| consentRecord | embedded | `{ marketingSms, marketingEmail, marketingWhatsapp, marketingPush }` each with `{ consented, date, source }` |
| college | string | For student users |
| discount | number | Default 0 |
| isDeleted | boolean | Soft delete flag, indexed |
| deletedAt | Date | |

**Model** (`user.model.ts`):
- Applies `authPlugin` and `rbacPlugin`
- Indexes: `{firstName: 1, lastName: 1}`, `{userType: 1, status: 1}`, `{isDeleted: 1, status: 1}`
- Soft-delete default filters on `find`, `findOne`, `countDocuments` — automatically adds `isDeleted: { $ne: true }` unless explicitly queried

**TFN Encryption** (`user.model.ts:127-149`):
- `encryptTfn(tfn)`: AES-256-GCM. Key from `getConfig().ENCRYPTION_KEY` (fix for S-8: uses config module, not `process.env`). Random 12-byte IV. Returns `iv:authTag:ciphertext` (all hex).
- `decryptTfn(encrypted)`: Splits on `:`, reconstructs decipher with IV and auth tag.

**Service** (`user.service.ts`): Factory function returning 7 methods:
| Method | Description |
|--------|-------------|
| `listUsers(query)` | Paginated, sorted, filtered list. Applies scopeFilter. Search uses `escapeRegex()` (fix for B-25) |
| `getUserById(id, scopeFilter?)` | Single user by ID with scope enforcement |
| `createUser(data)` | Create new user |
| `updateUser(id, data, scopeFilter?)` | Update with scope enforcement |
| `toggleStatus(id, scopeFilter?)` | Toggle active/inactive (fix for B-23: applies scopeFilter) |
| `softDelete(id, scopeFilter?)` | Set isDeleted=true (fix for B-24: applies scopeFilter) |
| `updateTfn(userId, tfn)` | Encrypts TFN, stores encrypted + last 3 digits |

**Routes** (`user.routes.ts`): 8 endpoints:
| Method | Path | Auth/RBAC | Description |
|--------|------|-----------|-------------|
| GET | `/users/me` | JWT | Get current user profile |
| PUT | `/users/me` | JWT | Update own profile (safe fields only) |
| GET | `/users` | JWT + users:read | List users (paginated, scoped) |
| GET | `/users/:id` | JWT + users:read | Get user by ID (scoped) |
| POST | `/users` | JWT + users:create | Create user (with escalation check, fix for B-27/G-6) |
| PUT | `/users/:id` | JWT + users:update | Admin update (with escalation prevention, fix for B-27) |
| PATCH | `/users/:id/status` | JWT + users:update | Toggle status (scoped, fix for B-23) |
| DELETE | `/users/:id` | JWT + users:delete | Soft delete (scoped, fix for B-24) |
| PUT | `/users/me/consent` | JWT | Update marketing consent record |

**Escalation prevention** (`user.routes.ts:17-25`): `USER_TYPE_HIERARCHY` maps userType to privilege level. Both POST and PUT routes check that the actor cannot create/escalate a user to equal or higher privilege level. Only super_admin (userType 0) can assign userType 0 or 1.

### 8.5 Tax Rules Module

**Types** (`taxRule.types.ts`): Complete Australian tax configuration:
- `TaxBracket`: `{ min, max, rate, baseTax }` — all monetary values in cents
- `MedicareLevyConfig`: rate, surchargeRate, lowIncomeThreshold, phaseInRange, familyThreshold, additionalChildAmount
- `HecsHelpTier`: `{ min, max, rate }` — HECS-HELP repayment tiers
- `LitoConfig`: Low Income Tax Offset — maxOffset, lowerThreshold, upperThreshold, reductionRate
- `LmitoConfig`: Low and Middle Income Tax Offset
- `SeniorOffsetConfig`: Senior and Pensioner Tax Offset
- `ITaxRuleConfig`: Full config with financialYear, effectiveFrom/To, status (draft/active/archived), brackets, medicareLevy, hecsHelp, lito, lmito, seniorOffset, superannuationRate, gstRate, usageCount, createdBy, isFrozen

**Model** (`taxRule.model.ts`):
- Indexes: `{financialYear: 1, status: 1}`, `{status: 1}`
- **Immutability enforcement** (VER-INV-01, fix for B-26): Pre-save hook checks `isFrozen || usageCount > 0`. If frozen, blocks modification of financial fields: brackets, medicareLevy, hecsHelp, lito, lmito, seniorOffset, superannuationRate, gstRate, financialYear, effectiveFrom, effectiveTo.

**Seed data** (`taxRule.seed.ts`): FY2024-25 Australian tax brackets (Stage 3 tax cuts):
- 5 income brackets (0%, 16%, 30%, 37%, 45%)
- Medicare levy (2% + 1.5% surcharge)
- 18 HECS-HELP tiers (1%-10%)
- LITO ($700 max, phases out $37,500-$66,250)
- Superannuation 11.5%, GST 10%
- All monetary values in cents as per CLAUDE.md coding standards

**Routes** (`taxRule.routes.ts`): 6 endpoints:
| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/tax-rules` | system_config:read | List tax rules (paginated, filterable by status/year) |
| GET | `/tax-rules/active` | JWT only | Get currently active rule by date range |
| GET | `/tax-rules/:id` | system_config:read | Get single tax rule |
| POST | `/tax-rules` | system_config:create | Create tax rule (always starts as draft) |
| PATCH | `/tax-rules/:id` | system_config:update | Update tax rule (pre-save hook enforces immutability) |
| PATCH | `/tax-rules/:id/activate` | system_config:update | Activate rule (archives other active rules for same FY). Uses `updateOne` to set status without triggering immutability check (fix for B-26) |
| POST | `/tax-rules/:id/increment-usage` | JWT only | Atomically increment usage count and set isFrozen=true |

### 8.6 Health Endpoints

**GET /health** (shallow, public): Returns `{ status: 'ok', uptime: process.uptime(), timestamp }`. No authentication required.

**GET /health/deep** (deep, public — fix for B-21): Checks MongoDB connection state and Redis ping. Returns `{ status: 'ok'|'degraded', checks: { mongodb: 'ok'|'disconnected'|'error', redis: 'ok'|'disconnected' }, timestamp }`. Returns HTTP 200 if all ok, 503 if any service is down.

### 8.7 Database Layer

**MongoDB** (`database/connection.ts`): Mongoose connection with `autoIndex: false` in production. Error and disconnection event handlers.

**Redis** (`database/redis.ts`): ioredis client with `lazyConnect: true`, retry strategy (max 10 retries, exponential backoff up to 5s), `maxRetriesPerRequest: 3`.

---

## 9. Summary Statistics

| Metric | Value |
|--------|-------|
| Total TypeScript source files | 41 |
| Total type definition files | 5 (`types.ts` in each package) |
| Total test files | 7 |
| Total lines of TypeScript (source) | ~3,500 |
| Tier 1 packages | 6 |
| Application modules | 2 (user, tax-rules) |
| API endpoints | 41 total |
| Mongoose models | 5 (User, Role, PermissionSnapshot, AuditLog, OTP, TaxRuleConfig) |
| TypeScript interfaces/types defined | 50+ |
| Test cases | ~58 |
| PRD invariants enforced | SEC-INV: 8, RBAC-INV: 6, PRM-INV: 4, VER-INV: 1 |
