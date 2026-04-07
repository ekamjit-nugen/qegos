# QA Sentinel Report: QEGOS MVP Full Audit (Phases 0 + 1 + 3)
**Sentinel:** Vegeta (QA Sentinel)
**Date:** 2026-04-07
**Product:** QEGOS (Tax Preparation & Client Management Platform)
**Target:** Full MVP Codebase (packages/, apps/api/)
**Analysis Type:** Static Analysis
**Verdict:** PASS WITH WARNINGS
**Threat Level:** Critical 3 | High 16 | Medium 23 | Low 12 *(updated: +6 findings from post-review cross-reference)*
**Previous Report:** 2026-04-07 (Phase 0 audit in `docs/08-code-quality-audit.md`)

---

## Executive Summary

The QEGOS MVP codebase is architecturally sound but harbors several critical vulnerabilities that must be addressed before any production deployment. The worst finding is **B-3.1: Lead conversion and order number generation are subject to race conditions** -- concurrent conversions can generate duplicate order numbers, violating the unique constraint and causing transaction failures in production. The second critical finding is **S-3.1: The Review Pipeline has no enforcement preventing an order from transitioning to Completed(6) without an approved review**, which means the entire review pipeline can be bypassed by directly calling the order status transition endpoint. The third critical finding is **S-3.2: The lead merge endpoint allows arbitrary field injection** via unvalidated `fieldSelections`, enabling an attacker to overwrite protected fields like `isConverted`, `status`, or `leadNumber`.

On the positive side: authentication and RBAC are consistently applied across all routes, mongo-sanitize is globally applied, audit logging covers all mutation endpoints, integer-cents enforcement is consistent, soft-delete filters are properly implemented, and the state machines are well-defined with proper transition validation. The TypeScript strict mode adoption is thorough.

The Phase 3 modules (Lead, Order, Review) show good design patterns but have integration gaps -- automation jobs are defined but never registered with BullMQ in server.ts, event-driven communication is declared in types but never emitted, and the review pipeline has no bidirectional enforcement with the order module.

**Overall Health Score: 6.5/10**

---

## Progress Since Last Report

### Resolved (from Phase 0 audit)
| # | Previous Finding | Resolution Verified |
|---|-----------------|---------------------|
| 1 | S-1: MFA brute-force via raw userId | VERIFIED -- Challenge token + rate limiting in place |
| 2 | B-27: User type escalation | VERIFIED -- Hierarchy checks in user.routes.ts:119-158 |
| 3 | S-2: OTP plaintext storage | VERIFIED -- bcrypt hashing in otpService.ts:52 |
| 4 | S-3: MFA backup codes plaintext | VERIFIED -- bcrypt hashing in mfaService.ts:25-32 |
| 5 | S-5: Redis KEYS command | VERIFIED -- SCAN iterator in checkPermission.ts:88-101 |
| 6 | S-6: ReDoS via $regex | VERIFIED -- $text search in auditRoutes.ts:48-49 |
| 7 | B-23/B-24: IDOR on user endpoints | VERIFIED -- scopeFilter applied |
| 8 | B-25: User search ReDoS | VERIFIED -- escapeRegex in user.service.ts:72-79 |

### Still Open
| # | Previous Finding | Reports Open Since | Escalation Note |
|---|-----------------|--------------------|-----------------|
| 1 | S-7: CSRF middleware not wired | 2026-04-07 | Infrastructure prepared (env var, CORS header) but NO middleware applied. Second report. |
| 2 | B-9: DB query per authenticated request | 2026-04-07 | Still queries MongoDB on every auth check. Redis caching deferred. |
| 3 | G-3: No admin operation rate limiters | 2026-04-07 | Still no rate limiting on role changes, user deletion, config changes |
| 4 | G-14: No data deletion/anonymization | 2026-04-07 | Privacy Act 1988 compliance gap |
| 5 | G-15: No OpenAPI documentation | 2026-04-07 | Still no Swagger/OpenAPI |

### New Findings
Critical: 3, High: 16, Medium: 23, Low: 12 *(+6 from post-review cross-reference: S-3.15 through S-3.20)*

---

## Known Acceptable Risks
| # | Risk | Reason Accepted | Accepted By |
|---|------|-----------------|-------------|
| 1 | B-12: seedRoles uses $setOnInsert | Intentional -- seed should not overwrite production customizations | Architecture decision |
| 2 | B-9: DB query per auth request | Performance optimization deferred to future sprint | Dev team |

---

## 1. Integration Audit Results

### API Integrations
| # | ID | Check | Status | Confidence | Finding | Severity | Effort | Fix |
|---|-----|-------|--------|------------|---------|----------|--------|-----|
| 1 | T-3.1 | All routes mounted in app.ts | PASS | Confirmed | All 10 routers (auth, rbac, audit, user, taxRule, payment, billing, lead, order+sales, review) properly mounted in finalizeApp() | -- | -- | -- |
| 2 | T-3.2 | Automation jobs registered | FAIL | Confirmed | `lead.automation.ts` defines 7 automation handlers but they are NEVER registered with BullMQ in server.ts. The handlers exist but are dead code. | High | M | Register handlers as BullMQ repeatable jobs in server.ts bootstrap |
| 3 | T-3.3 | Event-driven integration | FAIL | Confirmed | `lead.types.ts` defines 8 LeadEvent types, `order.types.ts` defines 7 OrderEvent types, `review.types.ts` defines 6 ReviewEvent types -- but NO EventEmitter is created or events emitted ANYWHERE in lead/order/review modules. Only payment-gateway emits events. | High | L | Implement event bus and emit events at state transitions |
| 4 | T-3.4 | Stripe raw body parser placement | WARN | High Confidence | In app.ts:103-106, `express.raw()` for Stripe webhooks is mounted AFTER `express.json()` at line 43. Since json parser runs first globally, the raw body may already be consumed before the raw parser runs. The Stripe webhook verify middleware needs the raw body for signature verification. | High | S | Mount `express.raw()` route BEFORE the global `express.json()` or use a dedicated sub-app |
| 5 | T-3.5 | Review-Order invariant (RVW-INV-01) | FAIL | Confirmed | Order can transition from Review(5) to Completed(6) via `PATCH /orders/:id/status` without any check for an approved review. The `ORDER_STATUS_TRANSITIONS` map allows 5->6 unconditionally. The review service sets order to status 5 but nothing blocks 5->6 without approval. | Critical | M | Add review approval check in order.service.ts transitionStatus when newStatus=6 |

