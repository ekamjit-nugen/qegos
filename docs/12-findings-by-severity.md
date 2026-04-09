# QEGOS Findings by Severity

**Date:** 2026-04-09
**Purpose:** Single-page view of every finding across all audits, organized by severity. Open items listed first in each section for action.
**Sources:** Phase 0 audit (P0), MVP full audit (MVP), Modular strategy gap analysis (MS), Full application gap analysis (FA)
**Effort scale:** S < 1 day | M 1-3 days | L 1-2 weeks | XL 2+ weeks

---

## Summary

| Severity | Open | Partial | Resolved | Total |
|----------|------|---------|----------|-------|
| **Critical** | 8 | 1 | 8 | **17** |
| **High** | 22 | 2 | 15 | **39** |
| **Medium** | 25 | 1 | 7 | **33** |
| **Low** | 14 | 1 | 8 | **23** |
| **Total** | **69** | **5** | **38** | **112** |

---

## CRITICAL

> Blocks release. Data loss, security breach, compliance violation, or complete feature breakage.

### Open (8)

| # | ID | Title | Location | First Reported | Effort | Recommended Fix |
|---|-----|-------|----------|---------------|--------|-----------------|
| 1 | GAP-ARCH-01 | No event bus despite event-driven architecture design | All domain modules | FA (Apr 9) | L | Implement typed EventBus (Node.js EventEmitter or BullMQ pub/sub). 21 event types defined in lead/order/review types.ts — zero emitted. Blocks 10 cross-module integrations. |
| 2 | GAP-ARCH-02 | server.ts god file (1,424 lines) | `apps/api/src/server.ts` | FA (Apr 9) | M | Decompose into `src/bootstrap/` modules: queues.ts, services.ts, routes.ts, shutdown.ts. Current file wires 12 BullMQ queues + 35 services manually. |
| 3 | GAP-SEC-01 | Custom CSRF implementation — no HMAC signing, bypassable | `apps/api/src/app.ts:76-118` | FA (Apr 9) | S | Replace with `csrf-csrf` package (already in deps). Current Double Submit Cookie has no HMAC — vulnerable to subdomain cookie injection. |
| 4 | GAP-TEST-01 | Zero frontend tests (254 files across 3 apps) | `apps/admin/`, `apps/web/`, `apps/mobile/` | FA (Apr 9) | XL | Add component unit tests for critical flows (login, lead CRUD, order management) and integration tests for API-connected components. |
| 5 | GAP-BIZ-01 | Tax engine lacks ATO certification disclaimers | `apps/api/src/modules/tax-engine/` | FA (Apr 9) | S | Add disclaimer to all estimate API responses: "This is an estimate only. Your actual tax return is prepared using ATO-certified software." |
| 6 | GAP-COMP-01 | Privacy Act 1988 APP 11 implementation unverified | `packages/data-lifecycle/`, `apps/api/src/modules/privacy/` | FA (Apr 9) | L | Audit data-lifecycle + privacy module against APP 1-13. Privacy module is a single routes file — completeness unknown. |
| 7 | DC-01 | Order completion mutates 5 collections without compensating transaction | Order -> Review -> Xero -> Staff -> Notification | MS (Apr 7) | L | Implement outbox pattern: write intent to outbox collection within same MongoDB transaction as primary write. Separate worker processes outbox with retry. |
| 8 | DC-05 | Xero void+recreate is 2 HTTP calls — partial failure leaves order with no invoice | Xero invoice adjustment flow | MS (Apr 7) | L | Add saga with compensation. If new invoice creation fails after void, log alert and create manual reconciliation task. |

### Partial (1)

| # | ID | Title | Location | First Reported | Status Detail |
|---|-----|-------|----------|---------------|---------------|
| 9 | GAP-C01 / M-03 | DataDeletionRequest model missing (Privacy Act erasure) | `packages/data-lifecycle/` | MS (Apr 7) | Privacy module + data-lifecycle package now exist. Erasure workflow completeness unverified. |

### Resolved (8)

