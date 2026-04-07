# QEGOS Test Case Documentation

**Product:** QEGOS — Tax Preparation, Filing & Client Management Platform
**Market:** Australia
**Date:** 2026-04-07
**Source:** QEGOS Final Production PRD v4.0

---

## Test Case Format

Each test case follows this structure:

- **Test ID:** `{PHASE}-{MODULE}-{NUMBER}`
- **Description:** What is being tested
- **Preconditions:** Setup required
- **Steps:** Numbered execution steps
- **Expected Result:** Pass criteria
- **Priority:** P0 (must pass for deploy) / P1 (must pass for release) / P2 (should pass)
- **Related Invariant:** Invariant ID(s) from PRD

---

## Phase 0: Foundation

### RBAC

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P0-RBAC-001 | checkPermission blocks unauthorized access | Staff user, resource=payments, action=delete | 1. Authenticate as staff 2. DELETE /api/v1/payments/:id | 403 {code: "FORBIDDEN", message: "Insufficient permissions"} — no resource existence info | P0 | RBAC-INV-01, RBAC-INV-08 |
| P0-RBAC-002 | Scope "assigned" filters DB queries | Staff user with 5 assigned leads out of 200 total | 1. GET /api/v1/leads | Response contains exactly 5 leads, all with assignedTo matching staffId | P0 | RBAC-INV-02 |
| P0-RBAC-003 | Scope "own" filters DB queries | Client with 2 orders, other clients have 50 orders | 1. GET /api/v1/orders | Response contains exactly 2 orders, all with userId matching clientId | P0 | RBAC-INV-03 |
| P0-RBAC-004 | Client cannot see other client's order | Client A, Order belongs to Client B | 1. GET /api/v1/orders/:clientBOrderId as Client A | 403 (identical to "not found" response) | P0 | RBAC-INV-03, RBAC-INV-08 |
| P0-RBAC-005 | Role change requires admin+ and creates critical AuditLog | Admin user | 1. PUT /api/v1/users/:id/role {roleId} | Role updated. AuditLog created with severity=critical, actor=adminId | P0 | RBAC-INV-04 |
| P0-RBAC-006 | System roles cannot be deleted | super_admin user | 1. DELETE /api/v1/roles/:systemRoleId | 400 "System roles cannot be deleted" | P0 | RBAC-INV-05 |
| P0-RBAC-007 | System role permissions cannot be reduced below baseline | super_admin user | 1. PUT /api/v1/roles/:adminRoleId removing "payments" read | 400 "Cannot reduce system role below baseline" | P0 | RBAC-INV-05 |
| P0-RBAC-008 | Bulk operations check per-item permissions | Staff with 3 assigned orders, bulk-assign includes 1 unassigned | 1. PUT /api/v1/orders/bulk-assign {orderIds: [own1, own2, other1]} | Entire batch fails with item-level errors for other1 | P0 | RBAC-INV-09 |
| P0-RBAC-009 | Disabled role blocks all access | User with isActive=false role | 1. Any authenticated API call | 403 on every endpoint | P0 | RBAC-INV-12 |
| P0-RBAC-010 | Role cache invalidated on update | Role in Redis cache | 1. PUT /api/v1/roles/:id 2. Immediately check Redis | Cache entry removed/updated | P1 | RBAC-INV-11 |

### Audit Logging

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P0-AUD-001 | Order creation creates AuditLog | Authenticated client | 1. POST /api/v1/orders | AuditLog entry: action=create, resource=order, actor=clientId | P0 | RBAC-INV-06 |
| P0-AUD-002 | Payment mutation creates AuditLog | Payment exists | 1. Trigger payment.succeeded webhook | AuditLog: action=payment_capture, severity=critical | P0 | RBAC-INV-06 |
| P0-AUD-003 | AuditLog is append-only | AuditLog entry exists | 1. Attempt UPDATE on auditlogs collection 2. Attempt DELETE on auditlogs collection | Both operations rejected | P0 | RBAC-INV-07 |
| P0-AUD-004 | AuditLog includes metadata | Any mutation | 1. Perform action | AuditLog.metadata contains: ipAddress, userAgent, requestMethod, requestPath | P1 | RBAC-INV-06 |
| P0-AUD-005 | Permission snapshot on role change | Role exists | 1. PUT /api/v1/roles/:id (modify permissions) | PermissionSnapshot created with before/after/diff | P0 | PRM-INV-01 |
| P0-AUD-006 | Permission change requires reason | Admin user | 1. PUT /api/v1/roles/:id without reason field | 400 validation error: reason required | P0 | PRM-INV-02 |