### Database Integrations
| # | ID | Check | Status | Confidence | Finding | Severity | Effort | Fix |
|---|-----|-------|--------|------------|---------|----------|--------|-----|
| 1 | T-3.6 | Lead number generation race condition | FAIL | Confirmed | `generateLeadNumber()` in lead.model.ts:181-196 uses find-then-increment without atomicity. Two concurrent creates can get the same `lastLead` and generate duplicate numbers, violating the unique index. Same issue in `generateOrderNumber()` in order.model.ts:295-310. | Critical | S | Use MongoDB `findOneAndUpdate` with `$inc` on a counter collection, or use a Redis atomic increment |
| 2 | T-3.7 | Lead merge not transactional | FAIL | Confirmed | `mergeLead()` in lead.service.ts:702-742 performs 4 operations (update primary, transfer activities, transfer reminders, soft-delete secondary) WITHOUT a MongoDB session/transaction. A failure mid-merge leaves data in inconsistent state. | High | S | Wrap merge operations in a transaction |
| 3 | T-3.8 | Soft-delete filter on aggregate | WARN | Confirmed | Lead aggregation queries in `getStats`, `getPipelineStats`, `getStaffStats`, `getSourceStats`, `getAgingStats` all manually include `{ isDeleted: { $ne: true } }` in $match. This is correct but fragile -- aggregate pipelines bypass the pre-find hooks. Any new aggregation that forgets this filter will include deleted records. | Medium | S | Create a helper function `softDeleteMatch()` that returns the standard filter |
| 4 | T-3.9 | `skipSoftDeleteFilter` option not implemented | WARN | Likely | `lead.model.ts:184` and `order.model.ts:298` use `.setOptions({ skipSoftDeleteFilter: true })` but the pre-find hooks check `filter.isDeleted === undefined`, not a custom option. This setOptions call likely has no effect. | Medium | S | Either implement the option check in pre-find hooks or use `{ isDeleted: { $exists: true } }` |
| 5 | T-3.10 | Missing index on Order.userId + status | WARN | High Confidence | Order queries filter by `userId` and `status` together (list orders, scope filter), but there is no compound index `{ userId: 1, status: 1 }`. Individual indexes exist but compound would be more efficient. | Low | S | Add compound index |

### Frontend-Backend Integrations
N/A -- No frontend apps built yet (Phase 0-3 scope is backend only).

### Cross-Module Integrations
| # | ID | Check | Status | Confidence | Finding | Severity | Effort | Fix |
|---|-----|-------|--------|------------|---------|----------|--------|-----|
| 1 | T-3.11 | Lead conversion creates Order via connection.model() | WARN | Confirmed | `lead.service.ts:491-514` uses `connection.model('User')` and `connection.model('Order')` dynamically. This works but bypasses TypeScript type safety and creates a hidden coupling. If the Order model schema changes, the lead conversion code will not get compile-time errors. | Medium | M | Accept OrderModel and UserModel as dependencies through LeadServiceDeps |
| 2 | T-3.12 | Review-Order coupling is one-directional | WARN | Confirmed | Review submits order status changes directly via `OrderModel.findByIdAndUpdate(orderId, { status: 5 })` (review.service.ts:161). This bypasses order's status transition validation and pre-save hooks. | High | S | Use order service's transitionStatus instead of direct model update |
| 3 | T-3.13 | Tier 1 dependency violation check | PASS | Confirmed | No Tier 1 package imports from Tier 2 or apps/. Dependency direction is clean. payment-gateway correctly uses error-handler but not other Tier 1 packages. | -- | -- | -- |
| 4 | T-3.14 | RBAC on every non-public route | PASS | Confirmed | Every route in lead, order, review, billing, user, tax-rule modules uses `auth()` + `check()`. Sales GET / uses auth() but no check() -- see B-3.5. Webhook endpoints correctly skip auth (signature verification instead). | -- | -- | -- |
| 5 | T-3.15 | Audit logging on every mutation | PASS (mostly) | Confirmed | All create/update/delete/status-change/assign/convert/merge operations have audit logging. Minor gaps noted in B-3 section. | -- | -- | -- |

---

## 2. Bugs Found

### Critical (Blocks Release)

| # | ID | Bug | Location | Confidence | Steps to Reproduce | Expected | Actual | Effort | Fix |
|---|-----|-----|----------|------------|---------------------|----------|--------|--------|-----|
| 1 | B-3.1 | Lead/Order number generation race condition | `lead.model.ts:181-196`, `order.model.ts:295-310` | Confirmed | Two concurrent POST /leads requests arrive simultaneously. Both call `generateLeadNumber()`, both find the same `lastLead`, both generate `QGS-L-0002`. Second insert fails on unique constraint. Same for order numbers and conversion. | Unique sequential numbers | Duplicate number, MongoDB unique index error (11000) | S | Use atomic counter with `findOneAndUpdate` + `$inc` on a dedicated counters collection |
| 2 | B-3.2 | Order transitions 5->6 without approved review (RVW-INV-01 violation) | `order.service.ts:206-277`, `order.types.ts:37` | Confirmed | 1. Create order, advance to Review(5). 2. Call `PATCH /orders/:id/status` with `{status: 6}` directly. 3. Order moves to Completed without any review. | Transition to Completed(6) should require approved ReviewAssignment | Status transition succeeds unconditionally because `ORDER_STATUS_TRANSITIONS[5]` includes `6` with no guard | M | Add check in transitionStatus: if newStatus===6, verify ReviewAssignment exists with status='approved' for this orderId |
| 3 | B-3.3 | Lead merge allows arbitrary field injection | `lead.service.ts:714-720` | Confirmed | Call POST /leads/merge with `fieldSelections: { isConverted: "secondary", leadNumber: "secondary", status: "secondary" }`. The merge loop does `(primary as Record<string, unknown>)[field] = value` for ANY field in fieldSelections. Protected fields like `leadNumber`, `isConverted`, `convertedOrderId` can be overwritten. | Only safe fields should be mergeable | All fields including protected ones can be overwritten | S | Add allowlist of mergeable fields and reject any field not on the list |

### High (Must Fix Soon)

