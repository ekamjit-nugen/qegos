# QA Sentinel Report: QEGOS Phase 0 Foundation — Code Quality & Architecture Audit

**Sentinel:** Vegeta (QA Sentinel)
**Date:** 2026-04-07
**Product:** QEGOS -- Tax Preparation & Client Management Platform (Australia Market)
**Target:** Full Phase 0 Foundation Codebase (packages/ + apps/api/)
**Analysis Type:** Static Analysis Only
**Verdict:** FAIL
**Threat Level:** Critical 5 | High 12 | Medium 15 | Low 8
**Previous Report:** First assessment

---

## Executive Summary

The QEGOS Phase 0 foundation is a **complete TypeScript compliance failure**. Every single source file in the project -- all 46 of them -- is written in JavaScript. There are zero TypeScript files, zero tsconfig.json files, zero type definitions, zero interfaces. The user explicitly mandated TypeScript for both backend (Node.js + Express) and frontend (Next.js), and the codebase violates this requirement in its entirety. This alone makes the codebase unsuitable for production in its current form.

Setting the language violation aside to evaluate the code on its own terms: the JavaScript implementation is actually well-structured and shows strong architectural discipline. The monorepo structure follows the CLAUDE.md specification. The Tier 1 packages are genuinely product-agnostic with dependency injection. The security implementation (JWT rotation with replay detection, bcrypt at cost 12, AES-256-GCM for TFN, mongo-sanitize globally, Helmet, CORS) is above average for a Phase 0. The RBAC middleware with Redis-cached role lookups and scope injection is correctly implemented per PRD spec. The audit log's append-only enforcement via Mongoose pre-hooks is a solid pattern.

However, beyond the TypeScript issue, there are critical security vulnerabilities (MFA bypass, unprotected OTP storage, missing CSRF, audit log search injection), missing test coverage (literally zero tests exist), missing README files for all packages, a `crypto` npm dependency that should not exist (Node.js built-in), and several PRD invariant implementations that are incomplete or incorrect. The password policy validation in authValidators.js duplicates and diverges from passwordService.js. The TFN encryption key is accessed directly from process.env in the model layer rather than through the config system.

**Overall Health Score: 3/10** -- The architecture is correct; the implementation language is wrong; tests are absent; several security gaps are exploitable.

---

## 1. Language Compliance Audit

### Verdict: FAIL -- Total Violation

| Metric | Count |
|--------|-------|
| **.js files (VIOLATION)** | **46** |
| **.ts files** | **0** |
| **tsconfig.json files** | **0** |
| **Type definition files (.d.ts)** | **0** |
| **Interface definitions** | **0** |

#### Every JavaScript File (Each is a Violation)

**packages/error-handler/ (5 files)**
| # | File | Lines |
|---|------|-------|
| 1 | `src/AppError.js` | 41 |
| 2 | `src/errorCodes.js` | 58 |
| 3 | `src/globalErrorHandler.js` | 90 |
| 4 | `src/asyncHandler.js` | 22 |
| 5 | `src/index.js` | 13 |

**packages/validator/ (4 files)**
| # | File | Lines |
|---|------|-------|
| 6 | `src/validate.js` | 42 |
| 7 | `src/validators.js` | 247 |
| 8 | `src/sanitize.js` | 29 |
| 9 | `src/index.js` | 11 |

**packages/rate-limiter/ (4 files)**
| # | File | Lines |
|---|------|-------|
| 10 | `src/createLimiter.js` | 64 |
| 11 | `src/authLimiters.js` | 64 |
| 12 | `src/apiLimiter.js` | 27 |
| 13 | `src/index.js` | 11 |

**packages/auth/ (8 files)**
| # | File | Lines |
|---|------|-------|
| 14 | `src/services/jwtService.js` | 173 |
| 15 | `src/services/passwordService.js` | 60 |
| 16 | `src/services/otpService.js` | 110 |
| 17 | `src/services/mfaService.js` | 86 |
| 18 | `src/models/authPlugin.js` | 140 |
| 19 | `src/models/otpModel.js` | 41 |
| 20 | `src/middleware/authMiddleware.js` | 113 |
| 21 | `src/validators/authValidators.js` | 126 |
| 22 | `src/routes/authRoutes.js` | 780 |
| 23 | `src/index.js` | 64 |

**packages/rbac/ (7 files)**
| # | File | Lines |
|---|------|-------|
| 24 | `src/models/roleModel.js` | 92 |
| 25 | `src/models/permissionSnapshotModel.js` | 168 |
| 26 | `src/models/rbacPlugin.js` | 21 |
| 27 | `src/middleware/checkPermission.js` | 187 |
| 28 | `src/seed/defaultRoles.js` | 173 |
| 29 | `src/services/anomalyDetector.js` | 265 |
| 30 | `src/routes/rbacRoutes.js` | 360 |
| 31 | `src/index.js` | 20 |

**packages/audit-log/ (5 files)**
| # | File | Lines |
|---|------|-------|
| 32 | `src/models/auditLogModel.js` | 142 |
| 33 | `src/services/auditService.js` | 125 |
| 34 | `src/middleware/auditMiddleware.js` | 92 |
| 35 | `src/routes/auditRoutes.js` | 229 |
| 36 | `src/index.js` | 13 |

**apps/api/ (10 files)**
| # | File | Lines |
|---|------|-------|
| 37 | `src/config/env.js` | 74 |
| 38 | `src/database/connection.js` | 43 |
| 39 | `src/database/redis.js` | 65 |
| 40 | `src/app.js` | 239 |
| 41 | `src/server.js` | 75 |
| 42 | `src/modules/user/user.model.js` | 326 |
| 43 | `src/modules/user/user.routes.js` | 339 |
| 44 | `src/modules/tax-rules/taxRule.model.js` | 235 |
| 45 | `src/modules/tax-rules/taxRule.seed.js` | 121 |
| 46 | `src/modules/tax-rules/taxRule.routes.js` | 249 |

#### What Is Missing for TypeScript Compliance