### Rate Limiting

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P0-RATE-001 | OTP send rate limited | — | 1. POST /auth/send-otp x4 with same mobile in 15 min | 4th request returns 429 | P0 | SEC-INV-01 |
| P0-RATE-002 | OTP verify rate limited | Valid OTP exists | 1. POST /auth/verify-otp x6 with wrong code | 6th attempt returns 429 | P0 | SEC-INV-01 |
| P0-RATE-003 | Signin rate limited | — | 1. POST /auth/signin x6 same email in 15 min | 6th returns 429 | P0 | SEC-INV-01 |
| P0-RATE-004 | Forgot password rate limited | — | 1. POST /auth/forgot-password x4 same email in 1 hour | 4th returns 429 | P0 | SEC-INV-01 |

### JWT & Auth

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P0-JWT-001 | Access token expires in 15 minutes | Valid JWT issued | 1. Wait 16 minutes 2. Use token | 401 TOKEN_EXPIRED | P0 | — |
| P0-JWT-002 | Refresh token rotation | Valid refresh token | 1. POST /auth/refresh with token 2. Use same token again | First: new tokens issued. Second: ALL tokens revoked (replay detection) | P0 | SEC-INV-04 |
| P0-JWT-003 | Account lockout after 10 failures | User exists | 1. POST /auth/signin with wrong password x10 | 11th attempt: 403 "Account locked for 30 minutes" | P0 | SEC-INV-02 |
| P0-JWT-004 | Password change invalidates old tokens | Authenticated user | 1. POST /auth/change-password 2. Use old access token | Old token rejected (iat < passwordChangedAt) | P0 | SEC-INV-05 |
| P0-JWT-005 | Max 5 concurrent sessions | User with 5 active sessions | 1. Login from 6th device | Login succeeds, oldest session revoked | P0 | SEC-INV-06 |
| P0-JWT-006 | OTP expires after 5 minutes | OTP sent | 1. Wait 6 minutes 2. Verify OTP | 401 "OTP expired" | P0 | SEC-INV-08 |

### Tax Rule Seeding

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P0-TAX-001 | FY2024-25 resident brackets seeded correctly | Fresh DB | 1. Seed tax rules 2. GET /api/v1/tax/rules/2024-25 | 5 brackets: $0-18200 (0%), $18201-45000 (16%), $45001-135000 (30%), $135001-190000 (37%), $190001+ (45%) | P0 | TAX-INV-01 |
| P0-TAX-002 | Non-resident brackets seeded | Fresh DB | 1. Seed 2. Check non-resident | 3 brackets: $0-135000 (30%), $135001-190000 (37%), $190001+ (45%) | P0 | TAX-INV-01 |
| P0-TAX-003 | Working holiday brackets seeded | Fresh DB | 1. Seed 2. Check working holiday | 4 brackets: $0-45000 (15%), $45001-135000 (30%), $135001-190000 (37%), $190001+ (45%) | P0 | TAX-INV-01 |
| P0-TAX-004 | HECS-HELP tiers seeded | Fresh DB | 1. Seed 2. Check hecsRepaymentTiers | ~15 tiers with correct thresholds | P1 | TAX-INV-01 |

---

## Phase 1: Payment Hardening

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P1-PAY-001 | Idempotency key prevents duplicate payments | Order exists | 1. POST /payments/intent {idempotencyKey: "abc-123"} 2. POST /payments/intent {idempotencyKey: "abc-123"} again | Second request returns same paymentId and clientSecret as first | P0 | PAY-INV-01 |
| P1-PAY-002 | All amounts stored as integer cents | — | 1. Create payment for $165.00 | Payment.amount = 16500 (integer) | P0 | PAY-INV-02 |
| P1-PAY-003 | Stripe webhook signature verification | Raw webhook body | 1. POST /webhooks/stripe with valid signature 2. POST with tampered body | Valid: processed. Tampered: 400 | P0 | PAY-INV-04 |
| P1-PAY-004 | Payzoo HMAC verification | Webhook body | 1. POST /webhooks/payzoo with valid HMAC 2. POST with invalid HMAC | Valid: processed. Invalid: 400 | P0 | PAY-INV-05 |
| P1-PAY-005 | Duplicate webhook returns 200 without reprocessing | Webhook already processed | 1. POST /webhooks/stripe with same eventId twice | Both return 200. Payment updated only once. | P0 | PAY-INV-03 |
| P1-PAY-006 | Refund cannot exceed captured amount | Payment captured for $165 | 1. POST /payments/refund {amount: 20000} (=$200) | 400 "Refund amount exceeds captured amount" | P0 | PAY-INV-06 |
| P1-PAY-007 | Cumulative refund check | Payment $165, already refunded $50 | 1. POST /payments/refund {amount: 12000} | 400 "Total refunds ($170) would exceed captured ($165)" | P0 | PAY-INV-06 |
| P1-PAY-008 | Gateway fallback on timeout | Stripe configured as primary | 1. Mock Stripe ETIMEDOUT 2. POST /payments/intent | Returns Payzoo clientSecret. AuditLog: "Gateway fallback: stripe->payzoo" | P0 | PAY-INV-08 |
| P1-PAY-009 | No fallback on business error | Card declined | 1. Stripe returns card_declined | Error returned to client. No Payzoo attempt. | P0 | PAY-INV-08 |
| P1-PAY-010 | Maintenance mode blocks payments | maintenanceMode=true | 1. POST /payments/intent | 503 {code: "PAYMENT_MAINTENANCE", retryAfter: 3600} | P0 | PAY-INV-10 |
| P1-PAY-011 | Payment state transitions are one-directional | Payment in "succeeded" | 1. Attempt to set status to "pending" | 400 "Invalid status transition" | P0 | PAY-INV-07 |
| P1-PAY-012 | Client never receives raw gateway objects | — | 1. Any payment response | No Stripe/Payzoo internal objects in response | P1 | PAY-INV-09 |
| P1-PAY-013 | GST calculated per line item | Order: $99 + $165 | 1. Calculate GST | GST: Math.round(9900/11)=900 + Math.round(16500/11)=1500 = 2400 total | P0 | BIL-INV-01 |
| P1-PAY-014 | Refund >$500 requires admin approval | Staff user, refund $600 | 1. POST /payments/refund {amount: 60000} | 403 "Refund amount requires admin approval" | P0 | BIL-INV-04 |
| P1-PAY-015 | Refund >$2000 requires super_admin | Admin user, refund $2500 | 1. POST /payments/refund {amount: 250000} | 403 "Refund amount requires super_admin approval" | P0 | BIL-INV-04 |
| P1-PAY-016 | Duplicate charge detection | Same orderId, 2 payments in 3 min | 1. Create 2 payments for same order | Auto-flag for review. No auto-refund. | P1 | BIL-INV-06 |