| # | ID | Title | Location | First Reported | Resolution |
|---|-----|-------|----------|---------------|------------|
| 10 | S-1 | MFA brute-force via raw userId | `packages/auth/src/services/jwtService.ts` | P0 (Apr 7) | Challenge token with `type: 'mfa_challenge'` + 5-min expiry + rate limiting (5 attempts/15min) |
| 11 | B-27 | User type escalation to super_admin | `apps/api/src/modules/user/user.routes.ts:119-158` | P0 (Apr 7) | USER_TYPE_HIERARCHY checks: target privilege must be lower than actor. Only super_admin can assign admin/super_admin roles. |
| 12 | S-3.1 / B-3.2 | Review pipeline bypass — order completes without approved review | `apps/api/src/modules/order-management/order.service.ts:292-302` | MVP (Apr 7) | ReviewAssignment approval check added in `transitionStatus` when `newStatus === 6`. Throws `AppError.badRequest` if no approved review. |
| 13 | S-3.2 / B-3.3 | Arbitrary field injection in lead merge | `apps/api/src/modules/lead-management/lead.service.ts:724-735` | MVP (Apr 7) | `MERGEABLE_FIELDS` ReadonlySet allowlist. Invalid fields rejected before merge loop. |
| 14 | S-3.3 | Status bypass via update endpoint (lead + order) | `lead.service.ts:320`, `order.service.ts:186` | MVP (Apr 7) | `delete (data as Record<string, unknown>).status` strips status from update payload in both services. |
| 15 | B-3.1 / B-3.13 | Race condition in lead/order number generation | `apps/api/src/database/counter.model.ts` | MVP (Apr 7) | Dedicated counter collection with `findOneAndUpdate` + `$inc`. Atomic — concurrent requests get sequential numbers. |
| 16 | T-3 | All 46 source files are JavaScript (zero TypeScript) | Entire codebase | P0 (Apr 7) | Full TypeScript rebuild: 388 .ts files, strict mode, zero .js source files remain. |
| 17 | T-3.5 | Review-Order invariant (RVW-INV-01) not enforced | `order.service.ts`, `order.types.ts` | MVP (Apr 7) | Same as S-3.1 resolution. |

---

## HIGH

> Broken workflow, data integrity risk, missing audit trail, or security hole exploitable with valid credentials.

### Open (22)