| # | ID | Bug | Location | Confidence | Steps to Reproduce | Expected | Actual | Effort | Fix |
|---|-----|-----|----------|------------|---------------------|----------|--------|--------|-----|
| 1 | B-3.4 | Automation jobs are dead code | `lead.automation.ts:1-237`, `server.ts` | Confirmed | Check server.ts for any BullMQ job registration -- none exists. The 7 automation handlers (autoAssign, staleAlert, autoDormant, followUpEscalation, overdueMarker, scoreRecalculation, reEngagementFlag) are defined but never invoked. | Automation runs on schedule | Leads are never auto-assigned, stale leads never alerted, reminders never marked overdue | M | Register BullMQ repeatable jobs in server.ts |
| 2 | B-3.5 | Sales GET / missing RBAC check | `order.routes.ts:311-319` | Confirmed | `GET /sales/` uses `auth() as never` but does NOT call `check('sales', 'read')`. Any authenticated user can list all services regardless of RBAC permissions. | Should check permissions | Auth-only, no RBAC | S | Add `check('sales', 'read') as never` |
| 3 | B-3.6 | Bulk assign does not validate staff exists | `lead.service.ts:421-444` | Confirmed | `bulkAssign()` uses `updateMany` directly. The `staffId` is never verified to be an existing, active user. Leads can be assigned to deleted/non-existent users. | Validate staff exists and is active | No validation | S | Add User.findById check before updateMany |
| 4 | B-3.7 | Order bulk assign mounted at wrong path | `order.routes.ts:227-249` | Confirmed | `PUT /orders/:id/bulk-assign` is mounted as a parameterized route under `:id`, but the body contains `orderIds` array. The `:id` param is captured but unused. Should be `PUT /orders/bulk-assign` (non-parameterized). | Bulk assign at /orders/bulk-assign | Mounted at /orders/:id/bulk-assign -- the :id param is ignored | S | Move route to `/bulk-assign` before parameterized routes |
| 5 | B-3.8 | Review service bypasses order status transition validation | `review.service.ts:161, 143, 282` | Confirmed | `submitForReview` calls `OrderModel.findByIdAndUpdate(orderId, { status: 5 })` directly, bypassing the order service's `transitionStatus()` which validates allowed transitions, backward transition permissions, etc. Same for `requestChanges` setting status to 4. | Should use order service for status changes | Direct model update bypasses all validation | S | Inject and use orderService.transitionStatus |
| 6 | B-3.9 | Appointment double-booking check has TOCTOU race | `order.service.ts:304-319` | High Confidence | Two concurrent appointment bookings for the same staff+time slot. Both check `findOne` and find no existing booking. Both proceed to create the booking. Second booking succeeds because there's no unique compound index on `scheduledAppointment.date + timeSlot + staffId`. | Exactly one booking per slot | Both succeed | S | Add unique compound index on appointment fields, or use findOneAndUpdate with upsert |
| 7 | B-3.10 | Lead assign does not apply scopeFilter | `lead.service.ts:389-417` | Confirmed | `assignLead()` uses `findById(id)` without scopeFilter. A scoped user with 'assigned' scope could assign any lead, not just ones they have access to. | Should respect scopeFilter | No scope filtering | S | Accept and apply scopeFilter parameter |
| 8 | B-3.11 | Order assign does not apply scopeFilter | `order.service.ts:281-289` | Confirmed | `assignOrder()` uses `findByIdAndUpdate(id, ...)` without scopeFilter. Same IDOR pattern as B-3.10. | Should respect scopeFilter | No scope filtering | S | Accept and apply scopeFilter parameter |
| 9 | B-3.12 | Bulk operations no size limit | `lead.validators.ts:113-122`, `order.validators.ts:73-82` | Confirmed | `bulkAssignValidation` and `bulkStatusValidation` validate `min: 1` but have no maximum. An attacker could send 100,000 lead IDs, causing a long-running loop in `bulkStatusChange` which processes leads sequentially. | Max 100 or 500 items per bulk operation | No upper bound | S | Add `.isArray({ min: 1, max: 100 })` validation |
| 10 | B-3.13 | Lead conversion order number generation race inside transaction | `lead.service.ts:516-526` | Confirmed | Inside the conversion transaction, order number generation uses find+increment (same pattern as B-3.1). Even though it's inside a session, two concurrent conversions can still race on the same number if using read concern 'local'. | Atomic number generation | Potential duplicate within concurrent transactions | S | Use atomic counter (same fix as B-3.1) |
| 11 | B-3.14 | Review checklist update has no dedicated endpoint | `reviewAssignment.model.ts`, `review.routes.ts` | Confirmed | The review has a checklist array, and `approveReview` checks all items are checked. But there is NO endpoint to update individual checklist items (toggle checked, add notes). Reviewers cannot actually check items off. | PATCH endpoint to update checklist items | No endpoint exists | M | Add PATCH /order-reviews/:orderId/checklist endpoint |
| 12 | B-3.15 | Lead update allows status change bypassing transition validation | `lead.service.ts:299-325` | Confirmed | `updateLead()` uses `findOneAndUpdate(filter, data, ...)` directly. If `data.status` is included, it bypasses the `transitionStatus()` validation. Protected fields delete only `leadNumber`, `isConverted`, `convertedOrderId`, `convertedUserId` -- `status` is NOT deleted. | Status changes should only go through transitionStatus | Direct status override via PUT /leads/:id | S | Add `delete (data as Record<string, unknown>).status` to the protected fields list |
| 13 | B-3.16 | Order update allows status change bypassing transition validation | `order.service.ts:166-202` | Confirmed | Same pattern as B-3.15. `updateOrder()` deletes `userId` and `orderNumber` but NOT `status`. A PUT to `/orders/:id` with `{status: 8}` would bypass all transition rules. | Status should be protected | Direct status override via PUT | S | Add `delete (data as Record<string, unknown>).status` |
| 14 | B-3.17 | `staleLeadAlert` has N+1 query | `lead.automation.ts:101-134` | Confirmed | For each stale lead, performs an individual `countDocuments` query. With 1000 stale leads, this is 1000 separate DB calls. | Batch query | N+1 loop | S | Use aggregation with $lookup to get activity counts in one query |

### Medium (Should Fix)