---

## Phase 2: Xero Integration

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P2-XRO-001 | OAuth tokens encrypted before storage | Xero connected | 1. Check DB directly for xeroAccessToken | Token is AES-256-GCM encrypted, not plaintext | P0 | XRO-INV-01 |
| P2-XRO-002 | Token refresh uses Redis lock | 2 concurrent requests need refresh | 1. Trigger 2 simultaneous refreshes | Only 1 refresh call to Xero. Other waits. | P0 | XRO-INV-02 |
| P2-XRO-003 | Rate limit: 60 calls/min | — | 1. Fire 70 Xero API calls in 1 minute | First 60 succeed. Remaining queued with delay. | P0 | XRO-INV-03 |
| P2-XRO-004 | Idempotent invoice creation | Order with xeroInvoiceId already set | 1. Trigger "order.invoiceable" event | No duplicate invoice created. Skip logged. | P0 | XRO-INV-04 |
| P2-XRO-005 | Xero search prevents duplicate from manual entry | Invoice exists in Xero with matching orderNumber | 1. Trigger invoice sync | Duplicate detected via Xero search. Skip. | P1 | XRO-INV-04 |
| P2-XRO-006 | Retry with exponential backoff | Xero returns 500 | 1. Trigger sync 2. Monitor retries | Retries at: 1min, 5min, 30min, 2hr. After 4: failed + Slack | P0 | XRO-INV-05 |
| P2-XRO-007 | Contact matched by email first | User with email+mobile | 1. Sync contact to Xero | Match by email (primary), then mobile (fallback). Never by name. | P1 | XRO-INV-06 |
| P2-XRO-008 | Invoice uses priceAtCreation | Sales price changed after order | 1. Create order (price $165) 2. Change Sales price to $175 3. Sync invoice | Invoice line item: $165 (not $175) | P0 | XRO-INV-07 |
| P2-XRO-009 | Void requires cancelled order | Order in progress | 1. POST /xero/void-invoice/:orderId | 400 "Order must be cancelled to void invoice" (unless admin override) | P1 | XRO-INV-08 |
| P2-XRO-010 | Reconciliation flags mismatch | QEGOS: $165, Xero: $165.02 | 1. POST /xero/reconciliation | Mismatch flagged (> $0.01 threshold) | P1 | XRO-INV-09 |
| P2-XRO-011 | Offline queue works | Xero disconnected | 1. Trigger invoice sync while disconnected 2. Reconnect 3. Bulk sync | Sync jobs queued. After reconnect: all processed. | P0 | XRO-INV-10 |
| P2-XRO-012 | GST matches Australian rules | Invoice with GST-inclusive prices | 1. Check invoice GST line | GST = price / 11 per line item | P0 | XRO-INV-11 |

---