| # | ID | Title | Location | First Reported | Effort | Recommended Fix |
|---|-----|-------|----------|---------------|--------|-----------------|
| 1 | GAP-PERF-01 / B-9 | Auth middleware DB query per request **(3RD REPORT)** | `packages/auth/src/middleware/authMiddleware.ts:41-44` | P0 (Apr 7) | M | Add Redis cache for user auth state with 60s TTL. Invalidate on password change, logout, status toggle. Currently 1 MongoDB query per authenticated request. |
| 2 | GAP-ARCH-03 | Root tsconfig.json missing 9 of 17 package references | `/tsconfig.json` | FA (Apr 9) | S | Add references for: analytics-engine, broadcast-engine, chat-engine, data-lifecycle, file-storage, notification-engine, support-tickets, whatsapp-connector, xero-connector + all 4 apps. |
| 3 | GAP-SEC-02 | No rate limiting on new module endpoints | All Phase 4+ routes | FA (Apr 9) | M | Add per-endpoint limiters: file upload 10/min, broadcast send 5/min, chat message 30/min, tax calc 20/min, analytics export 5/min, erasure request 3/day. |
| 4 | GAP-SEC-03 | File upload security unverified | `packages/file-storage/src/` | FA (Apr 9) | M | Audit: ClamAV virus scanning, file type validation (magic bytes), size limits, presigned URL expiry, path traversal protection. |
| 5 | GAP-DATA-01 | No database migration framework | Entire codebase | FA (Apr 9) | M | Implement migrate-mongo or custom runner. Required for safe schema changes in production. |
| 6 | GAP-DATA-02 | No database backup/restore strategy | Not found in codebase | FA (Apr 9) | M | Implement automated MongoDB backup to S3. Document restore procedure. Test recovery. |
| 7 | GAP-TEST-02 | 4 Tier 1 packages with zero tests | broadcast-engine (17 files), file-storage (9), whatsapp-connector (8), support-tickets (7) | FA (Apr 9) | L | Write service-level unit tests for each. These are shared across Nugen products — bugs propagate. |
| 8 | GAP-ARCH-04 | Frontend apps appear to be UI shells — integration unverified | `apps/admin/`, `apps/web/`, `apps/mobile/` | FA (Apr 9) | L | Validate that frontend pages correctly call backend APIs. Generate TypeScript API client from OpenAPI spec. |
| 9 | GAP-BIZ-02 | No ATO integration or e-filing capability | Not found in codebase | FA (Apr 9) | XL | Plan HandiTax/LodgeiT result import endpoint. Core value proposition of tax filing depends on this (Phase 6+). |
| 10 | GAP-BIZ-03 | Xero connector has 29 `any` usages — data integrity risk | `packages/xero-connector/src/services/` | FA (Apr 9) | M | Replace `any` with typed Xero API response interfaces. Highest `any` concentration in codebase. Silent data corruption risk. |
| 11 | GAP-COMP-02 | ATO 7-year record retention not enforced | `packages/audit-log/`, `packages/data-lifecycle/` | FA (Apr 9) | M | Verify data-lifecycle implements retention policies per ATO periods. Add archival job for records > 12 months to S3 Glacier. |
| 12 | DC-02 | Payment -> Xero sync partial failure (no compensation) | Payment completion flow | MS (Apr 7) | L | Outbox pattern. Payment recorded in QEGOS but Xero sync fails — reconciliation catches it hours later. |
| 13 | DC-04 | Refund -> Xero credit note partial failure | Refund processing flow | MS (Apr 7) | L | Outbox pattern. Refund succeeds in gateway but credit note never created in Xero. |
| 14 | B-3.5 | Sales GET / missing RBAC check | `order.routes.ts:311-319` | MVP (Apr 7) | S | Add `check('sales', 'read')` middleware. Currently any authenticated user can list all services. |
| 15 | B-3.6 | Bulk assign doesn't validate staff exists | `lead.service.ts:421-444` | MVP (Apr 7) | S | Add `User.findById(staffId)` check with `isDeleted: { $ne: true }` before `updateMany`. |
| 16 | B-3.7 | Order bulk assign mounted at wrong path | `order.routes.ts:227-249` | MVP (Apr 7) | S | Move from `PUT /orders/:id/bulk-assign` to `PUT /orders/bulk-assign`. The `:id` param is captured but unused. |
| 17 | B-3.8 | Review service bypasses order status transition validation | `review.service.ts:161, 143, 282` | MVP (Apr 7) | S | Inject and call `orderService.transitionStatus()` instead of `OrderModel.findByIdAndUpdate(orderId, { status: 5 })`. |
| 18 | B-3.9 | Appointment double-booking TOCTOU race | `order.service.ts:304-319` | MVP (Apr 7) | S | Add unique compound index on `scheduledAppointment.date + timeSlot + staffId`. Or use `findOneAndUpdate` with upsert. |
| 19 | B-3.12 | Bulk operations no size limit | `lead.validators.ts:113-122`, `order.validators.ts:73-82` | MVP (Apr 7) | S | Add `.isArray({ min: 1, max: 100 })` to `bulkAssignValidation` and `bulkStatusValidation`. |
| 20 | B-3.14 | No review checklist update endpoint | `review.routes.ts` | MVP (Apr 7) | M | Add `PATCH /order-reviews/:orderId/checklist` to toggle checklist items and add notes. Reviewers currently cannot check items off. |
| 21 | B-3.38 | Lead conversion uses hardcoded userType:2, no role assigned | `lead.service.ts:499` | MVP (Apr 7) | M | Assign default client role during conversion. Without a role, RBAC denies all access to the converted user. |
| 22 | S-3.8 | Webhook duplicate check TOCTOU race | `webhookProcessor.ts:78-101` | MVP (Apr 7) | S | Add unique index on `eventId`. Catch MongoDB duplicate key error (11000) and return cached response. Two concurrent identical webhooks can currently both process. |

### Partial (2)