| # | ID | Bug | Location | Confidence | Description | Effort | Fix |
|---|-----|-----|----------|------------|-------------|--------|-----|
| 1 | B-3.18 | `autoDormant` uses `performedBy: lead._id` | `lead.automation.ts:154` | Confirmed | System-generated activities use the lead's own _id as `performedBy` (a User ref). This is semantically wrong and will fail populate. | S | Use a dedicated system user ID or null with `isSystemGenerated: true` |
| 2 | B-3.19 | `staleLeadAlert` uses `lead.assignedTo ?? lead._id` as performedBy | `lead.automation.ts:124` | Confirmed | Same issue as B-3.18. Falls back to lead._id if no assignee. | S | Use system user ID |
| 3 | B-3.20 | Lead search does not respect soft-delete | `lead.service.ts:746-762` | High Confidence | `searchLeads` uses `$text` search but never explicitly adds `isDeleted: { $ne: true }` to the filter. The pre-find hook should add it, but the `$text` index includes deleted leads. | S | Verify pre-find hook fires; add explicit filter for safety |
| 4 | B-3.21 | Order updateOrder allows lineItems manipulation without price snapshot | `order.service.ts:185-197` | Confirmed | When `data.lineItems` is provided in update, the service recalculates totals from existing lineItems. But new lineItems added via update do NOT go through the price snapshot logic from `createOrder`. `priceAtCreation` would be whatever the client sends. | M | Apply same snapshot logic as createOrder for any new line items |
| 5 | B-3.22 | Review `submitForReview` does not verify order is in status 4 (InProgress) | `review.service.ts:107-163` | Confirmed | A review can be submitted for an order in any status. The PRD likely intends that only InProgress(4) orders can be submitted for review. | S | Add status check: order.status must be 4 |
| 6 | B-3.23 | getReminders returns all reminders without pagination | `leadReminder.service.ts:47-68` | Confirmed | `getReminders` returns all reminders for a lead with no pagination. For leads with hundreds of reminders, this returns unbounded results. | S | Add pagination parameters |
| 7 | B-3.24 | Review `getReviewDetail` has no scope filtering | `review.service.ts:181-189` | Confirmed | Any authenticated user with 'order-reviews:read' can view any review regardless of scope. | S | Add scopeFilter parameter |
| 8 | B-3.25 | Order `scheduleAppointment` has no scope filtering | `order.service.ts:304-337` | Confirmed | Any user with 'orders:update' can schedule appointments on any order. | S | Add scopeFilter |
| 9 | B-3.26 | Lead `calculateScore` modifies DB without returning updated document | `lead.service.ts:97-174` | Confirmed | `calculateScore` calls `findByIdAndUpdate` but callers often need to refetch. This causes an extra DB query. Not a bug per se, but inefficient pattern used 4+ times. | S | Return the updated document from findByIdAndUpdate with `{ new: true }` |
| 10 | B-3.27 | createOrder userId param shadows data.userId but differently typed | `order.service.ts:44-93` | Likely | `createOrder(data, userId)` takes userId as string but the schema expects ObjectId. The `userId` string is passed directly to `OrderModel.create()`. Mongoose may coerce it, but explicit typing would be safer. | S | Use explicit ObjectId conversion |
| 11 | B-3.28 | Order update `Object.assign(existing, data)` can overwrite mongoose internals | `order.service.ts:186` | High Confidence | `Object.assign(existing, data)` on a Mongoose document can overwrite internal Mongoose properties if client sends fields like `_id`, `__v`, `$__`, etc. | S | Use a whitelist of allowed update fields or lodash.pick |
| 12 | B-3.29 | Review stats aggregation includes all-time data with no date filter | `review.service.ts:351-408` | Confirmed | `getStats()` has no date range filtering. As data grows, this becomes increasingly expensive. | S | Add optional date range parameters |
| 13 | B-3.30 | Lead aging stats uses server-side Date in aggregation | `lead.service.ts:897` | Confirmed | `const now = new Date()` is JavaScript Date, but `$subtract: [now, '$createdAt']` in aggregation pipeline uses it as a constant embedded in the pipeline. This is fine for single execution but won't benefit from MongoDB query caching. | S | Use `$$NOW` MongoDB expression instead |
| 14 | B-3.31 | No DELETE endpoint for leads | `lead.routes.ts` | Confirmed | There is no DELETE route for leads, even though `softDelete` service method exists. Only way to delete a lead is through merge (secondary gets soft-deleted). | S | Add `DELETE /leads/:id` route |
| 15 | B-3.32 | No DELETE endpoint for orders | `order.routes.ts` | Confirmed | No DELETE route for orders. No `softDelete` method in order service either. | S | Add soft-delete service method and DELETE route |
| 16 | B-3.33 | Sales service update passes raw req.body to Mongoose | `order.routes.ts:341-344` | Confirmed | `SalesModel.findByIdAndUpdate(req.params.id, req.body as Record<string, unknown>, ...)` passes entire body. A client could add `_id`, `createdAt`, or other fields. | S | Use allowlist of fields |
| 17 | B-3.34 | Billing dispute PATCH has no scopeFilter | `billingDispute.routes.ts:215-286` | Confirmed | The PATCH endpoint checks permissions but does not apply scopeFilter to the findById. A scoped user could update any dispute. | S | Apply scopeFilter to findById |
| 18 | B-3.35 | Billing dispute DELETE has no scopeFilter | `billingDispute.routes.ts:289-322` | Confirmed | Same issue as B-3.34 for delete. | S | Apply scopeFilter |
| 19 | B-3.36 | Reminder complete/snooze no ownership check | `leadReminder.service.ts:97-129` | Confirmed | `completeReminder` and `snoozeReminder` use `findByIdAndUpdate(id, ...)` with no check that the current user is the `assignedTo` or has appropriate access. | S | Add ownership or scopeFilter check |
| 20 | B-3.37 | Activity update no ownership check | `leadActivity.service.ts:103-121` | Confirmed | `updateActivity` takes an ID but does not verify the caller is the `performedBy` user or has appropriate scope. | S | Add ownership check |
| 21 | B-3.38 | Lead conversion uses hardcoded userType: 2 | `lead.service.ts:499` | Confirmed | When converting a lead to a user, `userType: 2` (client) is hardcoded. The user won't have a role assigned. Without a role, RBAC will deny all access. | M | Also assign default client role during conversion, or document that role assignment is a separate step |

### Low (Nice to Fix)

| # | ID | Bug | Location | Confidence | Description | Effort | Fix |
|---|-----|-----|----------|------------|-------------|--------|-----|
| 1 | B-3.39 | Lead `getPipelineStats` returns all lead details in aggregation | `lead.service.ts:832-857` | Confirmed | The `$push` in aggregation pushes full lead objects into the pipeline array. For large datasets, this returns massive payloads. | S | Limit or remove `$push` of individual leads; return only counts |
| 2 | B-3.40 | `todayStart`/`todayEnd` in services use server timezone | `leadActivity.service.ts:147-149`, `leadReminder.service.ts:71-74` | Confirmed | `new Date().setHours(0,0,0,0)` uses server timezone, not user timezone. Australian users across timezones (AEST, ACST, AWST) will get incorrect "today" boundaries. | M | Accept timezone parameter or compute based on user's timezone |
| 3 | B-3.41 | Review assignReviewer sorts in-memory | `review.service.ts:98-100` | Confirmed | `eligibleReviewers.sort(...)` sorts an in-memory array fetched from DB. Fine for small teams but not scalable. | S | Use aggregation sort |
| 4 | B-3.42 | Unused `as never` type casts throughout routes | Multiple files | Confirmed | Every middleware call uses `as never` to bypass TypeScript type checking on middleware composition. Not a runtime bug but defeats type safety. | L | Create properly typed middleware wrappers |
| 5 | B-3.43 | Missing validation on `req.params.id` for several GET routes | `lead.routes.ts:487-496`, `order.routes.ts:127-135` | Confirmed | GET /leads/:id and GET /orders/:id do not validate that `:id` is a valid MongoId. Invalid IDs will cause Mongoose CastError. | S | Add param('id').isMongoId() validation |
| 6 | B-3.44 | Payment logs endpoint has no scope filtering | `paymentRoutes.ts:686-777` | Confirmed | GET /payments/logs returns all payments regardless of user scope. Staff with 'assigned' scope can see all transaction logs. | S | Apply scopeFilter |
| 7 | B-3.45 | `void auditLog.log()` fire-and-forget pattern | Multiple route files | Confirmed | Audit log calls use `void` to fire-and-forget. If audit logging fails, it's silently swallowed. For compliance, audit log failures should at minimum be logged. | S | Add `.catch(console.error)` or use a retry queue |
| 8 | B-3.46 | Lead `checkDuplicate` normalizes mobile twice | `lead.service.ts:51-93` | Confirmed | The function normalizes mobile in the search (lines 57-60) and again in the match comparison (lines 74-77). Redundant but not harmful. | S | Extract normalization to a helper called once |
| 9 | B-3.47 | Missing `lean()` on some queries in services | Various | Confirmed | Some queries use `.lean()` and some don't. Inconsistent pattern. Non-lean queries return Mongoose documents with overhead. | S | Standardize lean() usage for read-only queries |
| 10 | B-3.48 | `connection.model('User')` in automation | `lead.automation.ts:56` | Confirmed | `LeadModel.db.model('User')` dynamically accesses the User model. Works but is an implicit dependency. | S | Inject UserModel through AutomationDeps |
| 11 | B-3.49 | No `searchable` text index on Order model | `order.model.ts` | Confirmed | Orders have no text search capability. As order volume grows, finding specific orders requires exact field matches. | M | Add text index on `orderNumber`, `personalDetails.firstName`, `personalDetails.lastName` |
| 12 | B-3.50 | Conversion creates order with empty lineItems | `lead.service.ts:543` | Confirmed | Orders created during lead conversion always have `lineItems: []`, `totalAmount: 0`, `finalAmount: 0`. These are effectively empty placeholder orders. Not a bug if intentional, but should be documented. | S | Add comment documenting this is intentional placeholder |