## Phase 3: Lead & Order Core

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P3-LM-001 | Lead dedup on mobile | Existing lead with +61412345678 | 1. POST /leads {mobile: "+61412345678"} | Returns {isDuplicate: true, duplicateMatches: [existing]} — not blocked | P0 | LM-INV-01 |
| P3-LM-002 | Status transition validation | Lead in New (1) | 1. PATCH /leads/:id/status {status: 5} (Negotiation) | 400 {currentStatus: 1, allowedTransitions: [2, 7]} | P0 | LM-INV-02 |
| P3-LM-003 | Lost requires reason | Lead in Contacted (2) | 1. PATCH /leads/:id/status {status: 7} without lostReason | 400 "lostReason required" | P0 | LM-INV-03 |
| P3-LM-004 | Conversion is atomic | Lead ready for conversion | 1. POST /leads/:id/convert | All 3 records created in transaction: isConverted, User, Order | P0 | LM-INV-04 |
| P3-LM-005 | Double conversion blocked | Already converted lead | 1. POST /leads/:id/convert | 409 {code: "ALREADY_CONVERTED", convertedOrderId} | P0 | LM-INV-05 |
| P3-LM-006 | Mobile normalized to E.164 | — | 1. POST /leads {mobile: "0412345678"} | Stored as "+61412345678" | P0 | LM-INV-09 |
| P3-LM-007 | Soft-deleted leads excluded | Deleted lead exists | 1. GET /leads (as admin, non-deleted view) | Deleted lead not in results | P0 | LM-INV-10 |
| P3-ORD-001 | Order status machine enforced | Order in Pending (1) | 1. PATCH /orders/:id/status {status: 5} (Review) | 400 {allowedTransitions: [2, 9]} | P0 | ORD-INV-01 |
| P3-ORD-002 | priceAtCreation frozen | Order with lineItem priced at $165 | 1. Update Sales price to $175 2. GET /orders/:id | lineItem.priceAtCreation still 16500 | P0 | ORD-INV-02 |
| P3-ORD-003 | Server-side calculation | Order with client-submitted totals | 1. POST /orders with totalAmount=0 | totalAmount recalculated server-side from lineItems | P0 | ORD-INV-03 |
| P3-ORD-004 | TFN encrypted | Order with TFN | 1. Check DB directly | tfnEncrypted is AES-256-GCM, only tfnLastThree in plaintext | P0 | ORD-INV-05 |
| P3-ORD-005 | userId immutable | Order exists | 1. PUT /orders/:id {userId: differentUserId} | userId unchanged (ignored or 400) | P0 | ORD-INV-06 |
| P3-RVW-001 | Self-review blocked | Staff A prepared order | 1. Submit for review 2. Assign Staff A as reviewer | 400 "Preparer cannot be reviewer" | P0 | RVW-INV-02 |
| P3-RVW-002 | Approval requires all checklist items | 11 of 12 items checked | 1. PATCH /order-reviews/:id/approve | 400 "All checklist items must be checked" | P0 | RVW-INV-03 |
| P3-RVW-003 | Review->Completed requires approval | Order in Review (5), no approved ReviewAssignment | 1. PATCH /orders/:id/status {status: 6} | 400 "Approved ReviewAssignment required" | P0 | RVW-INV-01 |
| P3-RVW-004 | Lodgement double-gate | Order status 6, no locked TaxReturnResult | 1. PATCH /orders/:id/status {status: 7} | 400 "Locked TaxReturnResult required" | P0 | RVW-INV-07 |

---