| # | ID | Title | Location | First Reported | Status Detail |
|---|-----|-------|----------|---------------|---------------|
| 23 | S-3.7 | No rate limiting on mutation endpoints | Lead/order/review routes | MVP (Apr 7) | Global limiter (100/min) exists. Per-endpoint limiters still missing for all new modules. See GAP-SEC-02. |
| 24 | M-06 | BullMQ dead-letter queue model missing | `apps/api/src/server.ts` | MS (Apr 7) | Dead-letter queue registered in server.ts:883. Dedicated model for failed job inspection unknown. |

### Resolved (15)

| # | ID | Title | Location | First Reported | Resolution |
|---|-----|-------|----------|---------------|------------|
| 25 | S-2 | OTP stored in plaintext | `packages/auth/src/services/otpService.ts:52` | P0 (Apr 7) | bcrypt.hash(otpCode, 10). Schema field renamed from `otp` to `otpHash`. |
| 26 | S-3 | MFA backup codes in plaintext | `packages/auth/src/services/mfaService.ts:25-32` | P0 (Apr 7) | `generateBackupCodes()` returns `{ plaintext, hashed }`. `verifyBackupCode()` uses bcrypt.compare. |
| 27 | S-5 | Redis KEYS command blocks server | `packages/rbac/src/middleware/checkPermission.ts:88-101` | P0 (Apr 7) | SCAN iterator with `COUNT 100` in do-while loop. No use of KEYS command. |
| 28 | S-6 | ReDoS via $regex in audit search | `packages/audit-log/src/routes/auditRoutes.ts:48-49` | P0 (Apr 7) | Uses `$text` search with text index. No `$regex` on user input. |
| 29 | S-7 / S-3.6 | CSRF middleware not wired | `apps/api/src/app.ts:76-118` | P0 (Apr 7) | Custom CSRF implemented. Webhooks exempted. Token endpoint at `/csrf-token`. (Quality concern: see GAP-SEC-01.) |
| 30 | S-3.4 | IDOR on lead assignment (no scopeFilter) | `lead.service.ts` | MVP (Apr 7) | scopeFilter applied. 167 total occurrences across 17 files. |
| 31 | S-3.5 | IDOR on order assignment | `order.service.ts` | MVP (Apr 7) | scopeFilter applied. |
| 32 | S-3.15 | OTP brute force — no max attempts check | `packages/auth/src/services/otpService.ts:92-93` | MVP (Apr 7) | `otpMaxAttempts` config (default 5). OTP deleted if exceeded. |
| 33 | S-3.16 | Password reset token uses SHA-256 | `packages/auth/src/routes/authRoutes.ts:406` | MVP (Apr 7) | `bcrypt.hash(resetToken, 10)`. Reset-password handler uses `bcrypt.compare()`. |
| 34 | S-3.17 | deviceId not validated or sanitized | `packages/auth/src/validators/authValidators.ts:16` | MVP (Apr 7) | `.optional().isString().isLength({ max: 128 }).trim()` on all auth validators. |
| 35 | S-3.19 | Tier 1 cross-dep: payment-gateway -> audit-log | `packages/payment-gateway/` | MVP (Apr 7) | Import removed. Audit log passed as callback via route deps interface. |
| 36 | B-3.4 | Automation jobs never registered (dead code) | `apps/api/src/server.ts:851+` | MVP (Apr 7) | 12 BullMQ queues with repeatable jobs registered. Lead automation, broadcast, vault, tickets, privacy, xero, engagement, notification, analytics, appointments. |
| 37 | B-13 | RBAC baseline comparison not implemented | `packages/rbac/src/routes/rbacRoutes.ts:29-58` | P0 (Apr 7) | `validateBaselinePermissions()` checks resources, actions, and scope hierarchy against seed baseline. |
| 38 | B-23 / B-24 | IDOR on user status toggle and deletion | `apps/api/src/modules/user/user.service.ts` | P0 (Apr 7) | `toggleStatus()` and `softDelete()` both accept and apply `scopeFilter`. |
| 39 | M-01 | Standalone Appointment model missing | `apps/api/src/modules/appointment-scheduling/` | MS (Apr 7) | Full appointment-scheduling module: model, service, routes, types, validators, tests. |