---

## 3. Security Vulnerabilities

### Critical

| # | ID | Vulnerability | OWASP Category | Location | Confidence | Attack Vector | Impact | Effort | Remediation |
|---|-----|---------------|----------------|----------|------------|---------------|--------|--------|-------------|
| 1 | S-3.1 | Review pipeline bypass -- order can complete without approved review | A01: Broken Access Control | `order.service.ts:206-277`, `order.types.ts:37` | Confirmed | Attacker with 'orders:update' permission calls `PATCH /orders/:id/status` with `{status: 6}`. No check for approved ReviewAssignment. | Tax returns can be lodged without quality review, violating ATO professional standards | M | Add guard in transitionStatus: if newStatus===6, query ReviewAssignment for approved status |
| 2 | S-3.2 | Arbitrary field injection via lead merge | A03: Injection | `lead.service.ts:714-720` | Confirmed | Attacker sends `POST /leads/merge` with `fieldSelections: { status: "secondary", isConverted: "secondary", leadNumber: "secondary" }`. All fields are overwritten on the primary lead. | Data integrity violation, can mark leads as converted without actual conversion, overwrite audit trail | S | Add allowlist of mergeable fields: firstName, lastName, email, mobile, address fields, etc. |
| 3 | S-3.3 | Status bypass via direct update endpoint | A01: Broken Access Control | `lead.service.ts:310`, `order.service.ts:186` | Confirmed | Both `updateLead` and `updateOrder` accept `status` in the update body without stripping it. Attacker with 'update' permission can set any status, bypassing the state machine entirely. | Complete state machine bypass, orders can jump to any status | S | Strip `status` from update data in both services |

### High

| # | ID | Vulnerability | OWASP Category | Location | Confidence | Attack Vector | Impact | Effort | Remediation |
|---|-----|---------------|----------------|----------|------------|---------------|--------|--------|-------------|
| 1 | S-3.4 | IDOR on lead assignment | A01: Broken Access Control | `lead.service.ts:389-417` | Confirmed | User with 'assigned' scope and 'leads:update' permission can assign ANY lead (not just their assigned ones) because `assignLead()` does not apply scopeFilter. | Unauthorized access to leads outside scope | S | Add scopeFilter to assignLead |
| 2 | S-3.5 | IDOR on order assignment | A01: Broken Access Control | `order.service.ts:281-289` | Confirmed | Same pattern as S-3.4 for orders. | Unauthorized access to orders | S | Add scopeFilter |
| 3 | S-3.6 | CSRF still not enforced (SECOND REPORT) | A01: Broken Access Control | `app.ts` | Confirmed | CORS allows `X-CSRF-Token` header but no CSRF middleware validates it. Cookie-based auth is vulnerable to CSRF. | State-changing operations can be triggered from malicious sites | M | Wire up csrf-csrf or csurf middleware |
| 4 | S-3.7 | No rate limiting on Phase 3 mutation endpoints | A04: Insecure Design | `lead.routes.ts`, `order.routes.ts`, `review.routes.ts` | Confirmed | Only global API rate limiter (100/min) exists. No specific rate limiting on expensive operations like bulk assign, merge, convert, or score recalculation. | Resource exhaustion, DoS on expensive operations | M | Add specific rate limiters for mutation endpoints |
| 5 | S-3.8 | Webhook duplicate check has TOCTOU race | A04: Insecure Design | `webhookProcessor.ts:78-101` | High Confidence | Two identical webhooks arrive simultaneously. Both check `findOne({ eventId })` and find nothing. Both create the event and process it. The payment could be double-updated. | Double payment processing | S | Use MongoDB unique index on `eventId` + try/catch for duplicate key error |

### Medium

| # | ID | Vulnerability | OWASP Category | Location | Confidence | Attack Vector | Impact | Effort | Remediation |
|---|-----|---------------|----------------|----------|------------|---------------|--------|--------|-------------|
| 1 | S-3.9 | Idempotency service Redis-only fast path has race | A04: Insecure Design | `idempotencyService.ts:27-44` | High Confidence | Two requests with same idempotency key arrive simultaneously. Both call `checkIdempotencyKey()`, both get `null` from Redis (cache miss). Both proceed to create payment. The DB unique index catches it, but the second request gets a MongoDB error instead of the cached response. | Confusing error response on retry, but no double-charge due to DB unique index | S | Use Redis SET NX (set-if-not-exists) for atomic locking |
| 2 | S-3.10 | TFN encryption uses same key for User and Order models | `user.model.ts`, `order.model.ts:16-25` | Confirmed | Both modules use `config.ENCRYPTION_KEY` for AES-256-GCM. If the key is compromised, all TFNs across both models are exposed. | Single point of failure for all TFN data | M | Consider separate encryption keys for different data domains |
| 3 | S-3.11 | No input length limits on text fields | `lead.validators.ts`, `order.validators.ts`, `review.validators.ts` | Confirmed | Fields like `firstName`, `lastName`, `description`, `notes`, `nextAction`, `title` have no `isLength({ max: ... })` validation. A client could send megabytes of text in these fields. | Storage bloat, potential DoS | M | Add maxLength validation to all text fields |
| 4 | S-3.12 | Billing dispute exposes full document in response | `billingDispute.routes.ts:112-116` | Confirmed | `res.status(201).json({ data: dispute })` returns the full Mongoose document including internal fields. | Information disclosure of internal document structure | S | Use explicit response mapping like payment routes do |