## Phase 4: Lead Advanced + Tax Engine

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P4-LM-001 | Lead scoring correct | Lead with email, rental property, self-employed | 1. Calculate score | Score = 5 (email) + 15 (rental) + 15 (self-employed) = 35 (warm) | P1 | LM-INV-11 |
| P4-LM-002 | Bulk import two-pass validation | Excel with 1 invalid row | 1. POST /leads/import | 0 imported. Error details for invalid row. | P0 | LM-INV-08 |
| P4-LM-003 | Lead merge transfers all data | Primary + secondary with activities | 1. POST /leads/merge | All activities transferred. Secondary soft-deleted. AuditLog. | P0 | LM-INV-06 |
| P4-TAX-001 | Pure function: zero income | income=0 | 1. calculateTaxEstimate({grossIncome: 0}, rules) | tax: 0, refund: 0 | P0 | TAX-INV-02 |
| P4-TAX-002 | Below tax-free threshold | gross=$18,200 resident | 1. Calculate | baseTax: 0, medicareLevyAmount: 0 | P0 | TAX-INV-01 |
| P4-TAX-003 | Just above threshold | gross=$18,201 resident | 1. Calculate | baseTax: $0.16 (16 cents) | P0 | TAX-INV-01 |
| P4-TAX-004 | Median income validation | gross=$65,000 resident | 1. Calculate | Validate against ATO online calculator | P0 | TAX-INV-01 |
| P4-TAX-005 | Non-resident exempt from ML/LITO/SAPTO | non-resident, gross=$50,000 | 1. Calculate | 30% from $0, no LITO, no ML, no SAPTO | P0 | TAX-INV-06 |
| P4-TAX-006 | Negative gearing | employment=$80K, rental=-$10K | 1. Calculate | taxableIncome based on $70K | P0 | — |
| P4-TAX-007 | CGT 50% discount | longTermGain=$20K, resident | 1. Calculate | Only $10K included in taxable income | P0 | TAX-INV-08 |
| P4-TAX-008 | CGT no discount for non-resident | longTermGain=$20K, non-resident | 1. Calculate | Full $20K included | P0 | TAX-INV-08 |
| P4-TAX-009 | HECS minimum tier | gross=$54,882, hasHecs=true | 1. Calculate | HECS repayment = 1% of income. Shown separately from tax. | P0 | TAX-INV-07 |
| P4-TAX-010 | Excess franking credits refunded | income=$10K, franking=$5K | 1. Calculate | Excess franking credits added to refund | P1 | TAX-INV-04 |
| P4-TAX-011 | Tax payable never negative | Large offsets exceeding tax | 1. Calculate with offsets > base tax | totalTaxPayable: 0 (floor). Excess to refund. | P0 | TAX-INV-04 |
| P4-TAX-012 | All integer arithmetic | Any calculation | 1. Run calculation 2. Inspect all intermediate values | No floating point at any stage | P0 | TAX-INV-03 |
| P4-TAX-013 | Disclaimer always present | Any estimate | 1. POST /tax/estimate | Response includes disclaimer, rulesSnapshotId, rulesVersion, calculatedAt | P0 | TAX-INV-05 |
| P4-TAX-014 | Estimate stored in log | — | 1. POST /tax/estimate | taxEstimateLog record created with full input/output | P0 | TAX-INV-09 |
| P4-TAX-015 | Frozen rules immutable | Rules with usageCount > 0 | 1. PUT /api/v1/tax/rules/:id | 400 "Config is frozen (immutable)" | P0 | VER-INV-01 |
| P4-TAX-016 | Only one active per FY | Active rules exist for FY2024-25 | 1. Activate new rules for FY2024-25 | Previous active -> superseded. New -> active. | P0 | VER-INV-04 |
| P4-TAX-017 | Amendment uses original snapshot | Original order with snapshotId "abc" | 1. POST /tax-results/amendment for this order | System loads snapshotId "abc", not current active | P0 | VER-INV-05 |
| P4-TAX-018 | Locked return immutable | TaxReturnResult with isLocked=true | 1. PUT /tax-results/:id {taxableIncome: 999} | Financial fields unchanged. Only ATO status editable. | P0 | VER-INV-06 |
| P4-TAX-019 | Correction creates new version | Frozen rules | 1. POST /tax/rules/:id/correct {changeReason: "..."} | New version created. parentSnapshotId set. Original unchanged. | P0 | VER-INV-07 |
| P4-TAX-020 | Delete only draft with zero usage | Draft rules, usageCount=0 | 1. DELETE rules | Success. 2. Try with usageCount>0: 400 | P0 | VER-INV-10 |
| P4-TAX-021 | Medicare Levy Surcharge for high income no PHI | gross=$100K, PHI=false, resident | 1. Calculate | MLS applied. Warning: "MLS of X% applies - consider PHI" | P1 | — |
| P4-TAX-022 | SAPTO for eligible senior | gross=$32K, senior=true | 1. Calculate | SAPTO offset applied | P1 | — |

---

## Phase 5: Broadcast Engine

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P5-BRC-001 | DND check at send time (not schedule time) | Campaign scheduled, contact opts out before send | 1. Schedule campaign 2. Contact opts out 3. Campaign executes | Opted-out contact NOT sent message | P0 | BRC-INV-01 |
| P5-BRC-002 | SMS includes STOP footer | Any SMS broadcast | 1. Send SMS broadcast | Every SMS includes "Reply STOP to unsubscribe" | P0 | BRC-INV-02 |
| P5-BRC-003 | Email includes sender ID and unsubscribe | Any email broadcast | 1. Send email broadcast | Business name + ABN in email. Unsubscribe link present. | P0 | BRC-INV-03 |
| P5-BRC-004 | Hard bounce triggers DND | SES reports 550 bounce | 1. Process bounce notification | Contact added to broadcastOptOut. Future sends blocked. | P0 | BRC-INV-04 |
| P5-BRC-005 | 3x soft bounce triggers DND | Same address bounces 3 times | 1. Process 3 soft bounces | Contact DND'd after third | P0 | BRC-INV-04 |
| P5-BRC-006 | Spam complaint DND all channels | SES spam complaint | 1. Process complaint | DND for ALL channels (sms, email, whatsapp) | P0 | BRC-INV-04 |
| P5-BRC-007 | Sending campaign not editable | Campaign in "sending" | 1. PUT /broadcasts/campaigns/:id | 400 "Cannot edit campaign in sending status" | P0 | BRC-INV-05 |
| P5-BRC-008 | Audience recalculated at execution | New user added after schedule | 1. Schedule campaign 2. Add new matching user 3. Campaign executes | New user included in audience | P1 | BRC-INV-06 |
| P5-BRC-009 | Consent required per channel | Contact without email consent | 1. Send email campaign | Contact skipped. ConsentRecord checked. | P0 | BRC-INV-07 |
| P5-BRC-010 | Merge tag fallback | Contact without firstName | 1. Send "Hi {{firstName}}" | Rendered as "Hi Valued Client" (not "Hi {{firstName}}") | P0 | BRC-INV-08 |
| P5-BRC-011 | SMS rate limit: 10/sec | 5000 SMS campaign | 1. Monitor send rate | Max 10 messages/second | P1 | — |
| P5-BRC-012 | Email rate limit: 100/sec | Large email campaign | 1. Monitor send rate | Max 100 emails/second | P1 | — |