---

## MEDIUM

> Degraded experience with workaround, missing validation, or data quality issue.

### Open (25)

| # | ID | Title | Location | First Reported | Effort | Recommended Fix |
|---|-----|-------|----------|---------------|--------|-----------------|
| 1 | S-3.9 | Idempotency Redis race (cache miss on concurrent requests) | `idempotencyService.ts:27-44` | MVP (Apr 7) | S | Use Redis `SET NX` (set-if-not-exists) for atomic locking. Currently two concurrent requests with same key both get cache miss. |
| 2 | S-3.10 | TFN encryption uses same key for User and Order models | `user.model.ts`, `order.model.ts:16-25` | MVP (Apr 7) | M | Use separate encryption keys per data domain. Single key compromise exposes all TFNs across both models. |
| 3 | S-3.11 | No maxLength on text fields | `lead.validators.ts`, `order.validators.ts`, `review.validators.ts` | MVP (Apr 7) | M | Add `.isLength({ max: 500 })` to firstName, lastName, description, notes, nextAction, title. Prevents storage DoS. |
| 4 | S-3.12 | Billing dispute exposes full Mongoose document in response | `billingDispute.routes.ts:112-116` | MVP (Apr 7) | S | Use explicit response mapping (pick visible fields) instead of returning raw Mongoose document. |
| 5 | B-3.18 | autoDormant uses lead._id as performedBy | `lead.automation.ts:154` | MVP (Apr 7) | S | Use dedicated system user ID or `null` with `isSystemGenerated: true`. Current value references a Lead, not a User. |
| 6 | B-3.19 | staleLeadAlert uses lead._id as performedBy | `lead.automation.ts:124` | MVP (Apr 7) | S | Same fix as B-3.18. Falls back to `lead._id` when no assignee — wrong reference type. |
| 7 | B-3.20 | Lead search may not respect soft-delete | `lead.service.ts:746-762` | MVP (Apr 7) | S | Add explicit `isDeleted: { $ne: true }` to `$text` search filter. Pre-find hook may not fire for all query types. |
| 8 | B-3.21 | Order lineItems update skips price snapshot logic | `order.service.ts:185-197` | MVP (Apr 7) | M | Apply same price snapshot logic from `createOrder` when new lineItems are added via update. `priceAtCreation` currently trusts client input. |
| 9 | B-3.22 | submitForReview doesn't verify order is status 4 (InProgress) | `review.service.ts:107-163` | MVP (Apr 7) | S | Add guard: `if (order.status !== 4) throw AppError.badRequest('Order must be InProgress')`. |
| 10 | B-3.24 | Review getReviewDetail has no scope filtering | `review.service.ts:181-189` | MVP (Apr 7) | S | Accept `scopeFilter` parameter and apply to `findOne` query. |
| 11 | B-3.25 | Order scheduleAppointment has no scope filtering | `order.service.ts:304-337` | MVP (Apr 7) | S | Accept `scopeFilter` and apply to findById. Any user with `orders:update` can currently schedule on any order. |
| 12 | B-3.28 | Object.assign(existing, data) can overwrite Mongoose internals | `order.service.ts:186` | MVP (Apr 7) | S | Replace with field allowlist using `lodash.pick(data, ALLOWED_UPDATE_FIELDS)`. Prevents `_id`, `__v`, `$__` override. |
| 13 | B-3.34 | Billing dispute PATCH has no scopeFilter | `billingDispute.routes.ts:215-286` | MVP (Apr 7) | S | Apply scopeFilter to `findById` in PATCH handler. Scoped users can currently update any dispute. |
| 14 | B-3.35 | Billing dispute DELETE has no scopeFilter | `billingDispute.routes.ts:289-322` | MVP (Apr 7) | S | Apply scopeFilter to `findById` in DELETE handler. |
| 15 | B-3.36 | Reminder complete/snooze no ownership check | `leadReminder.service.ts:97-129` | MVP (Apr 7) | S | Check `reminder.assignedTo === currentUserId` or apply scopeFilter before `findByIdAndUpdate`. |
| 16 | B-3.37 | Activity update no ownership check | `leadActivity.service.ts:103-121` | MVP (Apr 7) | S | Verify caller is `performedBy` user or has appropriate RBAC scope. |
| 17 | GAP-SEC-04 | 80 `any` type usages across 33 files | Heaviest: xero-connector (29), referral-engine (8), rate-limiter (5) | FA (Apr 9) | M | Replace with proper types or `unknown` + type guards. Violates CLAUDE.md "No `any` type" mandate. |
| 18 | GAP-DATA-03 | Soft-delete consistency unverified in new modules | appointment-scheduling, billing, document-management, referral-engine, reputation-mgmt, staff-workload, tax-calendar, tax-engine | FA (Apr 9) | S | Audit each module for `isDeleted` field, pre-find hooks, and soft-delete service methods. |
| 19 | GAP-TEST-03 | E2E test coverage minimal (5 of 20+ workflows) | `apps/api/__tests__/e2e/` | FA (Apr 9) | L | Add E2E tests for: payment flow, review pipeline, file upload/download, notification delivery, Xero sync. |
| 20 | GAP-BIZ-04 | Client portal missing referrals, payment history, tickets | `apps/api/src/modules/client-portal/` (4 files), `apps/web/` | FA (Apr 9) | M | Add client-facing API endpoints and web pages for referral earnings, payment history, and ticket submission. |
| 21 | GAP-BIZ-05 | No email template management system | Not found as dedicated system | FA (Apr 9) | M | Add HTML template management to broadcast engine: Handlebars/Mjml templating, variable substitution, admin preview, versioning. |
| 22 | GAP-COMP-03 | Spam Act 2003 compliance for broadcasts unverified | `packages/broadcast-engine/` | FA (Apr 9) | M | Audit: unsubscribe mechanism in every commercial message, sender identification, consent records per message type, quiet hours. Penalties up to $2.22M/day. |
| 23 | GAP-PERF-02 | No caching strategy (dashboard stats, tax brackets, sales catalog) | Entire codebase | FA (Apr 9) | M | Redis cache with TTLs: auth state 60s, dashboard stats 5m, tax brackets 1h, sales catalog 10m. |
| 24 | GAP-PERF-03 | server.ts synchronous initialization | `apps/api/src/server.ts` | FA (Apr 9) | S | Parallelize independent initializations with `Promise.all`. Lazy-init BullMQ queues not needed at startup. |
| 25 | GAP-ARCH-05 | No shared API types between frontend and backend | All apps | FA (Apr 9) | M | Create `packages/api-types` with shared request/response interfaces, or generate from OpenAPI spec. |