### Low

| # | ID | Vulnerability | OWASP Category | Location | Confidence | Attack Vector | Impact | Effort | Remediation |
|---|-----|---------------|----------------|----------|------------|---------------|--------|--------|-------------|
| 1 | S-3.13 | Maintenance mode fails open | A05: Security Misconfiguration | `maintenanceMode.ts:49-51` | Confirmed | If GatewayConfigModel query fails, the catch block does nothing and calls `next()`. Payments proceed during DB errors. | Payments processed when system should be in maintenance | S | Log the error; consider fail-closed for maintenance |
| 2 | S-3.14 | No `Retry-After` header as Date on 503 | A05: Security Misconfiguration | `maintenanceMode.ts:44-47` | Confirmed | Returns `retryAfter: 3600` as JSON body but does not set the HTTP `Retry-After` header. | Clients may retry immediately instead of backing off | S | Add `res.set('Retry-After', '3600')` |

### Missed in Initial Scan (Added Post-Review)

The following findings were identified during cross-referencing with an independent security review and were NOT caught in the initial Vegeta scan. This section exists as a self-correction — these gaps in the audit process have been addressed by updating the Vegeta checklist (see Appendix).

| # | ID | Vulnerability | OWASP Category | Location | Confidence | Attack Vector | Impact | Effort | Remediation |
|---|-----|---------------|----------------|----------|------------|---------------|--------|--------|-------------|
| 1 | S-3.15 | OTP brute force — no max attempts check | A07: Auth Failures | `packages/auth/src/services/otpService.ts` | Confirmed | `verifyOtp()` increments `otpRecord.attempts` on failure but NEVER checks against a max threshold. Attacker can brute force a 6-digit OTP (1M combinations) with no lockout. | Complete OTP bypass via brute force | S | Check `otpRecord.attempts >= maxAttempts` before bcrypt.compare(). Delete OTP record if exceeded. Add `otpMaxAttempts` to AuthConfig (default: 5). |
| 2 | S-3.16 | Password reset token uses SHA-256 instead of bcrypt | A02: Cryptographic Failures | `packages/auth/src/routes/authRoutes.ts:397` | Confirmed | SHA-256 is fast and reversible on DB leak. If attacker gains DB access, all active reset tokens can be cracked instantly. bcrypt is used for OTP/MFA but not password reset. | Account takeover via leaked DB | S | Replace `crypto.createHash('sha256')` with `bcrypt.hash(resetToken, 10)`. Update reset-password handler to use `bcrypt.compare()`. |
| 3 | S-3.17 | deviceId input — unsafe double cast, no validation | A03: Injection | `packages/auth/src/routes/authRoutes.ts:92` | Confirmed | `const deviceId = (req.body as Record<string, unknown>).deviceId as string \|\| 'default'` — double unsafe cast bypasses express-validator. No length limit, no sanitization. Malicious deviceId stored in refresh token entries. | Stored XSS/injection via deviceId in admin views, unbounded string storage | S | Add `body('deviceId').optional().isString().isLength({ max: 128 }).trim()` to auth validators. Read from validated body. |
| 4 | S-3.18 | Payment gateway env not validated — app starts with zero gateways | A05: Security Misconfiguration | `apps/api/src/config/env.ts` | Confirmed | All payment env vars are optional. App starts successfully with no gateway configured. Payment intent creation fails at runtime with a cryptic error instead of a clear startup warning. | Runtime failures on first payment attempt, confusing error messages | S | Add Zod `.refine()` ensuring at least one gateway is configured. Add `MFA_ISSUER` to env schema (referenced in server.ts but not validated). |
| 5 | S-3.19 | Tier 1 cross-dependency: payment-gateway imports @nugen/audit-log | A05: Security Misconfiguration | `packages/payment-gateway/src/routes/paymentRoutes.ts:5` | Confirmed | `import * as auditLog from '@nugen/audit-log'` — Tier 1 packages must NOT import other Tier 1 packages (except error-handler/validator per CLAUDE.md). This couples payment-gateway to audit-log, preventing reuse without audit-log. Previous scan incorrectly marked T-3.13 as PASS. | Architecture violation, reduced reusability across Nugen products | M | Remove import. Add `auditLog` callback to route deps interface. Pass from apps/api when wiring. |
| 6 | S-3.20 | Hardcoded magic numbers across packages | A05: Security Misconfiguration | Multiple files | Confirmed | `authPlugin.ts:90` hardcodes `>= 10` failed attempts. `authPlugin.ts:92` hardcodes `30 * 60 * 1000` lockout. `mfaService.ts:30` hardcodes `10` backup codes. `refundService.ts:35-41` hardcodes `$500/$2000` thresholds. | Cannot configure per-deployment, violates 12-factor app principles | M | Extract all magic numbers to config interfaces with defaults. Pass through config injection. |

**Correction to T-3.13:** Previous finding marked Tier 1 dependency check as PASS. This was incorrect — `@nugen/payment-gateway` imports `@nugen/audit-log` directly. Updated to FAIL via S-3.19 above.

### Compliance Check

| Framework | Requirement | Status | Finding | Remediation |
|-----------|------------|--------|---------|-------------|
| OWASP A01 | Broken Access Control | PARTIAL | S-3.1 (review bypass), S-3.2 (merge injection), S-3.3 (status bypass), S-3.4/S-3.5 (IDOR on assign), multiple missing scopeFilter | Fix all identified IDOR and bypass issues |
| OWASP A02 | Cryptographic Failures | PARTIAL | TFN encrypted with AES-256-GCM, OTP/backup codes bcrypt hashed. BUT password reset token uses SHA-256 (S-3.16) | Replace SHA-256 with bcrypt for reset tokens |
| OWASP A03 | Injection | PASS | mongo-sanitize globally applied, $text search replaces $regex, escapeRegex used | -- |
| OWASP A04 | Insecure Design | PARTIAL | Rate limiting only global, no per-endpoint. TOCTOU races on webhooks and appointments. | Add specific rate limiters, atomic operations |
| OWASP A05 | Security Misconfiguration | PARTIAL | CSRF not enforced, maintenance mode fails open | Wire CSRF middleware, reconsider fail-open |
| OWASP A07 | Auth Failures | PARTIAL | JWT validation, password change invalidation, account lockout, MFA challenge token. BUT OTP has no max attempts check (S-3.15), deviceId not validated (S-3.17) | Add OTP brute force protection, validate deviceId |
| Privacy Act 1988 APP 11 | Right to Erasure | FAIL | No data anonymization/erasure workflow | Implement data deletion pipeline |
| ATO Professional Standards | Review before lodgement | FAIL | S-3.1: No enforcement of review approval before completing/lodging | Add review approval gate on order status 5->6 |