---

## Phase 6: Client Portal & Vault

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P6-CPV-001 | ClamAV blocks infected file | EICAR test file | 1. POST /vault/upload with EICAR | 400 "File could not be uploaded. Please scan your device and try again." | P0 | CPV-INV-01 |
| P6-CPV-002 | S3 path per-user isolation | Client A upload | 1. Upload file | S3 path: vault/{userAId}/{fy}/{uuid}-{filename} | P0 | CPV-INV-02 |
| P6-CPV-003 | Presigned URL expires in 15 min | Document exists | 1. GET /vault/documents/:id 2. Wait 16 min 3. Use URL | URL expired, access denied | P0 | CPV-INV-03 |
| P6-CPV-004 | Magic bytes validation | .exe renamed to .pdf | 1. Upload renamed exe | 400 "File type not allowed" | P0 | CPV-INV-04 |
| P6-CPV-005 | Max file size 20MB | 25MB file | 1. Upload | 400 "File too large" | P0 | CPV-INV-04 |
| P6-CPV-006 | Soft delete with 30-day grace | Document exists | 1. DELETE /vault/documents/:id | isArchived=true. Not permanently deleted. Restorable. | P0 | CPV-INV-05 |
| P6-CPV-007 | Storage quota enforced | 495MB used, 500MB quota, 10MB file | 1. Upload | 400 {code: "STORAGE_EXCEEDED", used, quota, fileSize} | P0 | CPV-INV-06 |
| P6-CPV-008 | Document versioning | Same category+FY already exists | 1. Upload new version | version=2, previousVersionId set | P1 | CPV-INV-07 |
| P6-CPV-009 | Staff vault access creates audit | Staff user | 1. GET /vault/documents/:id for client | AuditLog: severity=warning | P0 | CPV-INV-08 |
| P6-CPV-010 | Duplicate file detection (advisory) | Same file already uploaded | 1. Upload identical file | WARNING with existing file info. Upload proceeds if confirmed. | P1 | STR-INV-02 |
| P6-CPV-011 | Atomic storage counter | Upload succeeds | 1. Upload 5MB file 2. Check User.storageUsed | storageUsed incremented by exactly 5MB (via $inc) | P0 | STR-INV-01 |
| P6-CPV-012 | Hard delete: S3 first then counter | 30-day cron runs | 1. S3 delete succeeds 2. Counter decremented | Counter only decremented after confirmed S3 deletion | P0 | STR-INV-04 |
| P6-CPV-013 | Upload rate limit per userId | Same user | 1. Upload 21 files in 10 min | 21st blocked (429) | P1 | STR-INV-03 |

---

## Phase 7: Communication Suite

### Chat

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P7-CHT-001 | TFN auto-redacted in storage | — | 1. Send message "My TFN is 123 456 789" | content: "My TFN is *** *** ***". contentOriginal: encrypted. | P0 | CHT-INV-01 |
| P7-CHT-002 | Chat file virus scanned | EICAR file | 1. Share file in chat | Blocked. Same ClamAV pipeline. | P0 | CHT-INV-02 |
| P7-CHT-003 | One active conversation per client | Client with active conversation | 1. POST /chat/conversations | Returns existing active conversation, not new one | P0 | CHT-INV-03 |
| P7-CHT-004 | Socket.io requires valid JWT | Expired JWT | 1. Connect to Socket.io | Connection rejected / forced disconnect | P0 | CHT-INV-06 |
| P7-CHT-005 | Conversation transfer preserves history | 20 messages exist | 1. Transfer A->B | B sees all 20 messages. Client notified. | P0 | CHT-INV-07 |