### Partial (1)

| # | ID | Title | Location | First Reported | Status Detail |
|---|-----|-------|----------|---------------|---------------|
| 26 | S-3.20 | Hardcoded magic numbers across packages | `authPlugin.ts`, `mfaService.ts`, `refundService.ts` | MVP (Apr 7) | Some extracted to config. Remaining: failed login threshold (10), lockout duration (30min), backup code count (10), refund thresholds ($500/$2000). |

### Resolved (7)

| # | ID | Title | Location | First Reported | Resolution |
|---|-----|-------|----------|---------------|------------|
| 27 | B-4 | TFN validator only checks format, not check digit | `packages/validator/src/validators.ts:10-21` | P0 (Apr 7) | ATO weighted-sum algorithm: `[1,4,3,7,5,8,6,9,10]`, `sum % 11 === 0`. |
| 28 | B-5 | ABN validator only checks format, not check digit | `packages/validator/src/validators.ts:29-42` | P0 (Apr 7) | ABR algorithm: subtract 1 from first digit, weights `[10,1,3,5,7,9,11,13,15,17,19]`, `sum % 89 === 0`. |
| 29 | B-10 | MFA issuer hardcoded as 'QEGOS' | `packages/auth/src/services/mfaService.ts:46` | P0 (Apr 7) | `mfaIssuer` in AuthConfig. Reads from `config.MFA_ISSUER` env var. |
| 30 | B-14 | Role assignment does not check if target user is soft-deleted | `packages/rbac/src/routes/rbacRoutes.ts:214-218` | P0 (Apr 7) | `findOne({ _id: userId, isDeleted: { $ne: true } })`. |
| 31 | B-21 | Deep health check requires JWT authentication | `apps/api/src/app.ts:90-92` | P0 (Apr 7) | Health endpoints mounted without auth middleware. |
| 32 | B-25 | User search uses $regex with user input (ReDoS risk) | `apps/api/src/modules/user/user.service.ts:72-79` | P0 (Apr 7) | `escapeRegex()` strips special characters before `$regex`. |
| 33 | B-3.31 / B-3.32 | No DELETE endpoints for leads/orders | `lead.routes.ts`, `order.routes.ts` | MVP (Apr 7) | DELETE routes added: `lead.routes.ts:731`, `order.routes.ts:341`. |