| # | ID | Missing Item | Impact | Effort |
|---|-----|-------------|--------|--------|
| 1 | T-1 | Root `tsconfig.json` with project references | No TypeScript compilation possible | S |
| 2 | T-2 | Per-package `tsconfig.json` (6 packages + 1 app) | No per-package TypeScript compilation | S |
| 3 | T-3 | All 46 `.js` files must be rewritten as `.ts` | Complete language compliance failure | XL |
| 4 | T-4 | Type interfaces for all models (User, Role, AuditLog, TaxRuleConfig, OTP, PermissionSnapshot) | No type safety on data models | L |
| 5 | T-5 | Type interfaces for all service configs (AuthConfig, RBACConfig, RateLimiterConfig, etc.) | No type safety on init() configurations | M |
| 6 | T-6 | Type interfaces for all API request/response payloads | No type safety on API boundaries | L |
| 7 | T-7 | Type exports from each @nugen/* package (`index.d.ts` or inline) | Consuming packages have no type information | M |
| 8 | T-8 | ESLint config needs `@typescript-eslint/parser` and rules | Current eslint config only targets `.js` files | S |
| 9 | T-9 | Jest config needs `ts-jest` or `@swc/jest` transform | Test runner cannot handle `.ts` files | S |
| 10 | T-10 | `package.json` scripts need `tsc --build` step | No build pipeline for TypeScript | S |
| 11 | T-11 | Frontend apps (admin, web) must be Next.js with TypeScript | No frontend apps exist yet (apps/admin/, apps/web/ are empty) | XL |

---

## 2. Folder Structure Audit

### Verdict: PASS WITH WARNINGS

#### Monorepo Root Structure

| Item | CLAUDE.md Spec | Actual | Status |
|------|---------------|--------|--------|
| `CLAUDE.md` | Required | Present | PASS |
| `QEGOS-FINAL-PRD-v4.md` | Required | Present | PASS |
| `docs/` | Required | Present (7 docs) | PASS |
| `packages/` | Required | Present (6 packages) | PASS |
| `apps/` | Required | Present (api only) | WARNING |
| `tools/` | Optional | Missing | N/A |
| Root `package.json` with workspaces | Required | Present, correct workspace config | PASS |
| `.env.example` | Best practice | Present | PASS |
| `.gitignore` | Best practice | Present | PASS |

#### Package Naming Convention (@nugen/*)

| # | Package | Expected Name | Actual Name | Status |
|---|---------|--------------|-------------|--------|
| 1 | error-handler | `@nugen/error-handler` | `@nugen/error-handler` | PASS |
| 2 | validator | `@nugen/validator` | `@nugen/validator` | PASS |
| 3 | rate-limiter | `@nugen/rate-limiter` | `@nugen/rate-limiter` | PASS |
| 4 | auth | `@nugen/auth` | `@nugen/auth` | PASS |
| 5 | rbac | `@nugen/rbac` | `@nugen/rbac` | PASS |
| 6 | audit-log | `@nugen/audit-log` | `@nugen/audit-log` | PASS |
| 7 | apps/api | `@qegos/api` | `@qegos/api` | PASS |

#### Per-Package Structure Compliance

| Package | `src/` | `index.js` | `package.json` | `README.md` | Status |
|---------|--------|-----------|----------------|------------|--------|
| error-handler | PASS | PASS | PASS | **MISSING** | WARNING |
| validator | PASS | PASS | PASS | **MISSING** | WARNING |
| rate-limiter | PASS | PASS | PASS | **MISSING** | WARNING |
| auth | PASS | PASS | PASS | **MISSING** | WARNING |
| rbac | PASS | PASS | PASS | **MISSING** | WARNING |
| audit-log | PASS | PASS | PASS | **MISSING** | WARNING |

CLAUDE.md Rule 5 states: "Each Module Has: `src/`, `index.js` (public API), `package.json`, `README.md`." All 6 packages are missing README.md files.

#### Phase 0 Checklist Compliance

| # | Required Package | Status | Notes |
|---|-----------------|--------|-------|
| 1 | `@nugen/error-handler` | PRESENT | 5 files, well-structured |
| 2 | `@nugen/validator` | PRESENT | 4 files, includes mongo-sanitize |
| 3 | `@nugen/rate-limiter` | PRESENT | 4 files, Redis-backed |
| 4 | `@nugen/auth` | PRESENT | 10 files, comprehensive |
| 5 | `@nugen/rbac` | PRESENT | 8 files, comprehensive |
| 6 | `@nugen/audit-log` | PRESENT | 5 files, append-only enforced |

#### Missing Application Surfaces

| App | CLAUDE.md Spec | Status | Note |
|-----|---------------|--------|------|
| `apps/api/` | Required | Present | Functional Express app |
| `apps/admin/` | Required | **MISSING** | No admin dashboard yet |
| `apps/web/` | Required | **MISSING** | No client web app yet |
| `apps/mobile/` | Required | **MISSING** | No mobile app yet |

These are expected for Phase 0 (foundation only), but the directories do not exist at all.

---

## 3. Code Quality Audit

### 3.1 @nugen/error-handler

| # | ID | Finding | Severity | Confidence | Location | Fix |
|---|-----|---------|----------|------------|----------|-----|
| 1 | B-1 | `globalErrorHandler` uses `console.error` instead of a structured logger | Low | Confirmed | `globalErrorHandler.js:77` | Replace with injected logger or structured logging library |
| 2 | B-2 | Missing error code `INTERNAL_ERROR` in `errorCodes.js` -- code `'INTERNAL_ERROR'` is hardcoded in `globalErrorHandler.js:84` but not defined in the enum | Low | Confirmed | `globalErrorHandler.js:84` | Add to errorCodes |
| 3 | G-1 | No `UNAUTHORIZED` error code separate from `INVALID_CREDENTIALS` (401 responses all use one code) | Low | Confirmed | `errorCodes.js` | Add `UNAUTHORIZED` for generic 401 vs credential-specific 401 |

**Assessment:** Solid, minimal, correct. The error standardization is well-done. Minor gaps only.

### 3.2 @nugen/validator

| # | ID | Finding | Severity | Confidence | Location | Fix |
|---|-----|---------|----------|------------|----------|-----|
| 1 | B-3 | `validate.js` uses `require('@nugen/error-handler')` inside the function body (lazy require), which is fine for circular dependency avoidance but adds per-request overhead | Low | Confirmed | `validate.js:32` | Move require to module level with a comment explaining the reason if circular dep exists |
| 2 | B-4 | TFN validator regex `^\d{3}\s?\d{3}\s?\d{3}$` does not validate the TFN check digit algorithm (weighted sum mod 11). Invalid TFNs like `000 000 000` would pass format validation. | Medium | Confirmed | `validators.js:15` | Add TFN check digit validation per ATO algorithm |
| 3 | B-5 | ABN validator regex `^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$` does not validate the ABN check digit algorithm (weighted sum mod 89). | Medium | Confirmed | `validators.js:21` | Add ABN check digit validation per ABR algorithm |
| 4 | G-2 | No `password` validator in the common validators -- auth package has its own inline validation but `passwordService.validatePolicy()` exists. Should expose a validator chain that delegates to passwordService. | Low | Confirmed | `validators.js` | Add `validators.password()` that wraps passwordService.validatePolicy |

**Assessment:** Good common validators. TFN and ABN need check digit validation -- format-only validation is insufficient for a tax platform.

### 3.3 @nugen/rate-limiter

| # | ID | Finding | Severity | Confidence | Location | Fix |
|---|-----|---------|----------|------------|----------|-----|
| 1 | B-6 | `authLimiters.js` uses `req.body.mobile` in keyGenerator for `otpSend`, but the body may not be parsed yet if rate limiter runs before body parser | Medium | Likely | `authLimiters.js:22` | Verify middleware ordering; if body parser runs first this is fine. In `app.js` body parser runs before route mounting, so this is likely OK. |
| 2 | G-3 | No per-endpoint rate limiter for admin operations (role changes, user deletion, config changes) | Medium | Confirmed | N/A | Add admin operation rate limiters |

**Assessment:** Clean implementation. Redis fallback to in-memory is properly handled.

### 3.4 @nugen/auth

| # | ID | Finding | Severity | Confidence | Location | Fix |
|---|-----|---------|----------|------------|----------|-----|
| 1 | S-1 | **CRITICAL: MFA verify endpoint allows unauthenticated access with only userId in body.** An attacker who knows a userId can brute-force MFA tokens. The `/mfa-verify` route has no `authMiddleware.authenticate` -- it relies on either `req.user` (authenticated) or `req.body.userId` (unauthenticated). The latter path has **no rate limiting**. | Critical | Confirmed | `authRoutes.js:659-746` | Add rate limiting to mfa-verify. Add a time-limited MFA challenge token from the signin response (instead of raw userId). Never accept raw userId for MFA verification. |
| 2 | S-2 | **OTP stored in plaintext in MongoDB.** The OTP value is stored as plain string in the Otp collection. If the database is compromised, all active OTPs are immediately usable. | High | Confirmed | `otpService.js:66`, `otpModel.js:22` | Hash OTP before storage (SHA-256 of OTP+mobile). Compare by hashing the input. |
| 3 | S-3 | **Backup codes stored in plaintext on the user document.** `mfaBackupCodes` field stores raw backup codes. Database compromise exposes all backup codes. | High | Confirmed | `authPlugin.js:69`, `mfaService.js:58` | Hash backup codes before storage. Compare by hashing input against stored hashes. |
| 4 | B-7 | `package.json` lists `"crypto": "^1.0.1"` as a dependency. This is an npm package that is **deprecated** and simply wraps Node.js built-in `crypto`. The code already uses `require('crypto')` which resolves to the built-in. The npm package is unnecessary and a supply-chain risk. | High | Confirmed | `auth/package.json:18` | Remove `"crypto": "^1.0.1"` from dependencies |
| 5 | B-8 | Password policy validation is duplicated: `authValidators.js` checks `isLength({ min: 8 })` for resetPassword and changePassword, but `passwordService.validatePolicy()` has the full policy (uppercase, number). The route handlers call `passwordService.validatePolicy()` AFTER express-validator. This means a password like `abcdefgh` (no uppercase, no number) passes express-validator, enters the route handler, and then fails with a different error format. | Medium | Confirmed | `authValidators.js:95-96,106-107` vs `authRoutes.js:489-496` | Remove the basic length check from authValidators and rely solely on passwordService in the handler, OR move the full policy into a custom express-validator. |
| 6 | B-9 | `authMiddleware.js` queries the database on EVERY authenticated request (`User.findById` with select). This is an N+1 problem at scale -- every API call hits MongoDB for user verification. | Medium | High Confidence | `authMiddleware.js:50` | Cache user status/passwordChangedAt in Redis with short TTL (30s). Invalidate on password change, status change, or deletion. |
| 7 | S-4 | `forgot-password` route uses `require('crypto')` inline (line 444) instead of at module top. Not a security issue per se, but the `sendPasswordResetEmail` hook could silently swallow errors if null. If the hook is not configured, the reset token is stored but never sent -- the user sees "link sent" but nothing arrives. | Low | Confirmed | `authRoutes.js:444,452-454` | Move require to top. Log a warning if sendPasswordResetEmail is not configured. |
| 8 | B-10 | `mfaService.enroll()` hardcodes issuer as `'QEGOS'` by default. Since this is a Tier 1 shared package, the issuer should come from configuration, not be hardcoded. | Low | Confirmed | `mfaService.js:23` | Make issuer configurable via init() |
| 9 | G-4 | No MFA disable endpoint. Users can enroll but cannot disable MFA. PRD GAP-C07 mentions enrollment/verification but disabling is a standard flow. | Medium | Confirmed | `authRoutes.js` | Add POST /mfa-disable with password re-verification |
| 10 | B-11 | `mfa-enroll` stores the secret before verification. If a user starts enrollment but never completes verification, the secret remains on the user document with `mfaEnabled: false`. A second enrollment overwrites it. This is functional but means orphaned secrets accumulate. | Low | High Confidence | `authRoutes.js:643-645` | Use a temporary store (Redis with TTL) for pending MFA enrollments |

### 3.5 @nugen/rbac

| # | ID | Finding | Severity | Confidence | Location | Fix |
|---|-----|---------|----------|------------|----------|-----|
| 1 | S-5 | `checkPermission.invalidateAllCaches()` uses `KEYS` command (`_redisClient.keys()`) which is O(N) and blocks Redis in production. With many cached roles, this will cause latency spikes. | High | Confirmed | `checkPermission.js:121` | Use `SCAN` iterator instead of `KEYS`. Or use a versioned cache prefix and bump the version on bulk invalidation. |
| 2 | B-12 | `seedRoles()` uses `$setOnInsert` which means existing roles are NEVER updated even if the seed data changes. If a developer fixes a permission in `defaultRoles.js`, the fix will not apply to existing deployments. | Medium | Confirmed | `defaultRoles.js:163-167` | Document this behavior. Provide a separate migration/upgrade script for permission changes. |
| 3 | B-13 | `PUT /roles/:id` -- the RBAC-INV-05 baseline comparison comment says "baseline comparison would be done against seed data in production" but the code does NOT implement this check. System roles can have their permissions reduced below baseline. | High | Confirmed | `rbacRoutes.js:95-97` | Implement baseline comparison against `defaultRoles` seed data. Reject permission reductions below baseline for system roles. |
| 4 | B-14 | `PUT /roles/assign/:userId` does not check if the target user exists before updating. `findByIdAndUpdate` returns null if not found, which is handled, but it does not check if the user is soft-deleted. A deleted user could be assigned a new role. | Medium | Confirmed | `rbacRoutes.js:208-212` | Add `{ isDeleted: { $ne: true } }` to the query filter |
| 5 | B-15 | `permissionSnapshotModel.js` computeDiff is a static method but accessed via `PermissionSnapshot.computeDiff` which may not exist if the model was retrieved from cache or a different connection. The code in `rbacRoutes.js:123-125` has a guard (`if (PermissionSnapshot.computeDiff)`) but silently returns empty diff if missing. | Low | Likely | `rbacRoutes.js:123-125` | Import computeDiff as a standalone function rather than relying on model statics |

### 3.6 @nugen/audit-log

| # | ID | Finding | Severity | Confidence | Location | Fix |
|---|-----|---------|----------|------------|----------|-----|
| 1 | S-6 | **Audit log search endpoint passes user input directly to `$regex`.** The `search` parameter in `POST /audit-logs` is used as `{ $regex: search, $options: 'i' }`. While mongo-sanitize strips `$` operators from input, a user-supplied regex can cause ReDoS (Regular Expression Denial of Service) with crafted patterns like `(a+)+$`. | High | Confirmed | `auditRoutes.js:79` | Escape regex special characters in the search input using a helper like `escapeRegExp()`. Or use `$text` search with a text index. |
| 2 | B-16 | `auditMiddleware.js` post-save hook checks `doc.wasNew || doc.$isNew` but `$isNew` may be unreliable after save completes. The pre-save hook sets `this.wasNew = this.isNew` which is the correct approach, but `doc.$isNew` should not be in the OR condition. | Low | Likely | `auditMiddleware.js:33` | Remove `doc.$isNew` from the condition, rely only on `doc.wasNew` |
| 3 | B-17 | `auditMiddleware.js` pre-save hook accesses `this.$locals._modifiedPaths` without checking if `$locals` exists, but the post-save hook guards with optional chaining. The pre-save hook should also guard. | Medium | Confirmed | `auditMiddleware.js:65` | Change to `if (!this.isNew) { if (!this.$locals) this.$locals = {}; this.$locals._modifiedPaths = this.modifiedPaths(); }` |
| 4 | B-18 | `auditService.js` `logFromRequest` spread operator puts `...entry` after `actor` and `actorType`, which means entry.actor/actorType values override the values computed from req.user. This is correct for explicit overrides but could lead to confusion. | Low | Confirmed | `auditService.js:71-75` | Document the override behavior or restructure |
| 5 | G-5 | Audit log export is capped at 10,000 records with no streaming or pagination. For a 7-year retention requirement with potentially millions of records, this export will fail for compliance audits. | High | Confirmed | `auditRoutes.js:119` | Implement streaming CSV/JSON export using cursor or implement paginated export with a background job. |
| 6 | B-19 | The `deleteMany` hook's archival bypass mechanism (`this.getOptions().__archival`) is undocumented and fragile. There is no utility function to perform archival-safe deletes. | Medium | Confirmed | `auditLogModel.js:123-124` | Create a documented `archivalDelete()` static method on the model |

### 3.7 apps/api

| # | ID | Finding | Severity | Confidence | Location | Fix |
|---|-----|---------|----------|------------|----------|-----|
| 1 | S-7 | **No CSRF protection.** The app uses `cookie-parser` and auth routes accept refresh tokens from cookies (`req.cookies?.refreshToken`), but there is no CSRF middleware. A cross-site attacker could forge token refresh and logout requests. | High | Confirmed | `app.js:60` | Add `csurf` or `csrf-csrf` middleware for state-changing operations that accept cookies |
| 2 | B-20 | `app.js` health check route reads `require('../../package.json').version` with a relative path that resolves to `apps/api/package.json` (version `0.1.0`), NOT the root package.json. This is minor but could be misleading. | Low | Confirmed | `app.js:85` | Use the root package.json or explicitly label which version this is |
| 3 | B-21 | `app.js` deep health check requires authentication (`auth.authMiddleware.authenticate`). This means external monitoring tools (Datadog, CloudWatch) cannot hit this endpoint without a valid JWT. | Medium | Confirmed | `app.js:89` | Use a separate auth mechanism (API key, shared secret) for monitoring endpoints, or make it unauthenticated but IP-restricted |
| 4 | B-22 | `server.js` Redis connection uses `lazyConnect: true` in redis.js but then calls `redisClient.connect()` in server.js. The `connect()` call catches errors and continues, meaning the app boots without Redis. However, rate limiters initialized with a disconnected Redis client may throw errors on first request. | Medium | High Confidence | `server.js:19-23`, `redis.js:28` | Verify that rate-limit-redis handles disconnected clients gracefully, or wrap the Redis store in a try-catch at request time |
| 5 | S-8 | `user.model.js` TFN encryption reads `process.env.ENCRYPTION_KEY` directly instead of using the config module (`config/env.js`). This bypasses any future config validation or key rotation logic. | Medium | Confirmed | `user.model.js:283,306` | Import config and use `config.encryptionKey` |
| 6 | B-23 | `user.routes.js` `PATCH /:id/status` does not apply `req.scopeFilter`. An office_manager or staff member with "users:update:assigned" scope could toggle status on ANY user, not just assigned ones. | High | Confirmed | `user.routes.js:291` | Add `...req.scopeFilter` to the findById query, similar to other routes |
| 7 | B-24 | `user.routes.js` `DELETE /:id` does not apply `req.scopeFilter`. Same IDOR risk as B-23. | High | Confirmed | `user.routes.js:318` | Add scopeFilter to query |
| 8 | B-25 | `user.routes.js` search uses `$regex` with user input for firstName, lastName, email, mobile. While mongo-sanitize strips `$` operators, the regex itself can cause ReDoS. | Medium | High Confidence | `user.routes.js:183-188` | Escape regex special characters |
| 9 | B-26 | `taxRule.routes.js` `PATCH /:snapshotId/activate` manually sets `rule._originalUsageCount = 0` and `rule._originalStatus = 'draft'` to bypass the immutability check. This is a workaround that defeats the safety mechanism. If the code is wrong and the rule WAS already used, this override allows corruption. | High | Confirmed | `taxRule.routes.js:187-188` | Instead of bypassing the pre-save hook, use `updateOne()` for status transitions (like `incrementUsage` does) |
| 10 | G-6 | `user.routes.js` has no `POST /users` route for admin user creation. Admins/staff can only be created through... nothing. There is no admin user creation endpoint. | High | Confirmed | `user.routes.js` | Add `POST /users` with `checkPermission.check('users', 'create')` |
| 11 | B-27 | `user.routes.js` `PUT /users/:id` (admin edit) allows setting `userType` without checking escalation. A regular admin could set `userType: 0` (super_admin) on any user. | Critical | Confirmed | `user.routes.js:248` | Add escalation check: only super_admin can set userType to 0 or 1 |

---

## 4. PRD Compliance Check

### Security Invariants (SEC-INV-*)

| Invariant | PRD Requirement | Implementation Status | Confidence | Notes |
|-----------|----------------|----------------------|------------|-------|
| SEC-INV-01 | Rate limiting on auth endpoints | PASS | Confirmed | `authLimiters.js` implements OTP 3/15min, signin 5/15min, forgot-password 3/hr |
| SEC-INV-02 | Account lockout after failed attempts | PASS | Confirmed | `authPlugin.js:92-101` -- 10 attempts, 30min lock |
| SEC-INV-03 | Refresh tokens hashed before storage | PASS | Confirmed | `jwtService.js:82` -- bcrypt hash |
| SEC-INV-04 | Token rotation with replay detection | PASS | Confirmed | `authRoutes.js:321-335` -- old token reuse revokes all |
| SEC-INV-05 | JWT invalidation after password change | PASS | Confirmed | `authMiddleware.js:79-88` -- compares `iat` vs `passwordChangedAt` |
| SEC-INV-06 | Max 5 concurrent sessions | PASS | Confirmed | `jwtService.js:135-148` -- enforces max sessions |
| SEC-INV-07 | Bcrypt cost 12 | PASS | Confirmed | `passwordService.js:5` |
| SEC-INV-08 | OTP 5-min expiry, single use | PASS | Confirmed | `otpService.js:69,105` -- TTL index + delete after verify |
| SEC-INV-09 | TFN AES-256-GCM encryption | PASS | Confirmed | `user.model.js:282-322` -- correct GCM implementation |
| SEC-INV-10 | Helmet security headers | PASS | Confirmed | `app.js:31-38` -- HSTS, frameguard deny, xContentTypeOptions |
| SEC-INV-11 | CORS whitelist | PASS | Confirmed | `app.js:42-48` -- explicit origin list, credentials true |
| SEC-INV-13 | No stack traces in production | PASS | Confirmed | `globalErrorHandler.js:80-87` -- production check |

### RBAC Invariants (RBAC-INV-*)

| Invariant | PRD Requirement | Implementation Status | Confidence | Notes |
|-----------|----------------|----------------------|------------|-------|
| RBAC-INV-01 | 7 system roles with baseline permissions | PASS | Confirmed | `defaultRoles.js` -- all 7 roles seeded |
| RBAC-INV-02 | Scope filter injection (all/assigned/own) | PASS | Confirmed | `checkPermission.js:79-95` |
| RBAC-INV-03 | Route handlers MUST apply scopeFilter | **PARTIAL FAIL** | Confirmed | `PATCH /:id/status` and `DELETE /:id` in user.routes.js do NOT apply scopeFilter (B-23, B-24) |
| RBAC-INV-05 | System roles cannot have permissions reduced below baseline | **FAIL** | Confirmed | Code has a TODO comment but no implementation (B-13) |
| RBAC-INV-07 | AuditLog append-only | PASS | Confirmed | Pre-hooks block update/delete operations |
| RBAC-INV-08 | 403 identical regardless of resource existence | PASS | Confirmed | `checkPermission.js:178-184` -- generic message |
| RBAC-INV-10 | Audit log archival to S3 after 12 months | **NOT IMPLEMENTED** | Confirmed | Archival cron job does not exist |
| RBAC-INV-11 | Role cache TTL 5 minutes | PASS | Confirmed | `checkPermission.js:10` -- 300 seconds |
| RBAC-INV-12 | Disabled role = zero permissions | PASS | Confirmed | `checkPermission.js:63-64` |

### Permission Invariants (PRM-INV-*)

| Invariant | PRD Requirement | Implementation Status | Confidence | Notes |
|-----------|----------------|----------------------|------------|-------|
| PRM-INV-01 | Permission change snapshots | PASS | Confirmed | `rbacRoutes.js:122-135` -- snapshot created on role update |
| PRM-INV-02 | Reason required for permission changes | PASS | Confirmed | `rbacRoutes.js:83-84` -- validated |
| PRM-INV-03 | Escalation requires super_admin | PASS | Confirmed | `rbacRoutes.js:101-119` -- checks for sensitive resources |
| PRM-INV-05 | Simulate is read-only | PASS | Confirmed | `rbacRoutes.js:342` -- no writes |

### Versioning Invariants (VER-INV-*)

| Invariant | PRD Requirement | Implementation Status | Confidence | Notes |
|-----------|----------------|----------------------|------------|-------|
| VER-INV-01 | Used tax configs are permanently immutable | **PARTIAL** | High Confidence | Pre-save hook exists but can be bypassed by the activate route (B-26). `incrementUsage` correctly uses `updateOne` to bypass the hook for the counter. |

### Gap Analysis Findings (from Goku - GAP-C*)

| Gap ID | Requirement | Status | Notes |
|--------|------------|--------|-------|
| GAP-C07 | MFA enrollment/verification APIs | **IMPLEMENTED** | `/mfa-enroll`, `/mfa-verify`, `/mfa-backup-codes` all present |
| GAP-C14 | mongo-sanitize middleware globally | **IMPLEMENTED** | `sanitize` middleware in `app.js:70` |
| GAP-C01/C02 | Privacy Act 1988 data anonymization/erasure | **NOT IMPLEMENTED** | No data deletion request model, no anonymization workflow |
| GAP-C03 | Saga pattern for async flows | **NOT IMPLEMENTED** | No saga or compensation pattern present |

---

## 5. Security Audit

### 5.1 Critical Vulnerabilities

| # | ID | Vulnerability | OWASP Category | Location | Confidence | Attack Vector | Impact | Effort | Remediation |
|---|-----|---------------|----------------|----------|------------|---------------|--------|--------|-------------|
| 1 | S-1 | MFA verify accepts raw userId without authentication or rate limiting | A07:2021 Identification & Auth Failures | `authRoutes.js:659-746` | Confirmed | Attacker obtains userId (predictable ObjectId), brute-forces 6-digit TOTP (1M combinations). Without rate limiting, automated tools can crack it in under 1 hour. | Complete MFA bypass, full account takeover | S | Issue time-limited MFA challenge token from signin. Rate-limit mfa-verify to 5 attempts per userId per 15 minutes. |
| 2 | B-27 | User type escalation -- admin can set any user to super_admin | A01:2021 Broken Access Control | `user.routes.js:248` | Confirmed | Any admin-level user sends `PUT /users/:id` with `{"userType": 0}`. No escalation check prevents this. | Privilege escalation to super_admin | S | Only super_admin (userType 0) can set userType to 0 or 1. Add check in route handler. |

### 5.2 High Vulnerabilities

| # | ID | Vulnerability | OWASP Category | Location | Confidence | Attack Vector | Impact | Effort | Remediation |
|---|-----|---------------|----------------|----------|------------|---------------|--------|--------|-------------|
| 1 | S-2 | OTP stored in plaintext | A02:2021 Cryptographic Failures | `otpService.js:66` | Confirmed | Database compromise exposes all active OTPs | Account takeover via OTP replay | S | Hash OTP before storage |
| 2 | S-3 | MFA backup codes stored in plaintext | A02:2021 Cryptographic Failures | `authPlugin.js:69` | Confirmed | Database compromise exposes backup codes | MFA bypass | S | Hash backup codes |
| 3 | S-5 | Redis KEYS command in production | N/A (Availability) | `checkPermission.js:121` | Confirmed | Admin updates role, triggering `invalidateAllCaches()` with `KEYS` which blocks Redis | Denial of Service on all rate limiting and role cache | S | Use SCAN or versioned prefix |
| 4 | S-6 | Audit log search vulnerable to ReDoS | A03:2021 Injection | `auditRoutes.js:79` | Confirmed | User sends `search: "(a+)+$"` to `POST /audit-logs` | Server CPU exhaustion, DoS | S | Escape regex characters |
| 5 | S-7 | No CSRF protection on cookie-based auth | A01:2021 Broken Access Control | `app.js:60` | Confirmed | Cross-site form submission to `/auth/refresh` or `/auth/logout` using httpOnly cookies | Session hijacking via token refresh | M | Add CSRF tokens |
| 6 | B-23 | IDOR on user status toggle | A01:2021 Broken Access Control | `user.routes.js:291` | Confirmed | Staff with `users:update:assigned` scope sends `PATCH /users/:any-id/status` | Unauthorized user deactivation | S | Apply scopeFilter |
| 7 | B-24 | IDOR on user deletion | A01:2021 Broken Access Control | `user.routes.js:318` | Confirmed | Same as B-23 but for soft-delete | Unauthorized user deletion | S | Apply scopeFilter |

### 5.3 Medium Vulnerabilities

| # | ID | Vulnerability | Location | Confidence | Remediation |
|---|-----|--------------|----------|------------|-------------|
| 1 | S-8 | Encryption key bypasses config system | `user.model.js:283` | Confirmed | Use config module |
| 2 | B-25 | User search ReDoS | `user.routes.js:183-188` | High Confidence | Escape regex |
| 3 | B-26 | Tax rule immutability bypass | `taxRule.routes.js:187-188` | Confirmed | Use updateOne for status transitions |

### 5.4 Compliance Check

| Framework | Requirement | Status | Finding | Remediation |
|-----------|------------|--------|---------|-------------|
| Privacy Act 1988 APP 11 | Right to erasure / data destruction | FAIL | No data deletion request model, no anonymization workflow (GAP-C01/C02) | Build DataDeletionRequest model and anonymization pipeline |
| Privacy Act 1988 APP 6 | Collection consent | PARTIAL | Consent record exists on User model for marketing channels. No explicit consent collection UI flow exists. | Implement consent collection on signup |
| Spam Act 2003 | Unsubscribe mechanism | PARTIAL | Consent record tracks consent state but no unsubscribe endpoint or link generation exists | Build unsubscribe endpoints |
| ATO Record Keeping | 7-year audit log retention | PARTIAL | Append-only enforced. No archival cron job (RBAC-INV-10). No S3 Glacier integration. | Build archival cron job |
| OWASP A01 | Broken Access Control | FAIL | IDOR on user status/delete (B-23, B-24), user type escalation (B-27) | Fix scopeFilter application, add escalation check |
| OWASP A02 | Cryptographic Failures | FAIL | OTP plaintext (S-2), backup codes plaintext (S-3) | Hash before storage |
| OWASP A03 | Injection | PARTIAL PASS | mongo-sanitize globally applied. But ReDoS via $regex on user search and audit search (S-6, B-25) | Escape regex characters |
| OWASP A04 | Insecure Design | PASS | Architecture is sound, Tier 1/2 separation correct | N/A |
| OWASP A05 | Security Misconfiguration | PASS | Helmet configured, CORS restricted, env vars validated | N/A |
| OWASP A07 | Identification & Auth Failures | FAIL | MFA bypass (S-1) | Fix MFA verify flow |
| OWASP A08 | Software and Data Integrity | PASS | Tax rule immutability (mostly), permission snapshots | Minor bypass to fix (B-26) |
| OWASP A09 | Security Logging & Monitoring | PASS | Comprehensive audit logging | Archival needed |

### 5.5 Security Scorecard

| Category | Score (1-10) | Key Findings |
|----------|-------------|--------------|
| Authentication | 6 | Solid JWT rotation, but MFA bypass (S-1) is critical |
| Authorization | 5 | RBAC well-designed but IDOR bugs (B-23, B-24) and escalation (B-27) |
| Input Validation | 7 | express-validator + mongo-sanitize, but ReDoS vectors exist |
| Data Protection | 6 | AES-256-GCM for TFN, but OTP/backup codes in plaintext |
| API Security | 7 | Rate limiting, standardized errors, but no CSRF |
| Configuration | 8 | Env validation, Helmet, CORS -- well done |
| Compliance | 4 | Major gaps in Privacy Act 1988 and audit archival |
| **Overall** | **6/10** | |

---

## 6. Gaps Identified

| # | ID | Gap Type | Description | Impact if Unaddressed | Effort | Priority | Recommendation |
|---|-----|----------|-------------|-----------------------|--------|----------|----------------|
| 1 | G-7 | Test Coverage | Zero test files exist anywhere in the project. No unit, integration, or E2E tests. | No regression safety. Every change is a gamble. Every future developer is flying blind. | XL | Immediate | Prioritize tests for auth (security-critical), RBAC (access-critical), and tax rules (compliance-critical) |
| 2 | G-8 | Documentation | All 6 packages missing README.md (CLAUDE.md Rule 5 violation) | New developers cannot understand package APIs without reading source | M | Short-term | Generate README for each package with API docs, usage examples, configuration reference |
| 3 | G-9 | Logging | All packages use `console.error`/`console.warn` instead of structured logging | No log aggregation, no severity levels in production, no correlation IDs | L | Short-term | Introduce a logger package (Winston/Pino) with structured JSON output, request correlation IDs |
| 4 | G-10 | Monitoring | No request tracing, no correlation IDs, no APM integration | Cannot debug production issues, cannot measure latency per endpoint | L | Long-term | Add correlation ID middleware, integrate with Datadog APM |
| 5 | G-11 | Health Check | Deep health check requires authentication (B-21) | External monitoring cannot verify system health | S | Short-term | Add unauthenticated deep health at `/health/ready` with IP restriction |
| 6 | G-12 | Admin User Creation | No API endpoint to create admin/staff users (G-6) | Cannot onboard staff through the API | M | Immediate | Add POST /users endpoint |
| 7 | G-13 | Data Archival | No audit log archival cron job (RBAC-INV-10) | Unbounded collection growth, potential compliance failure for 7-year retention | L | Short-term | Build BullMQ job for monthly archival to S3 Glacier |
| 8 | G-14 | Privacy Compliance | No data deletion/anonymization workflow (GAP-C01/C02) | Privacy Act 1988 violation. Regulatory risk. | L | Immediate | Build DataDeletionRequest model and anonymization pipeline |
| 9 | G-15 | Swagger/OpenAPI | No API documentation | Frontend developers, QA, and external consumers have no API reference | M | Short-term | Add swagger-jsdoc or tsoa (when TypeScript migration is done) |
| 10 | G-16 | Feature Flags | No feature flag system | Cannot safely deploy partial features or kill misbehaving features | M | Long-term | Integrate LaunchDarkly or build simple Redis-backed feature flags |

---

## 7. Performance Observations (Static Analysis)

| # | Pattern | Location | Concern | Confidence | Recommendation |
|---|---------|----------|---------|------------|----------------|
| 1 | DB query per authenticated request | `authMiddleware.js:50` | Every API call hits MongoDB for user status check | Confirmed | Cache user auth state in Redis with 30s TTL |
| 2 | Redis KEYS command | `checkPermission.js:121` | O(N) blocking scan of all keys | Confirmed | Use SCAN or versioned cache prefix |
| 3 | N+1 in access-report | `rbacRoutes.js:235-248` | Loop over roles with individual `countDocuments` per role | Confirmed | Use aggregation pipeline with `$lookup` or batch the roleId query |
| 4 | Unbounded audit log export | `auditRoutes.js:117-119` | 10,000 docs loaded into memory | Confirmed | Use cursor-based streaming |
| 5 | No connection pooling config for Redis | `redis.js` | Default ioredis settings, no maxRetriesPerRequest | High Confidence | Configure connection pool size and timeout settings |

---

## 8. Test Coverage Assessment

| Layer | Current Coverage | Critical Gaps | Generated Tests |
|-------|-----------------|---------------|-----------------|
| Unit | **0% -- Zero tests exist** | Auth service, password policy, OTP, MFA, TFN encryption, RBAC scope filter, audit log immutability, tax rule immutability, error handler | 0 |
| Integration | **0% -- Zero tests exist** | Auth routes (all 13 endpoints), RBAC routes (7 endpoints), user routes (8 endpoints), tax rule routes (6 endpoints), audit routes (4 endpoints) | 0 |
| E2E | **0% -- Zero tests exist** | Full auth flow (OTP -> signup -> login -> refresh -> logout), RBAC flow (role assign -> permission check -> scope filter), tax rule lifecycle (create draft -> activate -> freeze) | 0 |

### Missing Critical Test Cases

| # | What Should Be Tested | Why It Matters | Test Generated? |
|---|----------------------|----------------|-----------------|
| 1 | MFA verify with only userId (no auth) -- should be rate-limited | S-1: Critical auth bypass | No |
| 2 | User status toggle without scopeFilter | B-23: IDOR vulnerability | No |
| 3 | User deletion without scopeFilter | B-24: IDOR vulnerability | No |
| 4 | UserType escalation (admin setting userType:0) | B-27: Privilege escalation | No |
| 5 | Replay detection (reuse old refresh token) | SEC-INV-04 verification | No |
| 6 | Token invalidation after password change | SEC-INV-05 verification | No |
| 7 | Tax rule immutability after usage | VER-INV-01 verification | No |
| 8 | System role baseline protection | RBAC-INV-05 verification | No |
| 9 | Audit log update/delete rejection | RBAC-INV-07 verification | No |
| 10 | TFN encrypt/decrypt roundtrip | SEC-INV-09 verification | No |

---

## 9. Dependency Analysis

### Tier 1 Dependency Direction (CLAUDE.md Rule 1)

| From | To | Allowed? | Status |
|------|----|----------|--------|
| `@nugen/validator` | `@nugen/error-handler` | YES (foundational) | PASS |
| `@nugen/auth` | `@nugen/error-handler` | YES (foundational) | PASS |
| `@nugen/auth` | `@nugen/validator` | YES (foundational) | PASS |
| `@nugen/rbac` | `@nugen/error-handler` | YES (foundational) | PASS |
| `@nugen/audit-log` | `@nugen/error-handler` | YES (foundational) | PASS |
| `@nugen/audit-log` | `@nugen/validator` | YES (foundational) | PASS |
| Tier 1 -> Tier 1 (non-foundational) | N/A | NO | PASS -- no violations found |
| Tier 1 -> apps/ | N/A | NO | PASS -- no violations found |
| apps/api -> Tier 1 | All 6 packages | YES | PASS |

### Package Dependencies

| Package | Dependencies | Peer Dependencies | Issues |
|---------|-------------|-------------------|--------|
| error-handler | None | None | PASS |
| validator | express-validator, mongo-sanitize | None (should peer-dep error-handler) | WARNING: Uses error-handler at runtime but does not declare peer |
| rate-limiter | express-rate-limit, rate-limit-redis | None | PASS |
| auth | bcryptjs, jsonwebtoken, otplib, qrcode, **crypto** | mongoose, error-handler, validator | **FAIL: `crypto` npm package is unnecessary (B-7)** |
| rbac | None | mongoose, ioredis, error-handler | PASS |
| audit-log | None | mongoose, error-handler, validator | PASS |

---

## 10. Prioritized Action Plan

### IMMEDIATE: Fix Before Any Further Development

| # | Action | Finding Ref | Effort |
|---|--------|-------------|--------|
| 1 | **Fix MFA verify -- add rate limiting and challenge token instead of raw userId** | S-1 | S |
| 2 | **Fix user type escalation -- add super_admin check for userType 0/1** | B-27 | S |
| 3 | **Apply scopeFilter to PATCH /:id/status and DELETE /:id** | B-23, B-24 | S |
| 4 | **Hash OTP before storage** | S-2 | S |
| 5 | **Hash MFA backup codes before storage** | S-3 | S |
| 6 | **Remove `crypto` npm package from auth dependencies** | B-7 | S |
| 7 | **Replace Redis KEYS with SCAN** | S-5 | S |
| 8 | **Escape regex in all $regex queries** | S-6, B-25 | S |
| 9 | **Add POST /users endpoint for admin user creation** | G-6, G-12 | M |

### SHORT-TERM: Next Sprint

| # | Action | Finding Ref | Effort |
|---|--------|-------------|--------|
| 1 | **Begin TypeScript migration** -- set up root tsconfig, per-package tsconfig, convert foundational packages (error-handler, validator) first | T-1 through T-11 | XL |
| 2 | Add CSRF protection | S-7 | M |
| 3 | Implement RBAC-INV-05 baseline comparison | B-13 | M |
| 4 | Fix tax rule activation immutability bypass | B-26 | S |
| 5 | Add TFN check digit validation | B-4 | S |
| 6 | Add ABN check digit validation | B-5 | S |
| 7 | Cache user auth state in Redis (reduce DB queries per request) | B-9 | M |
| 8 | Write unit tests for auth, RBAC, and tax rule packages | G-7 | L |
| 9 | Add README.md for all 6 packages | G-8 | M |
| 10 | Replace console.error/warn with structured logger | G-9 | M |

### LONG-TERM: Roadmap

| # | Action | Finding Ref | Effort |
|---|--------|-------------|--------|
| 1 | Complete TypeScript migration of all 46 files | T-3 | XL |
| 2 | Build Privacy Act 1988 data deletion/anonymization pipeline | G-14 | L |
| 3 | Build audit log archival cron job (S3 Glacier) | G-13 | L |
| 4 | Add OpenAPI/Swagger documentation | G-15 | M |
| 5 | Implement streaming audit log export | G-5 | M |
| 6 | Add MFA disable endpoint | G-4 | S |
| 7 | Add feature flag system | G-16 | M |
| 8 | Fix audit access-report N+1 query | Performance #3 | S |
| 9 | Implement integration and E2E test suites | G-7 | XL |

*(Effort: S = < 1 day, M = 1-3 days, L = 1-2 weeks, XL = 2+ weeks)*

---

## 11. TypeScript Migration Recommendation

### Suggested TypeScript Project Structure

```
qegos/
  tsconfig.base.json                 # Shared compiler options
  tsconfig.json                      # Project references
  packages/
    error-handler/
      tsconfig.json                  # extends ../../tsconfig.base.json
      src/
        AppError.ts
        errorCodes.ts
        globalErrorHandler.ts
        asyncHandler.ts
        index.ts
        types.ts                     # ErrorCode, AppErrorOptions interfaces
    validator/
      tsconfig.json
      src/
        validate.ts
        validators.ts
        sanitize.ts
        index.ts
        types.ts                     # ValidatorOptions, ValidationChainFactory
    rate-limiter/
      tsconfig.json
      src/
        createLimiter.ts
        authLimiters.ts
        apiLimiter.ts
        index.ts
        types.ts                     # LimiterConfig, AuthLimiterMap
    auth/
      tsconfig.json
      src/
        services/jwtService.ts
        services/passwordService.ts
        services/otpService.ts
        services/mfaService.ts
        models/authPlugin.ts
        models/otpModel.ts
        middleware/authMiddleware.ts
        validators/authValidators.ts
        routes/authRoutes.ts
        index.ts
        types.ts                     # AuthConfig, JWTPayload, RefreshTokenData,
                                     # MFAEnrollment, PasswordPolicy, OTPConfig
    rbac/
      tsconfig.json
      src/
        types.ts                     # Permission, Role, ScopeFilter,
                                     # PermissionScope, RBACConfig
    audit-log/
      tsconfig.json
      src/
        types.ts                     # AuditEntry, AuditSeverity, AuditAction,
                                     # AuditMiddlewareOptions
  apps/
    api/
      tsconfig.json
      src/
        types/                       # App-level types
          express.d.ts               # Augment Express Request with user, scopeFilter
          env.d.ts                   # Type for config object
```

### Root tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Critical Type Interfaces Needed

```typescript
// @nugen/auth/src/types.ts
export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiry?: string;
  refreshExpiry?: string;
  maxSessions?: number;
  otpLength?: number;
  otpExpiry?: number;
  otpSendFn?: (mobile: string, otp: string) => Promise<void>;
  getUserModel: () => import('mongoose').Model<any>;
  getOtpModel?: () => import('mongoose').Model<any>;
  phoneFormat?: RegExp;
}

export interface JWTPayload {
  userId: string;
  userType: number;
  roleId: string | null;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenData {
  token: string;          // bcrypt hash
  tokenVersion: string;
  deviceId: string;
  userAgent: string;
  ipAddress: string;
  createdAt: Date;
  expiresAt: Date;
}

// @nugen/rbac/src/types.ts
export type PermissionScope = 'all' | 'assigned' | 'own' | 'none';
export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'assign' | 'export' | 'bulk_action';

export interface Permission {
  resource: string;
  actions: PermissionAction[];
  scope: PermissionScope;
}

export interface ScopeFilter {
  [key: string]: any;
}

// Express augmentation
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      scopeFilter?: ScopeFilter;
      userPermission?: { resource: string; action: string; scope: PermissionScope };
    }
  }
}
```

---

## Final Verdict

This codebase is **not production-ready** and **violates the primary user requirement**: all code must be TypeScript. The entire foundation -- 46 files, approximately 4,500 lines of code -- is JavaScript. This is not a partial failure; it is a total non-compliance.

However, the architecture underneath is sound. The Tier 1/Tier 2 separation works. The dependency injection pattern is correct. The security implementation, while having exploitable gaps (S-1, B-23, B-24, B-27), shows awareness of the right patterns. The PRD invariant coverage is genuinely impressive for a Phase 0 -- most SEC-INV and RBAC-INV invariants are correctly implemented.

**The single most important thing to fix first:** The MFA verify bypass (S-1). An unauthenticated attacker with a known userId can brute-force past MFA, which renders the entire MFA feature worse than useless -- it gives a false sense of security.

**The single most important strategic decision:** Whether to rewrite everything in TypeScript now (correct but expensive) or fix the 9 immediate security issues in JavaScript first and then migrate. I recommend: fix the security issues first (1-2 days), then start the TypeScript migration from the foundational packages upward.

**Overall Health Score: 3/10**

The architecture earned 3 points. The JavaScript language, zero tests, and critical security vulnerabilities took 7 away.