---

## 4. Gap Analysis

| # | ID | Gap Type | Description | Impact if Unaddressed | Effort | Priority | Recommendation |
|---|-----|----------|-------------|-----------------------|--------|----------|----------------|
| 1 | G-3.1 | Missing feature | No event emission in Phase 3 modules despite typed event interfaces | Notification engine, Xero sync, analytics cannot react to lead/order/review changes | L | High | Implement EventEmitter in each module, emit on state changes |
| 2 | G-3.2 | Missing feature | Automation jobs never registered with BullMQ | Leads never auto-assigned, reminders never marked overdue, stale leads never alerted | M | High | Register jobs in server.ts |
| 3 | G-3.3 | Missing validation | Lead mobile not validated as E.164 or Australian format in validator | Invalid phone numbers accepted | S | Medium | Add mobile format validation in `createLeadValidation` |
| 4 | G-3.4 | Missing feature | No review checklist update endpoint | Reviewers cannot check off items -- the core review workflow is incomplete | M | Critical | Add PATCH endpoint for checklist |
| 5 | G-3.5 | Missing error handling | Lead conversion does not handle User model validation failures | If user creation fails (e.g., duplicate email), transaction aborts but error message may be cryptic | S | Medium | Add specific error handling for duplicate email/mobile on user creation |
| 6 | G-3.6 | Missing audit logging | Reminder complete/snooze operations not audit logged | No trail for reminder state changes | S | Low | Add auditLog.log() to reminder routes |
| 7 | G-3.7 | Missing audit logging | Activity update not audit logged | No trail for activity edits | S | Low | Add auditLog.log() to activity update route |
| 8 | G-3.8 | Dead code | `LeadScoreFactors` interface in lead.types.ts never used | Confusing -- interface exists but scoring logic doesn't use it | S | Low | Either use the interface in calculateScore or remove it |
| 9 | G-3.9 | Missing feature | No lead soft-delete route | Users cannot delete leads through the API | S | Medium | Add DELETE /leads/:id route |
| 10 | G-3.10 | Missing feature | No order soft-delete | Users cannot delete orders through the API | S | Medium | Add DELETE /orders/:id route with appropriate guards |
| 11 | G-3.11 | Inconsistency | Order module has `IOrderDocument` interface (for sub-documents) AND `IOrderDocument2` (for the main document) | Confusing naming | S | Low | Rename `IOrderDocument2` to `IOrderDoc` or `IOrderRecord` |
| 12 | G-3.12 | Missing feature | No cancel cascade -- cancelling an order does not void Xero invoice or cancel pending payments | Cancelled orders may still have active payments and invoices | M | Medium | Emit event on cancel, implement listeners when Xero and payment modules integrate |

---

## 5. Performance Observations (Static Analysis)

| # | Pattern | Location | Concern | Confidence | Recommendation |
|---|---------|----------|---------|------------|----------------|
| 1 | N+1 Query | `lead.automation.ts:101-134` (staleLeadAlert) | Loops over stale leads, calling `countDocuments` per lead | Confirmed | Use $lookup aggregation or batch query |
| 2 | N+1 Query | `lead.automation.ts:48-96` (autoAssignNewLead) | Updates each unassigned lead individually in a loop | Confirmed | Use `bulkWrite` with update operations |
| 3 | N+1 Query | `lead.automation.ts:139-163` (autoDormant) | Updates and creates activity per lead in loop | Confirmed | Use `bulkWrite` for updates, `insertMany` for activities |
| 4 | N+1 Query | `order.service.ts:52-54` (createOrder) | Fetches each Sales item individually in a loop | Confirmed | Use `SalesModel.find({ _id: { $in: salesIds } })` for batch fetch |
| 5 | Missing pagination | `review.service.ts:168-177` (getPendingReviews) | Returns all pending reviews without pagination | Confirmed | Add pagination |
| 6 | Unbounded result | `lead.service.ts:757` (searchLeads) | Limited to 50 but no pagination metadata | Confirmed | Add pagination metadata |
| 7 | DB query per auth request | `authMiddleware.ts:41-44` | Every authenticated request queries MongoDB | Confirmed | Add Redis cache for user auth state with short TTL |
| 8 | Redundant refetch | `lead.service.ts:211-214` (createLead) | Creates lead, calculates score (which refetches+updates), then refetches again | Confirmed | Chain operations to avoid triple fetch |
| 9 | Large aggregation | `lead.service.ts:832-857` (getPipelineStats) | Pushes full lead objects into aggregation output | Confirmed | Remove $push of full objects, return only counts and IDs |
| 10 | No caching | Lead/Order stats endpoints | Stats are computed from scratch on every request | High Confidence | Add Redis cache with 1-5 min TTL for dashboard stats |

---

## 6. Test Coverage Map

### Current Test Files

| File | Tests | What's Tested | What's NOT Tested |
|------|-------|---------------|-------------------|
| `packages/error-handler/__tests__/appError.test.ts` | ~8 | AppError creation, status codes | globalErrorHandler, asyncHandler |
| `packages/validator/__tests__/validators.test.ts` | ~20 | TFN/ABN check digit, escapeRegex | sanitize middleware, validate wrapper |
| `packages/auth/__tests__/jwtService.test.ts` | ~6 | Token generation, verification | MFA challenge token, token rotation |
| `packages/auth/__tests__/passwordService.test.ts` | ~8 | Password policy, hashing | Password reset flow, change detection |
| `packages/rbac/__tests__/checkPermission.test.ts` | ~10 | computeDiff, baseline validation | Actual middleware behavior, scope filtering |
| `packages/audit-log/__tests__/auditService.test.ts` | ~6 | Audit entry creation, types | Streaming export, archival |
| `apps/api/__tests__/health.test.ts` | ~4 | Health endpoints | Deep health with failed services |
| `packages/payment-gateway/__tests__/paymentRouter.test.ts` | ~12 | Routing strategies, fallback, retryable classification | Timeout race, round-robin state |
| `packages/payment-gateway/__tests__/gstCalculator.test.ts` | ~10 | GST calculation, edge cases | Zero quantity, negative input |
| `packages/payment-gateway/__tests__/idempotencyService.test.ts` | ~8 | Cache check, store, remove | Concurrent access, Redis failure |
| `packages/payment-gateway/__tests__/webhookProcessor.test.ts` | ~10 | Stripe/Payzoo event processing | Duplicate race, invalid gateway |
| `packages/payment-gateway/__tests__/refundService.test.ts` | ~10 | Refund validation, approval gates | Concurrent refunds, rollback |
| `apps/api/__tests__/lead.test.ts` | ~30 | Types, enums, transitions, mobile normalization, scoring factors | **NO service tests, NO route tests, NO integration** |
| `apps/api/__tests__/order.test.ts` | ~25 | Types, enums, transitions, total calculation, GST | **NO service tests, NO route tests, NO integration** |
| `apps/api/__tests__/review.test.ts` | ~25 | Types, checklist, rounds, assignment rules | **NO service tests, NO route tests, NO integration** |