---

## LOW

> Code smell, minor UX issue, documentation gap, or optimization opportunity.

### Open (14)

| # | ID | Title | Location | First Reported | Effort | Recommended Fix |
|---|-----|-------|----------|---------------|--------|-----------------|
| 1 | B-3.39 | getPipelineStats returns full lead objects in aggregation | `lead.service.ts:832-857` | MVP (Apr 7) | S | Remove `$push` of full lead objects. Return only counts and IDs. |
| 2 | B-3.40 | todayStart/todayEnd use server timezone | `leadActivity.service.ts:147-149`, `leadReminder.service.ts:71-74` | MVP (Apr 7) | M | Accept timezone parameter. Australian users span AEST, ACST, AWST. |
| 3 | B-3.41 | Review assignReviewer sorts in-memory | `review.service.ts:98-100` | MVP (Apr 7) | S | Use aggregation `$sort` instead of JS `.sort()` on fetched array. |
| 4 | B-3.42 | Unused `as never` type casts throughout routes | Multiple route files | MVP (Apr 7) | L | Create properly typed middleware wrappers. Defeats TypeScript type checking. |
| 5 | B-3.43 | Missing MongoId validation on GET :id params | `lead.routes.ts:487-496`, `order.routes.ts:127-135` | MVP (Apr 7) | S | Add `param('id').isMongoId()` validation. Invalid IDs cause Mongoose CastError. |
| 6 | B-3.44 | Payment logs endpoint has no scope filtering | `paymentRoutes.ts:686-777` | MVP (Apr 7) | S | Apply scopeFilter to payment logs query. Staff with 'assigned' scope can currently see all logs. |
| 7 | B-3.45 | `void auditLog.log()` fire-and-forget silently swallows failures | Multiple route files | MVP (Apr 7) | S | Add `.catch(logger.error)` or use retry queue. Compliance risk if audit logging fails silently. |
| 8 | B-3.47 | Missing `lean()` on some read-only queries | Various services | MVP (Apr 7) | S | Standardize: use `.lean()` on all read-only queries. Non-lean returns full Mongoose documents with overhead. |
| 9 | B-3.49 | No text index on Order model | `order.model.ts` | MVP (Apr 7) | M | Add text index: `orderNumber`, `personalDetails.firstName`, `personalDetails.lastName`. |
| 10 | S-3.13 | Maintenance mode fails open | `maintenanceMode.ts:49-51` | MVP (Apr 7) | S | Log the error on catch. Consider fail-closed for payment maintenance mode. |
| 11 | S-3.14 | No Retry-After header on 503 response | `maintenanceMode.ts:44-47` | MVP (Apr 7) | S | Add `res.set('Retry-After', '3600')` alongside the JSON body. |
| 12 | G-8 | Missing README.md for all packages | All 17 packages | P0 (Apr 7) | M | Write README.md for each: purpose, exports, configuration, usage examples. |
| 13 | G-9 | No structured logging (Winston/Pino) | Entire codebase | P0 (Apr 7) | M | Wire Winston or Pino. `setErrorLogger()` is available but nothing plugged in. Only `console.error` used. |
| 14 | G-10 | No request tracing / correlation IDs | Entire codebase | P0 (Apr 7) | S | Add middleware to generate UUID per request, pass through all log calls. Essential for debugging distributed flows. |

### Partial (1)