### WhatsApp

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P7-WHA-001 | Media downloaded within 30 min | Inbound image message | 1. Webhook fires 2. Check download job | Media downloaded from Meta CDN and stored in S3 | P0 | WHA-INV-01 |
| P7-WHA-002 | Freeform blocked outside window | Last inbound > 24hr ago | 1. POST /whatsapp/send-freeform | 400 {code: "WINDOW_EXPIRED"} | P0 | WHA-INV-02, WHA-INV-03 |
| P7-WHA-003 | Template required for business-initiated | No recent inbound | 1. POST /whatsapp/send without templateName | 400 "templateName required" | P0 | WHA-INV-02 |
| P7-WHA-004 | Phone format conversion | Internal: +61412345678 | 1. Send to Meta API | Formatted as 61412345678 (no + prefix) | P0 | WHA-INV-04 |
| P7-WHA-005 | Auto-create lead activity | Inbound WhatsApp from lead | 1. Webhook processes message | LeadActivity created: type=whatsapp_received | P0 | WHA-INV-05 |
| P7-WHA-006 | DND checked before outbound | Contact on DND | 1. POST /whatsapp/send | Message not sent. DND enforced. | P0 | WHA-INV-07 |

### Support Tickets

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P7-TKT-001 | SLA auto-calculated | Priority=urgent | 1. POST /tickets {priority: "urgent"} | slaDeadline = now + 4hr (business hours) | P0 | TKT-INV-01 |
| P7-TKT-002 | Staff complaint routing | category=staff_complaint | 1. POST /tickets | Auto-assigned to office_manager, NOT complained-about staff | P0 | TKT-INV-02 |
| P7-TKT-003 | Internal messages hidden from client | isInternal=true message | 1. GET /tickets/:id as client | Internal messages not in response | P0 | TKT-INV-03 |
| P7-TKT-004 | SLA breach auto-detection | SLA deadline passed | 1. Wait for cron (every 5 min) | slaBreached=true, Slack alert, escalation | P0 | TKT-INV-04 |
| P7-TKT-005 | Max 3 reopens | Ticket reopened 3 times | 1. POST /tickets/:id/reopen | 400 "Maximum reopens reached" | P1 | TKT-INV-06 |
| P7-TKT-006 | Auto-close after 7 days waiting | waiting_on_client for 7+ days | 1. Cron runs | Status -> closed with system message | P1 | TKT-INV-05 |

---

## Phase 8: Engagement Modules

### Calendar

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P8-CAL-001 | No reminder for already-filed clients | Client with Order.status=Lodged for FY | 1. Process deadline reminders | Client skipped | P0 | CAL-INV-01 |
| P8-CAL-002 | Weekend deadline shifted | Deadline falls on Saturday | 1. Process | Shifted to Monday (or next business day) | P1 | CAL-INV-02 |
| P8-CAL-003 | Reminder deduplication | Reminder already sent for 7-day tier | 1. Process again | Skip (unique {userId, deadlineId, daysBefore}) | P1 | CAL-INV-03 |

### Reviews

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P8-REV-001 | Google prompt for ALL ratings | Rating=2 | 1. Submit review | Google Review prompt shown (same as for rating=5) | P0 | REV-INV-01 |
| P8-REV-002 | One review per order per client | Review exists | 1. POST /reviews/submit same orderId | Returns existing review, no duplicate | P0 | REV-INV-02 |
| P8-REV-003 | Review requires payment | Order with no succeeded payment | 1. Trigger review request | Request NOT sent | P0 | REV-INV-05 |
| P8-REV-004 | Reviews cannot be deleted | Admin user | 1. Attempt delete | No DELETE endpoint exists / 404 | P0 | REV-INV-04 |

### Referrals

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P8-REF-001 | Reward only on completion + payment | Referee's order completed but no payment | 1. Check reward trigger | Reward NOT triggered | P0 | REF-INV-01 |
| P8-REF-002 | Self-referral blocked | Referrer mobile = referee mobile | 1. POST /referrals/apply | 400 "Self-referral not allowed" | P0 | REF-INV-02 |
| P8-REF-003 | One-time referral per person | Referee already referred | 1. POST /referrals/apply with same refereeId | 409 "Already referred" | P0 | REF-INV-03 |
| P8-REF-004 | Max referrals per year | Referrer at 50 referrals | 1. Share works, but reward check | Sharing succeeds but reward not triggered | P1 | REF-INV-07 |
| P8-REF-005 | Code case-insensitive | Code "qgs-ref-abcd" | 1. Validate | Matches stored "QGS-REF-ABCD" | P1 | REF-INV-05 |

---

## Phase 9: Revenue Intelligence

| Test ID | Description | Preconditions | Steps | Expected Result | Priority | Invariant |
|---------|-------------|---------------|-------|-----------------|----------|-----------|
| P9-ANA-001 | Analytics query hits read replica | Any analytics endpoint | 1. Monitor DB connections | Query on read replica, not primary | P0 | ANA-INV-01 |
| P9-ANA-002 | Revenue from succeeded payments only | Mix of succeeded and failed payments | 1. GET /analytics/executive-summary | Revenue figure excludes failed/pending | P0 | ANA-INV-02 |
| P9-ANA-003 | CLV excludes pending payments | — | 1. POST /analytics/clv | CLV uses succeeded/captured only | P0 | ANA-INV-03 |
| P9-ANA-004 | Year 1 shows "Estimated" label | < 12 months data | 1. GET /analytics/revenue-forecast | Forecast uses industry benchmarks. "Estimated" label displayed. | P1 | ANA-INV-04 |
| P9-ANA-005 | Max 366-day window | dateRange > 366 days | 1. GET /analytics/... with wide range | 400 "Maximum date range is 366 days" | P1 | ANA-INV-05 |
| P9-ANA-006 | Dashboard cached 5 min | — | 1. GET /analytics/executive-summary twice in 2 min | Second request served from cache | P1 | ANA-INV-06 |