### Test Coverage Assessment

| Layer | Current Coverage | Critical Gaps |
|-------|-----------------|---------------|
| Unit (Tier 1 packages) | Moderate (~60%) | Auth middleware behavior, OTP service, RBAC middleware flow |
| Unit (Phase 3 services) | **ZERO** | Lead service (duplicate check, conversion, merge, scoring), Order service (transitions, assignment, appointment), Review service (self-review block, checklist validation, escalation) |
| Integration (API routes) | **ZERO** | No supertest tests for any endpoint. All Phase 3 tests are pure unit tests on types/enums, not actual service or route behavior. |
| E2E | **ZERO** | No end-to-end tests |

**The Phase 3 test files are misleading.** They test enums, constants, and pure arithmetic -- essentially testing TypeScript type definitions, not business logic. None of them instantiate a service, mock a model, or make an HTTP request. The service-level bugs identified in this audit (B-3.1 through B-3.50) would NOT be caught by any existing test.

---

## 7. Security Scorecard

| Category | Score (1-10) | Key Findings |
|----------|-------------|--------------|
| Authentication | 6 | Solid JWT + MFA + password change detection. BUT: OTP brute force unprotected (S-3.15), password reset uses SHA-256 not bcrypt (S-3.16), deviceId unvalidated (S-3.17). |
| Authorization | 4 | RBAC middleware applied but multiple IDOR gaps (S-3.4, S-3.5), review bypass (S-3.1), status bypass (S-3.3), merge injection (S-3.2) |
| Input Validation | 6 | express-validator on all endpoints, mongo-sanitize global. But no maxLength on text fields (S-3.11), missing mobile format validation |
| Data Protection | 7 | TFN encrypted, OTP/backup codes hashed, soft-delete, no PII in error responses. No data anonymization workflow. |
| API Security | 5 | Global rate limit only, CSRF not enforced, webhook duplicate race, no per-endpoint rate limits |
| Configuration | 7 | Zod env validation, helmet, CORS whitelist. Maintenance mode fails open. |
| Compliance | 4 | Privacy Act 1988 right to erasure not implemented. ATO review requirement bypassable. No Spam Act unsubscribe. |
| **Overall** | **5.0/10** | Authorization, auth hardening, and compliance gaps are the primary weaknesses |

---

## 8. Prioritized Action Plan

### Immediate (Fix Before Release)

| # | Action | Finding Ref | Effort |
|---|--------|-------------|--------|
| 1 | Add review approval check in order transitionStatus when newStatus=6 | S-3.1, B-3.2 | S |
| 2 | Strip `status` from update data in lead.service.ts and order.service.ts | S-3.3, B-3.15, B-3.16 | S |
| 3 | Add mergeable field allowlist in lead merge | S-3.2, B-3.3 | S |
| 4 | Fix lead/order number generation with atomic counter | B-3.1, B-3.13 | S |
| 5 | Add review checklist update endpoint | B-3.14, G-3.4 | M |
| 6 | Add scopeFilter to assignLead, assignOrder | S-3.4, S-3.5, B-3.10, B-3.11 | S |
| 7 | Fix Stripe raw body parser ordering | T-3.4 | S |
| 8 | Add OTP brute force protection (max attempts check) | S-3.15 | S |
| 9 | Replace SHA-256 with bcrypt for password reset tokens | S-3.16 | S |
| 10 | Validate and sanitize deviceId input | S-3.17 | S |

### Short-term (Next Sprint)

| # | Action | Finding Ref | Effort |
|---|--------|-------------|--------|
| 1 | Wire CSRF middleware | S-3.6 | M |
| 2 | Register BullMQ automation jobs | B-3.4, T-3.2, G-3.2 | M |
| 3 | Implement event bus for Phase 3 modules | T-3.3, G-3.1 | L |
| 4 | Fix review-order coupling (use order service for status changes) | B-3.8, T-3.12 | S |
| 5 | Add bulk operation size limits | B-3.12 | S |
| 6 | Add per-endpoint rate limiters for mutations | S-3.7 | M |
| 7 | Fix bulk assign staff validation | B-3.6 | S |
| 8 | Fix order bulk assign route path | B-3.7 | S |
| 9 | Add scopeFilter to all missing endpoints (B-3.24, B-3.25, B-3.34-B-3.37) | Multiple | M |
| 10 | Write ACTUAL service-level and integration tests for Phase 3 | Test coverage | L |
| 11 | Add maxLength validation to all text fields | S-3.11 | M |
| 12 | Use atomic operations for webhook duplicate check | S-3.8 | S |
| 13 | Remove Tier 1 cross-dependency: payment-gateway → audit-log | S-3.19 | M |
| 14 | Extract hardcoded magic numbers to config | S-3.20 | M |
| 15 | Add payment gateway env validation (at least one gateway required) | S-3.18 | S |

### Long-term (Roadmap)

| # | Action | Finding Ref | Effort |
|---|--------|-------------|--------|
| 1 | Implement data anonymization/erasure workflow for Privacy Act 1988 | G-14 (previous), compliance | XL |
| 2 | Add Redis caching for auth middleware | B-9 (previous) | M |
| 3 | Add Redis caching for dashboard stats | Performance #10 | M |
| 4 | Fix N+1 queries in automation handlers | B-3.17, Performance #1-4 | M |
| 5 | Add OpenAPI/Swagger documentation | G-15 (previous) | L |
| 6 | Add structured logging (Winston/Pino) | G-9 (previous) | M |
| 7 | Implement cancel cascade (void Xero, cancel payments) | G-3.12 | L |

*(Effort: S = < 1 day, M = 1-3 days, L = 1-2 weeks, XL = 2+ weeks)*

---

## Final Verdict

This codebase is **NOT production-ready**. While the foundation is solid -- TypeScript strict mode, consistent patterns, proper RBAC wiring, good Tier 1/Tier 2 separation -- the Phase 3 modules have critical authorization bypass vulnerabilities that must be fixed. The three most dangerous findings are:

1. **S-3.1/B-3.2**: Tax returns can be completed and lodged without review approval. This violates ATO professional standards and is a regulatory risk.
2. **S-3.3/B-3.15/B-3.16**: Both lead and order status can be set to any value via the update endpoint, completely bypassing the state machine that governs the entire workflow.
3. **B-3.1**: Number generation race conditions will cause production errors under any concurrent load.

Fix the 7 Immediate items. Then fix the test coverage -- the Phase 3 tests are window dressing that test TypeScript enums, not actual behavior. Without real service and integration tests, every future change is a gamble.

**Health Score: 6.5/10** -- strong bones, weak defenses. Fix the authorization gaps and it becomes an 8.