| # | ID | Title | Location | First Reported | Status Detail |
|---|-----|-------|----------|---------------|---------------|
| 15 | B-11 | MFA enrollment stores secret before verification (orphaned secrets) | `packages/auth/src/services/mfaService.ts:62-65` | P0 (Apr 7) | Secret stored with `mfaEnabled: false`. Not usable but accumulates on incomplete enrollments. |

### Resolved (8)

| # | ID | Title | Location | First Reported | Resolution |
|---|-----|-------|----------|---------------|------------|
| 16 | B-1 | globalErrorHandler uses console.error | `packages/error-handler/src/globalErrorHandler.ts` | P0 (Apr 7) | `setErrorLogger(logger)` injection available. Falls back to `console.error` if not set. |
| 17 | B-2 | Missing INTERNAL_ERROR in error codes enum | `packages/error-handler/src/types.ts:26` | P0 (Apr 7) | `INTERNAL_ERROR = 'INTERNAL_ERROR'` added to ErrorCode enum. |
| 18 | B-3 | Lazy require of error-handler inside validate | `packages/validator/src/validate.ts:4` | P0 (Apr 7) | Top-level `import { AppError } from '@nugen/error-handler'`. |
| 19 | S-4 | forgot-password uses inline require('crypto') | `packages/auth/src/routes/authRoutes.ts:2` | P0 (Apr 7) | Top-level `import crypto from 'crypto'`. |
| 20 | B-15 | computeDiff as model static may not be accessible from cache | `packages/rbac/src/models/permissionSnapshotModel.ts` | P0 (Apr 7) | Exported as standalone function. Direct import. |
| 21 | B-16 | Audit middleware uses unreliable doc.$isNew post-save | `packages/audit-log/src/middleware/auditMiddleware.ts` | P0 (Apr 7) | Uses `_wasNew` flag set in pre-save. |
| 22 | B-20 | Health check reads wrong package.json version | `apps/api/src/app.ts` | P0 (Apr 7) | Returns `{ status: 'ok', uptime, timestamp }` — no longer reads package.json. |
| 23 | B-3.46 | Lead checkDuplicate normalizes mobile twice | `lead.service.ts:51-93` | MVP (Apr 7) | Redundant but not harmful. Acknowledged. |

---

## Accepted Risks

These findings were reviewed and intentionally deferred or accepted.

| # | ID | Title | Reason | Accepted By |
|---|-----|-------|--------|-------------|
| 1 | B-12 | seedRoles uses $setOnInsert — existing roles never updated | Intentional. Seed must not overwrite production customizations. Migration scripts handle updates. | Architecture decision |
| 2 | B-9 | DB query per authenticated request | Performance optimization deferred. **(Now on 3rd report — should be escalated.)** | Dev team |
| 3 | B-3.50 | Conversion creates order with empty lineItems | Intentional placeholder. Line items added post-conversion during order processing. | By design |

---

## Quick-Reference: What to Fix This Week

For teams scanning this document for immediate action items:

**5 minutes:**
- [ ] GAP-ARCH-03 — Add 9 missing packages to root `tsconfig.json`

**1 day:**
- [ ] GAP-SEC-01 — Replace custom CSRF with `csrf-csrf` package
- [ ] GAP-BIZ-01 — Add tax estimate disclaimers
- [ ] B-3.5 — Add RBAC check to Sales GET endpoint
- [ ] B-3.12 — Add bulk operation size limits
- [ ] S-3.8 — Add unique index on webhook eventId
- [ ] B-3.9 — Add unique compound index for appointment slots

**This sprint:**
- [ ] GAP-PERF-01 — Redis cache for auth middleware (3rd report)
- [ ] GAP-ARCH-02 — Decompose server.ts
- [ ] B-3.8 — Fix review-order coupling
- [ ] B-3.14 — Add review checklist update endpoint
- [ ] Scope gap batch: B-3.24, B-3.25, B-3.34, B-3.35, B-3.36, B-3.37

---

*Generated by Krillin (Documentation Writer) | Nugen IT Services | 2026-04-09*
*Sources: Goku Full App Analysis, Vegeta MVP Audit, Vegeta Phase 0 Audit, Goku Modular Strategy Analysis*