---

## Phase 10: Polish & Hardening

### Integration Tests

| Test ID | Description | Steps | Expected Result | Priority |
|---------|-------------|-------|-----------------|----------|
| P10-INT-001 | End-to-end: signup -> order -> payment -> Xero -> review | 1. Client signup 2. Create order 3. Pay (Stripe) 4. Verify Xero invoice+payment 5. Submit for review 6. Approve 7. Lodge | All systems in sync. Audit trail complete. | P0 |
| P10-INT-002 | Lead -> convert -> order -> complete -> review request -> referral reward | 1. Create lead (referral) 2. Convert 3. Complete order+pay 4. Verify review request 5. Verify referral reward | Full lifecycle works. Rewards triggered. | P0 |
| P10-INT-003 | Broadcast -> leads -> conversion tracking | 1. Send campaign 2. Leads created from campaign 3. Track source | Lead.campaignId links correctly | P1 |
| P10-INT-004 | WhatsApp -> vault -> order document | 1. Client sends document via WhatsApp 2. Staff saves to vault 3. Link to order | Document flows from WhatsApp to vault to order | P1 |
| P10-INT-005 | Chat -> ticket -> resolution -> satisfaction | 1. Chat conversation 2. Convert to ticket 3. Resolve 4. Client rates | Full support lifecycle | P1 |

### Load Tests

| Test ID | Description | Target | Expected Result | Priority |
|---------|-------------|--------|-----------------|----------|
| P10-LOAD-001 | 500 concurrent users | 500 authenticated users | All endpoints respond within P95 targets | P1 |
| P10-LOAD-002 | 50 req/sec sustained | 50 requests/second for 10 min | No errors, no OOM, no connection pool exhaustion | P1 |
| P10-LOAD-003 | Socket.io at scale | 200 concurrent WebSocket connections | Messages delivered within 1 second | P1 |
| P10-LOAD-004 | Broadcast at rate limits | 10 SMS/sec for 5 min | No Twilio rate limit errors | P1 |

### Security Tests (OWASP Top 10)

| Test ID | Description | Steps | Expected Result | Priority |
|---------|-------------|-------|-----------------|----------|
| P10-SEC-001 | No SQL/NoSQL injection | 1. Inject MongoDB operators in input | express-validator blocks. Parameterised queries only. | P0 |
| P10-SEC-002 | No XSS in responses | 1. Submit XSS payloads | Helmet CSP blocks. Sanitized output. | P0 |
| P10-SEC-003 | CORS whitelist enforced | 1. Request from unlisted origin | CORS error. No wildcard. | P0 |
| P10-SEC-004 | No sensitive data in errors | 1. Trigger server error in production | No stack traces, file paths, or internal details | P0 |
| P10-SEC-005 | TFN never in logs | 1. Search all log outputs for TFN patterns | Zero matches | P0 |
| P10-SEC-006 | Helmet headers present | 1. Check response headers | CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff | P0 |
| P10-SEC-007 | Certificate pinning (mobile) | 1. MITM proxy test on React Native | Connection refused | P1 |
| P10-SEC-008 | File upload validation comprehensive | 1. Upload polyglot files (exe disguised as PDF) | Blocked by magic bytes check | P0 |

---

## Test Case Summary

| Phase | Module | P0 | P1 | P2 | Total |
|-------|--------|----|----|-----|-------|
| 0 | Foundation | 20 | 4 | 0 | 24 |
| 1 | Payment Hardening | 12 | 4 | 0 | 16 |
| 2 | Xero Integration | 7 | 5 | 0 | 12 |
| 3 | Lead & Order Core | 12 | 0 | 0 | 12 |
| 4 | Lead Advanced + Tax | 16 | 6 | 0 | 22 |
| 5 | Broadcast Engine | 7 | 5 | 0 | 12 |
| 6 | Client Portal & Vault | 9 | 4 | 0 | 13 |
| 7 | Communication Suite | 14 | 3 | 0 | 17 |
| 8 | Engagement Modules | 5 | 7 | 0 | 12 |
| 9 | Revenue Intelligence | 3 | 3 | 0 | 6 |
| 10 | Polish & Hardening | 7 | 6 | 0 | 13 |
| **Total** | | **112** | **47** | **0** | **159** |
