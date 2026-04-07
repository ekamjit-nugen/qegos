# QEGOS Modular Strategy Gap Analysis

**Analyst:** Goku (Business Architect)
**Date:** 2026-04-07
**Product:** QEGOS -- Tax Preparation & Client Management Platform (Australia Market)
**PRD Version:** v4.0 (Consolidated April 2026)
**Scope:** Full modular architecture analysis across 26 sections, 38 collections, ~210 endpoints, ~163 invariants
**Severity Summary:** 14 Critical | 22 High | 31 Medium | 18 Low
**Previous Analysis:** First analysis

---

## Executive Summary

QEGOS v4 PRD is an impressively comprehensive document -- one of the most thorough platform specifications I have analyzed. The 26-section architecture covers the full client lifecycle from lead capture through retention, with 163 invariants providing strong guardrails. The hybrid tax engine approach (estimate calculator + external software import) is a smart architectural decision that avoids the regulatory liability of building ATO-certified calculation software.

However, the analysis reveals **14 critical gaps** that must be addressed before production. The most severe cluster around **data consistency in async flows** (BullMQ jobs that mutate multiple collections without compensating transactions), **missing sharding/partitioning strategy** for collections that will grow unboundedly (auditLogs, broadcastMessages, chatMessages), and **incomplete state machine coverage** where several transitions lack explicit invariants for concurrent modification. The PRD also has a notable blind spot around **data deletion/right-to-erasure under the Privacy Act 1988** -- the soft-delete pattern conflicts with APP 11 (destruction of personal information) and no data anonymization workflow is specified.

The 10-phase roadmap is well-sequenced but Phase 3 (Lead & Order Core) at 6 weeks is the highest-risk phase due to its breadth. The MVP scope (Phases 0-3, 19 weeks) is viable but borderline -- it delivers lead management and order processing but no client-facing portal, no document vault, and no tax estimation, which means clients interact only through staff until Phase 6. This is a business risk: the value proposition of "year-round client engagement" does not materialize until month 10+.

---

## Table of Contents

1. [Module Dependency Analysis](#1-module-dependency-analysis)
2. [Data Model Strategy Gaps](#2-data-model-strategy-gaps)
3. [API Design Consistency](#3-api-design-consistency)
4. [Invariant Coverage Gaps](#4-invariant-coverage-gaps)
5. [Phase Sequencing Analysis](#5-phase-sequencing-analysis)
6. [Scalability & Architecture Gaps](#6-scalability--architecture-gaps)
7. [Business Logic Gaps](#7-business-logic-gaps)
8. [Security Gaps](#8-security-gaps)
9. [Modular Decomposition Recommendations](#9-modular-decomposition-recommendations)
10. [Risk Matrix](#10-risk-matrix)

---

## 1. Module Dependency Analysis

### 1.1 Module Dependency Map (26 Sections)

```
                        +-----------+
                        | RBAC/Auth |  (S2, S3)
                        |  (Foundation) |
                        +-----+-----+
                              |
          +-------------------+-------------------+
          |                   |                   |
    +-----v-----+      +-----v-----+      +-----v-----+
    |  Audit Log |      | Notification|      |   Users   |  (S6)
    |   (S2.4)   |      |  Engine(S5) |      +-----------+
    +-----+-----+      +-----+-----+           |
          |                   |                 |
          |        +----------+----------+      |
          |        |          |          |      |
     +----v----+  +v---+ +---v---+ +---v---+  +v--------+
     |Analytics |  |Chat| |WhatsApp| |Calendar|  |  Leads  | (S12)
     |  (S20)   |  |(S15)| | (S16) | | (S17)  |  +---------+
     +---------+  +----+ +-------+ +-------+       |
                    |         |                     |
                    v         v                     v
               +--------+  +--------+       +-----------+
               |Tickets  |  |Broadcast|       |  Orders   | (S7)
               | (S21)   |  | (S13)  |       +-----+-----+
               +--------+  +--------+             |
                                          +-------+-------+
                                          |       |       |
                                     +----v-+ +---v----+ +v--------+
                                     |Tax   | |Review  | |Payments | (S9)
                                     |Engine| |Pipeline| +----+----+
                                     |(S8)  | |(S7.7)  |      |
                                     +------+ +--------+      |
                                                          +----v----+
                                          +----------+    |  Xero   | (S10)
                                          |Doc Vault | +--+ (S10)   |
                                          |  (S14)   |    +---------+
                                          +----------+
                                               |
                                          +----v----+
                                          |Client   |
                                          |Portal   |
                                          |(S14)    |
                                          +---------+

    Independent:
    +----------+  +----------+  +----------+
    | Reviews  |  | Referrals|  |Staff Mgmt|
    |  (S18)   |  |  (S19)   |  |  (S22)   |
    +----------+  +----------+  +----------+
```

### 1.2 Dependency Count Per Module

| Module | Depends On (Count) | Depended On By (Count) | Coupling Risk |
|--------|-------------------|----------------------|---------------|
| RBAC/Auth (S2-3) | 0 | 26 (all) | Foundation -- correct |
| Notification Engine (S5) | 1 (Users) | 14 | High fan-out -- correct as shared service |
| Audit Log (S2.4) | 1 (Users) | 22 | High fan-out -- correct as cross-cutting concern |
| Users (S6) | 2 (RBAC, Auth) | 20 | Heavily referenced -- expected |
| Orders (S7) | 4 (Users, Leads, Sales, RBAC) | 9 | Central entity -- expected |
| Tax Engine (S8) | 2 (Orders, Users) | 3 | Well-isolated |
| Payments (S9) | 3 (Orders, Users, RBAC) | 4 | Appropriate coupling |
| Xero (S10) | 4 (Orders, Payments, Users, Sales) | 2 | High external dependency |
| Leads (S12) | 3 (Users, Sales, RBAC) | 5 | Moderate |
| Broadcast (S13) | 4 (Leads, Users, ConsentRecord, DND) | 2 | Moderate |
| Client Portal/Vault (S14) | 3 (Users, Orders, TaxResults) | 2 | Moderate |
| Chat (S15) | 3 (Users, Orders, Notifications) | 2 | Moderate |
| WhatsApp (S16) | 4 (Leads, Users, Vault, DND) | 2 | High external dependency |
| Tickets (S21) | 4 (Users, Orders, Payments, Chat) | 1 | Moderate |

### 1.3 Circular Dependency Analysis

**No hard circular dependencies detected.** The PRD has a clean layered architecture. However, there are **soft circular references**:

| Cycle | Description | Severity |
|-------|-------------|----------|
| Orders <-> Reviews (S18) | Order.reviewId references Review; Review.orderId references Order | Medium -- bidirectional ref is acceptable for 1:1 relationships but creates tight coupling |
| Orders <-> Payments | Order needs payment status; Payment.orderId references Order. Order completion depends on payment state. | Medium -- expected for financial domain |
| Leads <-> Users | Lead conversion creates User; User may have originated from Lead. Lead.convertedUserId back-references. | Low -- conversion is a one-way lifecycle event |
| Chat <-> Tickets | Chat can spawn Tickets (S21.7); Tickets reference Chat for context | Low -- one-way integration point |

### 1.4 Tight Coupling Concerns

| GAP-DEP-01 | Module | Concern | Recommendation |
|------------|--------|---------|----------------|
| Orders (S7) | Orders model carries too many responsibilities: personal details, tax details, appointment scheduling, document management, Xero state, payment state, review state, e-file state | Order has ~35+ fields and serves as the "God object." Consider extracting: (a) `OrderAppointment` as a separate model (already partially done in S22); (b) `OrderEFileStatus` as a sub-document or separate tracker; (c) `OrderPersonalDetails` is duplicating User fields -- this violates DRY. |
| User (S6) | User model embeds: auth fields, profile fields, consent, storage quota, referral code, credit balance, FCM tokens, TFN encryption | ~30+ fields. Consider extracting `UserAuth` (auth-specific fields), `UserPreferences`, and `UserWallet` (creditBalance, discount). |

### 1.5 Cross-Module Integration Matrix Completeness (S23)

The integration matrix in S23 lists 33 integration points. **Missing integrations:**

| # | Missing Integration | From -> To | Business Impact |
|---|---------------------|-----------|-----------------|
| 1 | Tickets -> Referrals | Unresolved billing disputes should freeze referral rewards | Revenue leakage -- referrer gets reward while referee has active dispute |
| 2 | Payments -> Calendar | Failed payment should surface a "payment due" deadline in client calendar | Client misses payment awareness |
| 3 | Lead Scoring -> Broadcast | Hot leads excluded from cold-lead re-engagement broadcasts | Annoying hot leads with irrelevant comms |
| 4 | Staff Workload (S22) -> Lead Assignment | Round-robin should consider order workload, not just lead count | Staff overwhelm during tax season |
| 5 | Appointments (S22) -> Calendar (S17) | Client appointments should appear in their tax calendar | UX fragmentation |
| 6 | Document Vault -> Tax Engine | Vault OCR data could pre-fill tax estimate inputs | Manual re-entry of data already scanned |
| 7 | Analytics -> Broadcast | Churn-risk clients should auto-trigger re-engagement campaign | Manual process where automation is expected |
| 8 | BillingDispute -> Xero | Dispute resolution with refund should auto-create Xero credit note | Manual Xero adjustment required |

---

## 2. Data Model Strategy Gaps

### 2.1 Collection Inventory (38 Collections)

All 38 collections documented in S27 are accounted for. **Missing models that should exist:**

| # | Missing Model | Rationale | Severity |
|---|---------------|-----------|----------|
| M-01 | `Appointment` (standalone) | S22.2 defines appointment fields but embeds them inside Order.scheduledAppointment. Standalone appointments (not tied to orders) are mentioned but no model exists. Staff availability queries will be expensive scanning all orders. | High |
| M-02 | `ApplicationConfig` / `SystemConfig` | Xero config (S10.1) mentions "stored in Application model or dedicated config" but no model is defined. Multiple single-instance configs (PaymentGatewayConfig, ReferralConfig, WhatsAppConfig) suggest a pattern that should be unified. | Medium |
| M-03 | `DataDeletionRequest` | Privacy Act 1988 APP 11 requires responding to deletion requests. No model tracks these requests, their status, or completion. | Critical |
| M-04 | `StaffProfile` / `StaffCapacity` | Lead round-robin references "configurable max capacity" (LM-INV-07) but no model stores per-staff capacity, skills, or specializations. | Medium |
| M-05 | `CampaignAnalytics` (materialized) | Broadcast analytics computed on-the-fly from broadcastMessages. At scale (100K+ messages per campaign), this aggregation will be slow. | Medium |
| M-06 | `QueueDeadLetter` | BullMQ jobs that exhaust retries need a dead-letter record for manual review. No model captures permanently failed jobs. | High |
| M-07 | `LoginHistory` | User model has lastLoginAt/lastLoginIp but no history table. PRM-INV anomaly detection needs "no login in 90+ days" -- this requires login history, not just last login. | Medium |

### 2.2 Models That Should Be Split

| Model | Current Size | Recommendation |
|-------|-------------|----------------|
| **Order** (S7.1) | ~35+ fields | Extract `OrderAppointment` (date, timeSlot, staffId, type, meetingLink, status). Extract `OrderEFile` (eFileStatus, eFileReference, noaReceived, noaDate, refundOrOwing). This reduces Order document size and enables independent querying. |
| **User** (S6.1) | ~30+ fields | Extract `UserAuth` (refreshTokens, failedLoginAttempts, accountLockedUntil, mfaEnabled, mfaSecret, passwordChangedAt). Extract `UserFinancial` (creditBalance, discount, referralCode). The refreshTokens array (max 5 objects with hashed tokens) is particularly heavy for a frequently-read document. |
| **SupportTicket** (S21.2) | ~25+ fields with embedded messages array | The `messages` array will grow unboundedly for long-running tickets. Extract to `TicketMessage` collection (same pattern as ChatMessage). Embedded array anti-pattern in MongoDB for growing data. |

### 2.3 Models That Should Be Merged

| Models | Recommendation |
|--------|----------------|
| `PaymentGatewayConfig`, `ReferralConfig`, `WhatsAppConfig`, Xero Config (unnamed) | These are all single-document configuration stores. Consider a `PlatformConfig` collection with `{module: String, config: Object}` pattern, or keep separate but define a shared interface. Current approach is fine but adds 4+ collections for 4 documents. |

### 2.4 Shared Fields That Should Be Abstracted

| Shared Pattern | Models Using It | Recommendation |
|----------------|-----------------|----------------|
| Soft delete (`isDeleted`, `deletedAt`) | User, Order, Lead, VaultDocument | Create a Mongoose plugin `softDeletePlugin` that adds these fields, the default query filter `{isDeleted: {$ne: true}}`, and the soft-delete method. Ensures consistency. |
| Timestamps (`createdAt`, `updatedAt`) | All 38 models | Already using Mongoose `timestamps: true` (implied). Confirm consistency. |
| Auto-increment number (`XXX-Y-NNNN`) | Order, Lead, Payment, BroadcastCampaign, SupportTicket, TaxEstimateLog | Create a `Counter` collection and shared `autoIncrementPlugin`. If each model implements its own counter, race conditions are possible. No `Counter` model is listed in S27. |
| AuditLog fields (`createdBy`, `updatedBy`) | Scattered across models | Not consistently applied. Some models have `createdBy`, others don't. Should be a plugin. |

### 2.5 Index Strategy Completeness

The PRD defines indexes for some collections but not all. **Missing critical indexes:**

| # | Collection | Missing Index | Query Pattern | Impact |
|---|-----------|---------------|---------------|--------|
| IDX-01 | `orders` | `{processingBy: 1, status: 1}` | Staff dashboard: "my active orders" | Full collection scan for staff queries |
| IDX-02 | `orders` | `{financialYear: 1, status: 1}` | FY filtering + status (most common admin query) | Slow admin dashboard |
| IDX-03 | `leads` | `{assignedTo: 1, status: 1, nextActionDate: 1}` | Staff: "my leads with pending follow-ups" | Staff mobile companion slow |
| IDX-04 | `leads` | `{mobile: 1}` and `{email: 1}` | Duplicate detection (LM-INV-01) | Dedup check on every lead creation is a full scan |
| IDX-05 | `broadcastMessages` | `{campaignId: 1, status: 1}` | Campaign delivery stats | Aggregation on potentially millions of docs |
| IDX-06 | `chatMessages` | `{conversationId: 1, createdAt: -1}` | Message history pagination | Chat loading slow without this |
| IDX-07 | `payments` | `{orderId: 1, status: 1}` | "Payments for this order" and completion checks | Payment lookup per order is frequent |
| IDX-08 | `vaultDocuments` | `{userId: 1, financialYear: 1, category: 1}` | Vault browsing by year+category | Client portal browsing |
| IDX-09 | `supportTickets` | `{assignedTo: 1, status: 1, slaDeadline: 1}` | SLA cron: "tickets approaching SLA" | SLA engine every 5 min scanning all tickets |
| IDX-10 | `whatsappMessages` | `{contactId: 1, createdAt: -1}` | Conversation history | WhatsApp conversation view |
| IDX-11 | `leadActivities` | `{leadId: 1, createdAt: -1}` | Activity timeline | Lead detail page |
| IDX-12 | `taxEstimateLog` | Already defined (good) | -- | -- |
| IDX-13 | `webhookEvents` | `{eventId: 1}` unique (mentioned) + `{createdAt: -1}` for log viewing | Replay protection + admin log | Missing the createdAt index for log browsing |

### 2.6 Data Consistency Risks with BullMQ Async Flows

This is a **critical area**. The PRD relies heavily on BullMQ for async processing, but several flows mutate multiple collections without compensating transactions:

| # | Flow | Collections Mutated | Consistency Risk | Severity |
|---|------|--------------------|--------------------|----------|
| DC-01 | Order completion (ORD-INV-10) | Order (status), ReviewAssignment (schedule), Xero (invoice), Staff (counter), Notification | If Xero sync fails mid-flow: Order marked complete, invoice never created. No rollback. | Critical |
| DC-02 | Payment succeeded (PAY-INV-12) | Payment (status), Order (association), Xero (payment), Notification | If BullMQ worker crashes after Payment update but before Xero sync: payment recorded but never synced. | High |
| DC-03 | Lead conversion (LM-INV-04) | Lead (isConverted), User (create), Order (create) | Uses MongoDB transaction -- GOOD. But notification and Xero jobs dispatched after transaction. If they fail, no impact on consistency. | Low (well-designed) |
| DC-04 | Refund processing | Payment (refundedAmount, status), Xero (credit note), Notification | Partial failure: refund recorded in QEGOS but credit note not created in Xero. Reconciliation report (XRO-INV-09) would catch this, but latency could be hours. | High |
| DC-05 | Invoice adjustment (S9.7.3) | Order (lineItems), Xero (void old + create new) | "Atomic" void+recreate in Xero but Xero API calls are 2 separate HTTP requests. If first succeeds (void) but second fails (create): order has no invoice. | Critical |
| DC-06 | Broadcast sending | BroadcastCampaign (sentCount), BroadcastMessage (per-recipient) | Counters on campaign updated from worker. If worker crashes mid-batch: count mismatches message records. | Medium |
| DC-07 | Storage quota update (STR-INV-01) | VaultDocument (create), User.storageUsed ($inc) | S3 upload -> DB write -> $inc. If crash between DB write and $inc: quota drifts. Monthly reconciliation catches it, but drift accumulates. | Medium |

**Recommended mitigation pattern:** Implement an **outbox pattern** for critical cross-service operations. Write the intent (e.g., "sync this payment to Xero") to an outbox collection within the same MongoDB transaction as the primary write. A separate worker reads the outbox and processes reliably with retry.

---

## 3. API Design Consistency

### 3.1 Naming Convention Analysis

The PRD uses a mostly consistent REST naming convention. **Inconsistencies found:**

| # | Inconsistency | Examples | Recommendation |
|---|---------------|----------|----------------|
| API-01 | Mixed POST vs GET for queries | `POST /api/v1/audit-logs` (query), `GET /api/v1/leads` (query), `POST /api/v1/leads/search` (search), `POST /api/v1/analytics/clv` (query) | Standardize: GET for simple filters, POST only for complex query bodies. Currently inconsistent -- audit-logs uses POST for basic queries while leads uses GET. |
| API-02 | Mixed singular/plural in sub-resources | `/api/v1/payments/order/:orderId` (singular "order"), `/api/v1/leads/:id/activities` (plural), `/api/v1/leads/reminders/today` (no lead ID scope) | Standardize: always plural, always scoped. `/api/v1/orders/:orderId/payments` instead of `/api/v1/payments/order/:orderId`. |
| API-03 | Verb in URL | `POST /api/v1/documents/send-for-sign`, `POST /api/v1/documents/generate-uri`, `POST /api/v1/payments/write-off` | REST anti-pattern. Consider: `POST /api/v1/documents/:id/signatures` (create signing request), `POST /api/v1/documents/:id/signing-uri`. Minor but accumulates. |
| API-04 | Inconsistent action endpoints | `PATCH /api/v1/orders/:id/status` (PATCH for status), `PUT /api/v1/orders/:id/assign` (PUT for assign), `POST /api/v1/leads/:id/convert` (POST for convert) | These are all "actions" -- should consistently use POST for non-idempotent actions (convert) and PATCH for idempotent state changes (status, assign). Currently mixes PUT and PATCH for similar operations. |
| API-05 | Nested vs flat stats endpoints | `/api/v1/leads/stats/dashboard`, `/api/v1/leads/stats/pipeline`, `/api/v1/leads/stats/staff`, vs `/api/v1/orders/stats`, `/api/v1/orders/revenue` | Leads uses `/stats/sub-type` pattern; Orders has flat `/stats` and `/revenue`. Standardize to the `/stats/sub-type` pattern. |

### 3.2 Missing CRUD Operations

| # | Resource | Missing Operations | Business Need |
|---|----------|-------------------|---------------|
| CRUD-01 | BroadcastTemplate | No DELETE endpoint | Templates accumulate forever. Need soft-delete. |
| CRUD-02 | CannedResponse | No DELETE or UPDATE endpoints listed | Staff cannot edit or remove outdated canned responses. |
| CRUD-03 | TaxDeadline | No DELETE endpoint | Cannot remove accidentally created custom deadlines. |
| CRUD-04 | ConsentRecord | No direct CRUD APIs | Consent managed only through User.consentRecord and BroadcastOptOut. No way to query/audit all consent records for a contact directly. Privacy Act compliance requires this. |
| CRUD-05 | BillingDispute | No CRUD APIs defined at all | S9.7.4 defines the model but no endpoints. Disputes can only be created/managed through support tickets? Unclear workflow. |
| CRUD-06 | ReviewAssignment | No UPDATE endpoint for admin to reassign reviewer | If reviewer goes on leave, no way to reassign without internal DB manipulation. |
| CRUD-07 | Appointment | No standalone CRUD | Appointments embedded in Order. No way to create standalone appointments (e.g., initial consultation before order exists). |
| CRUD-08 | LeadReminder | No DELETE endpoint | Cannot cancel a follow-up reminder, only complete or snooze it. |
| CRUD-09 | VaultDocument | No restore endpoint for soft-deleted docs | CPV-INV-05 mentions "Admin can restore within grace period" but no API listed. |
| CRUD-10 | NotificationPreference | No admin view of all users' preferences | Admin cannot audit who has opted out of what. |

### 3.3 Scope-Filtering Coverage

The PRD defines scope filtering in RBAC (S2.5) but several endpoints lack explicit scope documentation:

| Endpoint Group | Scope Filtering Status | Gap |
|----------------|----------------------|-----|
| Orders (S7.3) | Explicitly documented per endpoint | Good |
| Leads (S12.7) | Explicitly documented | Good |
| Payments (S9.4) | Mostly documented | Missing: `/payments/logs` -- should staff see only their assigned orders' payment logs? |
| Chat (S15.4) | Documented | Good |
| Vault (S14.3) | Documented | Good |
| Tickets (S21.5) | Documented but incomplete | Client can only see own tickets; staff sees assigned. But what about office_manager? Should see all for their office? No office/branch concept exists. |
| WhatsApp (S16.3) | Partially documented | `/whatsapp/conversations/:contactId` says "Staff (assigned)" but assigned to what? The lead? The order? WhatsApp contacts may not have leads. |
| Analytics (S20.2) | Admin+ only | Correct -- analytics is admin-only. But staff_benchmark data about individual staff should require their consent or management approval under APP 3. |
| Broadcasts (S13.3) | Admin+ and Office Manager | No staff access. Correct for campaigns. But should senior_staff see campaign results for leads they manage? |

### 3.4 Missing Endpoints (Based on Business Logic)

| # | Missing Endpoint | Rationale | Priority |
|---|-----------------|-----------|----------|
| EP-01 | `GET /api/v1/orders/:id/timeline` | Order has 9 states, many actors. Need a chronological timeline of all state changes, assignments, payments, reviews -- currently must aggregate from AuditLog manually. | High |
| EP-02 | `POST /api/v1/users/:id/anonymize` | Privacy Act 1988 APP 11 right to erasure. Soft-delete is not enough -- need to anonymize PII while preserving financial records for ATO 7-year retention. | Critical |
| EP-03 | `GET /api/v1/users/:id/data-export` | Privacy Act 1988 APP 12 -- right of access. Client should be able to export all their data. | Critical |
| EP-04 | `POST /api/v1/orders/:id/duplicate` | Tax agents file for same clients yearly. "Copy last year's order as starting point" is a core workflow. | High |
| EP-05 | `GET /api/v1/staff/:id/calendar` | Staff need to see their appointments, assigned orders, follow-ups in one calendar view. No unified staff calendar endpoint. | Medium |
| EP-06 | `POST /api/v1/vault/ocr-trigger` | Vault has OCR fields (ocrExtracted, ocrStatus) but no endpoint to trigger OCR. Is it auto-triggered on upload? Not specified. | Medium |
| EP-07 | `GET /api/v1/orders/unassigned` | Admin needs quick view of orders awaiting assignment. Currently must filter `/orders?status=2` (Documents Received, pre-assignment). | Low |
| EP-08 | `POST /api/v1/tickets/from-chat/:conversationId` | S21.7 mentions "Convert to Ticket" from chat but no API endpoint is defined. | Medium |
| EP-09 | `POST /api/v1/tickets/from-whatsapp/:messageId` | S21.7 mentions "Create Ticket" from WhatsApp but no API endpoint. | Medium |
| EP-10 | `GET /api/v1/payments/outstanding` | "Outstanding receivables" mentioned in analytics but no direct endpoint for admin to see all unpaid invoices. | Medium |

---

## 4. Invariant Coverage Gaps

### 4.1 Missing Invariants by Module

The PRD documents 163 invariants. The following business rules are implied by the design but lack explicit invariant protection:

#### Order State Machine Gaps

| # | Missing Invariant | Risk | Recommended ID |
|---|------------------|------|----------------|
| INV-01 | **Concurrent status transitions**: Two staff members simultaneously transitioning an order (e.g., one cancels while another completes). No optimistic locking or version field on Order. | Race condition: both succeed, last write wins. Order could be "Completed" then silently overwritten to "Cancelled" without the completion side-effects being rolled back. | ORD-INV-11 |
| INV-02 | **Backward transition side-effects**: When order goes from Completed (6) back to... wait, transition table shows 6 can go to 7 or 9. But 5->4 (Review to In Progress via changes_requested) -- should this void the Xero invoice created at status 4? No invariant covers Xero state on backward transitions. | Xero invoice exists but order is back in progress. Staff may modify line items, creating a mismatch. | ORD-INV-12 |
| INV-03 | **Order deletion with active payments**: Soft-deleting an order that has pending/authorized payments. No invariant prevents this. | Orphaned payments in gateway. | ORD-INV-13 |

#### Payment State Machine Gaps

| # | Missing Invariant | Risk | Recommended ID |
|---|------------------|------|----------------|
| INV-04 | **Refund after Xero sync**: Refund triggers credit note (via BullMQ), but what if Xero is disconnected? No invariant requires Xero credit note before marking refund as complete. The refund succeeds in gateway but Xero is out of sync. | Financial record mismatch. Caught by reconciliation, but reconciliation is manual trigger. | PAY-INV-14 |
| INV-05 | **Disputed payment cannot be refunded**: No invariant prevents refunding a payment that is under active billing dispute. Could refund while dispute investigation is ongoing. | Double resolution: dispute resolved as "full_refund" but payment already refunded. | PAY-INV-15 |
| INV-06 | **Payment amount vs Order finalAmount**: No invariant validates that payment.amount matches order.finalAmount. Client could pay $50 on a $165 order. Partial payments are not explicitly supported or rejected. | Underpayment goes undetected. | PAY-INV-16 |

#### Lead State Machine Gaps

| # | Missing Invariant | Risk | Recommended ID |
|---|------------------|------|----------------|
| INV-07 | **Lead conversion without assignment**: Lead.assignedTo could be null when converting (source: web_form, auto-created). Conversion creates Order -- who is processingBy? | Orphaned order with no assigned staff. | LM-INV-13 |
| INV-08 | **Concurrent duplicate lead creation**: Two staff members create lead for same mobile simultaneously. LM-INV-01 checks duplicates but does not block. Two identical leads created. | Duplicate data, wasted effort. The dedup is advisory-only by design, but there should be at least a unique index warning. | LM-INV-14 |

#### Tax Engine Gaps

| # | Missing Invariant | Risk | Recommended ID |
|---|------------------|------|----------------|
| INV-09 | **Tax estimate for non-existent FY**: No invariant checks that an active taxRuleConfig exists for the requested financialYear before calculating. If no rules exist for FY2025-26, what happens? | Crash or wrong calculation. Should return clear error: "Tax rules not yet configured for FY2025-26." | TAX-INV-13 |
| INV-10 | **TaxReturnResult without approved ReviewAssignment**: RVW-INV-01 blocks status 5->6 without review, and RVW-INV-07 blocks 6->7 without both review and locked result. But can staff create a TaxReturnResult for an order that hasn't reached status 5 yet? No invariant on TaxReturnResult creation requiring minimum order status. | Results entered prematurely before review pipeline. | TXR-INV-06 |

#### Ticket State Machine Gaps

| # | Missing Invariant | Risk | Recommended ID |
|---|------------------|------|----------------|
| INV-11 | **Ticket resolution without all messages read**: Staff resolves ticket without reading client's latest message. No invariant requires acknowledgment. | Client feels ignored. Satisfaction score suffers. | TKT-INV-08 |
| INV-12 | **SLA pause during waiting_on_client**: SLA clock should pause when status is `waiting_on_client` or `waiting_on_ato`. PRD mentions SLA calculation from priority + business hours but does not specify clock pausing. | SLA breached because client took 5 days to respond, penalizing staff. | TKT-INV-09 |

#### Cross-Module Invariant Gaps

| # | Missing Cross-Module Invariant | Modules | Risk |
|---|-------------------------------|---------|------|
| INV-13 | **Referral reward blocked by active billing dispute**: If referee has an open billing dispute on their order, referrer's reward should not trigger. | Referrals + BillingDisputes | Revenue leakage |
| INV-14 | **Order cannot be completed if payment is disputed**: If the payment associated with an order is in `disputed` status, order should not transition to Completed (6). | Orders + Payments | Process integrity |
| INV-15 | **Broadcast cannot target deleted leads**: BRC-INV-06 recalculates audience at send time, but does it exclude soft-deleted leads? No explicit invariant. | Broadcast + Leads | Sending to "deleted" contacts |
| INV-16 | **Chat message after order cancelled**: Client sends chat message on a cancelled order. Should conversation auto-reopen? Convert to ticket? No defined behavior. | Chat + Orders | UX gap |
| INV-17 | **Staff deactivation cascade**: When staff status is toggled inactive (S22.1), what happens to their assigned leads, orders, and open tickets? No cascade invariant. | Staff + Leads + Orders + Tickets | Orphaned work items |

### 4.2 Race Condition Scenarios Not Addressed

| # | Scenario | Affected Invariants | Recommended Mitigation |
|---|----------|--------------------|-----------------------|
| RC-01 | Two BullMQ workers pick up the same Xero sync job | XRO-INV-04 (idempotent check) partially covers this | Add Redis distributed lock per orderId before Xero API call |
| RC-02 | Client submits payment while admin cancels order simultaneously | ORD-INV-08 (cancel cascades) vs PAY-INV-07 (payment flow) | Check order status before payment capture. Add optimistic locking. |
| RC-03 | Two admins activate different tax rule drafts for same FY simultaneously | VER-INV-04 says "MongoDB transaction" but two transactions could serialize incorrectly | Use findOneAndUpdate with conditional: `{financialYear, status: "active"}` to atomically swap |
| RC-04 | Bulk assign leads while auto-assign cron runs simultaneously | LM-INV-07 (round-robin) | Distributed lock on assignment operation per staff member |
| RC-05 | User uploads file at exactly storage quota boundary from two devices | STR-INV-01 ($inc atomic) -- but quota check is non-atomic read-then-write | Use findOneAndUpdate: `{storageUsed: {$lte: quota - fileSize}}` and `{$inc: {storageUsed: fileSize}}` atomically |

---

## 5. Phase Sequencing Analysis

### 5.1 Phase Dependency Graph

```
Phase 0 (Foundation) ──┬──> Phase 1 (Payment) ──> Phase 2 (Xero) ──┐
                       │                                             │
                       └──> Phase 3 (Lead & Order) ─────────────────┘
                                      │
                            ┌─────────┼─────────┐
                            v         v         v
                     Phase 4      Phase 5    Phase 6
                    (Tax+Lead)  (Broadcast) (Portal)
                        │          │           │
                        └────┬─────┘           │
                             v                 v
                          Phase 7         Phase 8
                        (Comms Suite)   (Engagement)
                             │              │
                             └──────┬───────┘
                                    v
                                Phase 9
                              (Analytics)
                                    │
                                    v
                                Phase 10
                               (Polish)
```

### 5.2 Hidden Dependencies Between Phases

| # | Dependency | From Phase | To Phase | Risk |
|---|-----------|------------|----------|------|
| PD-01 | Broadcast consent tracking (S13.2 ConsentRecord) is needed at user signup (Phase 0/3) | Phase 5 | Phase 0 | Consent not captured at signup means Phase 5 has no consent records to check. Must capture consent from day 1. |
| PD-02 | Tax Calendar seed data (Phase 8) is needed for deadline reminders that should work as soon as clients exist (Phase 3) | Phase 8 | Phase 3 | Clients created in Phase 3 get no deadline awareness until Phase 8 (~35 weeks later). |
| PD-03 | Document Vault (Phase 6) is needed for Order processing (Phase 3) -- staff need document uploads to prepare returns | Phase 6 | Phase 3 | Phase 3 orders cannot collect documents through the platform. Must use email/manual upload outside system. |
| PD-04 | OCR capability (Phase 6, vault) feeds into Tax Estimate pre-fill (Phase 4) | Phase 6 | Phase 4 | Tax estimates in Phase 4 cannot leverage OCR data. Minor -- manual input still works. |
| PD-05 | Analytics read replica (Phase 9, NFR-01) should be set up in Phase 0 | Phase 9 | Phase 0 | Analytics queries hitting primary DB for 9 phases. Performance risk during tax season. |
| PD-06 | Circuit breakers (Phase 10, NFR-25) should protect Stripe/Xero from Phase 1/2 | Phase 10 | Phase 1-2 | Production payments and Xero sync running without circuit breakers for ~40 weeks. |

### 5.3 Parallelization Opportunities

| Phases | Can Parallelize? | Reasoning |
|--------|-----------------|-----------|
| Phase 1 + Phase 3 | Partially | Payment hardening (BE) can run parallel to Lead CRUD (FE+BE). Payment team works on gateway abstraction while Lead team builds lead management. Merge at: order-payment integration. |
| Phase 4 + Phase 5 | Yes | Tax Engine and Broadcast Engine are independent. Different teams can work simultaneously. |
| Phase 6 + Phase 7 | Partially | Client Portal (FE-heavy) and Communication Suite (BE-heavy) have different primary skill needs. Chat backend and vault frontend can proceed in parallel. |
| Phase 8 + Phase 9 | Yes | Calendar/Reviews/Referrals are independent from Analytics dashboard. |

**Potential timeline savings with parallelization:** ~8-12 weeks (from 51-55 weeks down to ~40-45 weeks with a team of 6).

### 5.4 Missing Phases/Capabilities

| # | Missing Capability | Where It Should Slot | Rationale |
|---|-------------------|---------------------|-----------|
| MP-01 | **Data Migration Phase** | Between Phase 0 and Phase 1 | If migrating from existing systems (spreadsheets, other software), a migration tooling phase is needed. PRD mentions no migration strategy. |
| MP-02 | **Mobile App MVP** | Phase 3 (parallel) | Mobile app is listed in S1.1 but the roadmap phases don't explicitly call out mobile app development milestones. When does the React Native app get built? |
| MP-03 | **Disaster Recovery Testing** | Phase 10 | NFR-14 mentions backups but no DR testing phase. First real test will be in production. |
| MP-04 | **User Acceptance Testing (UAT) with Tax Agents** | After Phase 3 (MVP) | Tax agents have specific workflows. A UAT phase with real practitioners before scaling is critical. |
| MP-05 | **Compliance Audit Phase** | Pre-launch | Privacy Act 1988, Spam Act 2003, TPB requirements -- need a formal compliance review before going live. |

### 5.5 MVP Scope Validation (Phases 0-3)

**MVP Delivers:**
- RBAC + Auth + Audit Trail
- Payment processing (Stripe + Payzoo)
- Xero integration (invoicing + payment sync)
- Lead management with full lifecycle
- Order management with review pipeline
- Staff mobile lead companion

**MVP Does NOT Deliver:**
- Client-facing portal or mobile app (clients cannot log in)
- Document vault (documents managed outside system)
- Tax estimation (no calculator for sales engagement)
- Broadcast/marketing (no campaigns)
- Chat or WhatsApp (no real-time communication)
- Support tickets (no structured issue tracking)
- Analytics dashboard (no data-driven insights)

**Verdict:** The MVP is **operationally viable** for a tax agent office that already has clients and manages them primarily through staff interaction. It is NOT viable as a self-service client platform. The value proposition shifts from "platform for clients" to "internal CRM for tax agents." This is acceptable for initial validation but should be communicated clearly to stakeholders.

**Critical MVP Gap:** No tax estimation calculator means the primary sales tool (showing potential refund amount to convert leads) is unavailable until Phase 4. This is a significant conversion bottleneck for 4+ months post-MVP launch.

---

## 6. Scalability & Architecture Gaps

### 6.1 Single Points of Failure

| # | SPOF | Component | Impact | Mitigation |
|---|------|-----------|--------|------------|
| SPOF-01 | Redis Cluster | Session store, rate limiting, Socket.io adapter, BullMQ, notification dedup, permission cache, Xero token mutex, analytics cache | **Total platform outage** -- authentication fails, rate limiting fails, jobs stop, chat breaks | PRD specifies ElastiCache but no multi-AZ configuration or failover strategy mentioned. Need Redis Cluster with automatic failover. |
| SPOF-02 | BullMQ Workers | Single worker instance per queue type | Queue backlog grows. Xero syncs, broadcasts, SLA checks all halt. | PRD mentions no worker scaling strategy. Need auto-scaling worker fleet or at minimum 2 workers per queue with leader election. |
| SPOF-03 | ClamAV Instance | Virus scanning for all uploads | All file uploads blocked. Orders stall at document collection phase. | No HA strategy for ClamAV. Consider SaaS alternative (e.g., AWS GuardDuty for S3) or ClamAV cluster. |
| SPOF-04 | Gmail SMTP | Transactional email (OTP, password reset) | Users cannot log in (OTP blocked), cannot reset passwords. | Single Gmail account is a critical SPOF. Should use SES for transactional email too, or have SES as fallback for Gmail. Gmail rate limits (500/day) could be exceeded during tax season. |

### 6.2 BullMQ Queue Bottleneck Analysis

The PRD defines at least 15 distinct BullMQ job types:

| Queue | Frequency | Volume Risk | Bottleneck Risk |
|-------|-----------|-------------|-----------------|
| Xero sync (invoice/payment/credit note) | Per order/payment event | Moderate (hundreds/day) | Medium -- 60 calls/min Xero limit is the real bottleneck |
| Broadcast SMS | Batch every 5 min | High (10K+ per campaign) | High -- 10 msg/sec = 2,500 per 5-min batch cap |
| Broadcast Email | Batch every 5 min | Very High (50K+ per campaign) | Medium -- 100/sec = 30K per 5-min window |
| Broadcast WhatsApp | Batch every 5 min | Moderate | Medium -- 80 msg/sec limit |
| SLA check | Every 5 min | Low (scan all open tickets) | Low -- unless ticket count exceeds thousands |
| Review request scheduling | Per completed order | Low (delayed 24hr) | Low |
| Anomaly detection | Hourly | Low | Low |
| Analytics computation | Every 5 min | Low (single aggregation) | Low -- but query could be expensive on large datasets |
| Media download (WhatsApp) | Per inbound media | Moderate | Medium -- must download within 30 min (WHA-INV-01) |
| SES bounce processing | Continuous (SNS) | Moderate during campaigns | Medium -- must process quickly to prevent further sends to bounced addresses |
| Campaign scheduled trigger | Every 1 min | Low | Low |
| Notification quiet hours | Per deferred notification | Low-Medium | Low |
| Overdue reminder marker | Cron schedule | Low | Low |
| Storage reconciliation | Monthly | Low | Low |
| Audit log archival | Monthly | Low (batch) | Low -- but archive job could be very large |

**Key concern:** All queues share a single Redis instance. A large broadcast campaign (50K emails) could saturate Redis and slow down payment webhook processing. **Recommendation:** Use separate Redis instances or at minimum separate BullMQ connections for critical (payments, webhooks) vs bulk (broadcasts) queues.

### 6.3 Redis Dependency Concentration

Redis serves **9 distinct purposes** in this architecture:

1. Session store (JWT refresh tokens)
2. Rate limiting (express-rate-limit)
3. Socket.io adapter (real-time)
4. BullMQ backing store (all async jobs)
5. Notification deduplication
6. Permission cache (5-min TTL)
7. Xero token mutex (Redlock)
8. Analytics cache (5-min TTL)
9. Idempotency key storage (24hr TTL)

**Risk:** A Redis outage or memory pressure event cascades to **every module**. The PRD does not specify:
- Redis memory limits or eviction policy
- Key namespace separation (all 9 uses in same keyspace?)
- Monitoring alerts for Redis memory/CPU
- Fallback behavior for any of these when Redis is unavailable

**Recommendation:** At minimum: (a) Use separate logical databases (Redis SELECT) for different purposes; (b) Define eviction policy as `volatile-lru` to protect persistent data while evicting cache; (c) Set up CloudWatch alarms for memory > 80%; (d) Document graceful degradation (e.g., if cache unavailable, fall back to MongoDB for permissions).

### 6.4 MongoDB Sharding Strategy (Missing)

**This is entirely absent from the PRD.** Collections that will grow unboundedly:

| Collection | Growth Pattern | Estimated 3-Year Size | Shard Key Recommendation |
|-----------|----------------|----------------------|------------------------|
| auditLogs | Every mutation across all modules | 10M+ documents (at ATO 7-year retention) | `{timestamp: "hashed"}` -- time-based queries are primary |
| broadcastMessages | Per-recipient per campaign | 5M+ (1K campaigns x 5K recipients avg) | `{campaignId: "hashed"}` |
| chatMessages | Per message | 1M+ (500 clients x 50 messages/year x 4 years) | `{conversationId: "hashed"}` |
| leadActivities | Per interaction | 2M+ (10K leads x 20 activities avg x 10 years) | `{leadId: "hashed"}` |
| whatsappMessages | Per message | 500K+ | `{contactId: "hashed"}` |
| taxEstimateLog | Per estimate | 500K+ (with 12-month TTL, manageable) | Not needed if TTL enforced |
| webhookEvents | Per webhook | 1M+ (aggressive, depends on payment volume) | `{createdAt: "hashed"}` |
| notifications | Per notification per user | 2M+ | `{recipientId: "hashed"}` |

**Critical gap:** Without sharding or archival strategy (beyond auditLogs), MongoDB Atlas M30 will hit storage limits. **Recommendation:** Implement time-based collection archival for chatMessages, notifications, and leadActivities (archive to S3 after 24 months, similar to auditLog archival in RBAC-INV-10).

### 6.5 Rate Limiting Gaps

| # | Missing Rate Limit | Endpoint/Flow | Risk |
|---|-------------------|---------------|------|
| RL-01 | No rate limit on `/api/v1/tax/estimate` | Compute-intensive calculation | CPU exhaustion via rapid estimate requests |
| RL-02 | No rate limit on `/api/v1/vault/documents/:id` (presigned URL generation) | S3 presigned URL generation | S3 cost attack -- generate thousands of presigned URLs |
| RL-03 | No rate limit on `/api/v1/chat/messages` | Message sending | Spam flooding a conversation |
| RL-04 | No global rate limit on admin API calls | Admin endpoints | Compromised admin account can exfiltrate data at full speed |
| RL-05 | No rate limit on `/api/v1/leads/search` or `/api/v1/chat/search` | Full-text search | Expensive queries, potential DoS |
| RL-06 | No rate limit on webhook endpoints beyond signature verification | `/webhooks/stripe`, `/webhooks/payzoo`, `/webhooks/whatsapp` | Webhook flood from compromised or misconfigured source |

### 6.6 Circuit Breaker Coverage

NFR-25 mentions circuit breakers for 6 external services but provides no specification:

| Service | Circuit Breaker Needed | Open Threshold | Half-Open Strategy | Fallback |
|---------|----------------------|----------------|-------------------|----------|
| Stripe | Yes | 5 failures in 1 min | 1 test call after 30 sec | Payzoo (if enabled) |
| Payzoo | Yes | 5 failures in 1 min | 1 test call after 30 sec | Stripe (if enabled) |
| Xero | Yes | 5 failures in 1 min | 1 test call after 30 sec | Queue offline (XRO-INV-10) |
| Twilio (SMS) | Yes | 5 failures in 1 min | 1 test call after 60 sec | Email fallback |
| Amazon SES | Yes | 5 failures in 1 min | 1 test call after 60 sec | Queue + Slack alert |
| Meta Cloud API | Yes | 5 failures in 1 min | 1 test call after 60 sec | Template message downgrade |
| Zoho Sign / DocuSign | **Not mentioned in NFR-25** | 3 failures in 5 min | 1 test call after 60 sec | Manual signing workflow |
| ClamAV | **Not mentioned** | 3 failures in 1 min | Immediate retry | Quarantine file, scan later |
| Gmail SMTP | **Not mentioned** | 3 failures in 1 min | 1 test call after 60 sec | SES fallback |

---

## 7. Business Logic Gaps

### 7.1 Missing Business Workflows

| # | Missing Workflow | Business Impact | Severity |
|---|-----------------|-----------------|----------|
| BW-01 | **Client re-engagement for new FY**: No automated workflow for when a new financial year starts (1 July). Existing clients should be prompted to start their new FY return. Churn Risk widget exists in analytics (S20.1) but no automated action. | Clients drift to competitors. Manual outreach required. | High |
| BW-02 | **Overdue payment follow-up**: No automated reminders for unpaid invoices. Payment created but client never completes checkout. No drip sequence: 24hr, 3-day, 7-day. | Revenue leakage -- orders completed but never paid. | Critical |
| BW-03 | **Staff handoff workflow**: When a staff member leaves or goes on extended leave, no formal handoff process for their assigned leads, orders, and conversations. | Orphaned work, client experience degrades. | High |
| BW-04 | **Bulk order creation for returning clients**: Tax agents file for hundreds of returning clients each FY. No bulk "roll forward" to create new FY orders from previous year's client list. | Manual order creation per client -- days of admin work. | High |
| BW-05 | **Client document checklist**: No configurable "documents needed" checklist per service type. Staff manually track which documents are outstanding. | Delays in order processing. Repeated client communication about missing docs. | Medium |
| BW-06 | **Engagement letter workflow**: S7.7 Review Checklist item 10 mentions "Client engagement letter signed" but no workflow for creating, sending, and tracking engagement letters is defined. | TPB compliance gap -- engagement letters are legally required before commencing work. | Critical |
| BW-07 | **Multi-year order view**: Client with 5 years of filing history has no consolidated timeline view. Each year is a separate order. | Staff lack historical context when preparing returns. | Medium |
| BW-08 | **Appointment no-show re-engagement**: APT-INV-03 auto-marks no-show and sends re-scheduling prompt, but no follow-up sequence if client ignores the prompt. | Lost appointments = lost revenue. | Medium |

### 7.2 Incomplete Automation Rules

| # | Automation Gap | Current State | Recommended |
|---|---------------|---------------|-------------|
| AR-01 | Lead auto-assignment considers only lead count (LM-INV-07) | Does not consider: staff specialization (BAS vs individual), language match (client preferredLanguage vs staff language), order workload | Weight-based assignment: lead count (40%) + order count (30%) + language match (20%) + specialization (10%) |
| AR-02 | Review request sent 24hr after completion (ORD-INV-10) | No consideration of time of day | Should respect quiet hours. A 2 AM review request is poor UX. |
| AR-03 | Auto-dormant at 14 days (S12.8) | No distinction between high-value and low-value leads | A $5,000 business client lead should have a longer runway (30 days) than a $99 simple return lead (14 days). |
| AR-04 | SLA auto-escalation (S21.4) | Static priority thresholds | Should consider: client CLV (VIP clients get faster SLA), tax season (shorter SLAs during Jul-Oct), order value. |

### 7.3 Australian Tax Compliance Edge Cases

| # | Edge Case | Gap | Risk |
|---|-----------|-----|------|
| TC-01 | **Tax Agent Lodgement Program**: Tax agents get extended deadlines beyond 31 October. These vary by agent and are allocated by ATO. PRD mentions "varies" (S17.2) but no mechanism to configure per-agent lodgement schedule. | Incorrect deadline reminders to clients. | High |
| TC-02 | **Working Holiday Maker (WHM) tax**: S8.4 includes WHM brackets but the order model has no field to indicate WHM status (417/462 visa). How does staff indicate this? | Tax estimate uses wrong brackets for WHMs. | Medium |
| TC-03 | **Part-year resident**: Person who migrated to/from Australia mid-FY has split residency. Tax calculation treats entire year as one residency status. | Incorrect tax estimate for migrants. | Medium |
| TC-04 | **Medicare Levy Exemption**: Certain categories (e.g., blind pensioners, defence force specific cases, exempt foreign income) qualify for full ML exemption. Only threshold-based exemption is modeled. | Overestimates tax for exempt individuals. | Low (estimate only) |
| TC-05 | **Spouse details for MLS**: Medicare Levy Surcharge calculation requires spouse's income (S8.5 step 7 references threshold tiers). But the Order model's spouse object has no income field. | Cannot calculate MLS accurately for couples. | Medium |
| TC-06 | **Trust distributions**: No support for trust income distributions in the tax estimate calculator inputs. Common for Australian investors. | Missing income type leads to inaccurate estimates. | Medium |
| TC-07 | **Deceased estates**: No workflow for filing a return for a deceased person. This requires special lodgement rules and a different ATO process. | Tax agent must handle entirely outside platform. | Low (edge case) |

### 7.4 Revenue Leakage Points

| # | Leakage Point | Description | Estimated Annual Impact |
|---|--------------|-------------|----------------------|
| RL-01 | **No payment follow-up automation** (BW-02) | Orders completed, invoices created in Xero, but no automated payment reminder sequence. | 5-15% of revenue if 10-20% of clients don't pay promptly |
| RL-02 | **Referral reward without revenue verification** | REF-INV-01 checks payment succeeded but not that the payment fully covers finalAmount. Partial payment triggers reward. | Small but systemic if partial payments are common |
| RL-03 | **Discount stacking** | User.discount (percentage) + referral discount + promotional credits. No invariant caps total discount or prevents stacking. Order could theoretically have 100%+ discount. | Potentially large on individual orders |
| RL-04 | **Write-off too easy/too hard** | BIL-INV-05 requires 90 days + 2 contact attempts + admin approval. But no automated tracking of contact attempts for outstanding invoices. Admin must manually verify. | Write-offs either delayed (hurts cash flow reporting) or premature |
| RL-05 | **No late payment fee** | Common in professional services. No mechanism to apply late payment surcharge after X days. | Lost time-value of money |

### 7.5 Client Retention Gaps

| # | Gap | Description | Impact |
|---|-----|-------------|--------|
| CR-01 | **No loyalty/tenure recognition** | A client who has filed for 5 consecutive years gets the same experience as a first-timer. No tenure-based benefits. | Churn risk for long-term clients who feel unappreciated |
| CR-02 | **No proactive communication** | Between filing periods (Nov-Jun), there is zero scheduled client touchpoint. The platform goes silent for 7 months. | Clients forget about QEGOS, consider alternatives |
| CR-03 | **No year-round value proposition** | The vault and tax summaries provide some value, but no financial tips, tax-saving suggestions, or mid-year planning tools. | "Tax filing only" positioning vs "year-round financial partner" |
| CR-04 | **No family/household grouping** | Married couples, families with dependants -- each is a separate user/order. No household view. | Fragmented experience for families who want coordinated filing |

---

## 8. Security Gaps

### 8.1 OWASP Top 10 (2021) Coverage Analysis

| # | OWASP Category | Coverage in PRD | Gap |
|---|---------------|-----------------|-----|
| A01 | Broken Access Control | Strong. RBAC with scope filtering (S2), invariants RBAC-INV-01 through RBAC-INV-12. | Missing: No IDOR testing strategy. Scope filtering depends on handlers applying `req.scopeFilter` -- a single missed handler breaks the model. Need integration tests that verify scope filtering on EVERY endpoint. |
| A02 | Cryptographic Failures | Good. AES-256-GCM for TFN (SEC-INV-09), encrypted Xero tokens (XRO-INV-01), bcrypt for passwords (SEC-INV-07). | Missing: (a) No key rotation strategy for AES-256-GCM encryption key. If key is compromised, all TFNs exposed. (b) No HSM or KMS mentioned -- encryption keys stored how? (c) Chat contentOriginal encrypted but key management not specified. |
| A03 | Injection | Good. Express-validator on all endpoints (SEC-INV-12), parameterized Mongoose queries (SEC-INV-14). | Missing: No mention of sanitization for NoSQL-specific injection (`$gt`, `$where`). Mongoose helps but `req.query` params used in filters could still inject operators if not sanitized. Need `mongo-sanitize` or equivalent. |
| A04 | Insecure Design | Generally good architecture. | Missing: No threat modeling document referenced. No abuse case analysis (e.g., what if a client creates 1000 tax estimates to probe tax brackets?). |
| A05 | Security Misconfiguration | Helmet.js (SEC-INV-10), CORS whitelist (SEC-INV-11). | Missing: (a) No mention of disabling debug endpoints in production (Swagger UI is "admin only" but should be disabled entirely in prod). (b) No mention of MongoDB authentication beyond Atlas (connection string security). (c) No environment variable management strategy (Vault, AWS Secrets Manager?). |
| A06 | Vulnerable Components | No mention | **Critical gap:** No dependency scanning strategy (npm audit, Snyk, Dependabot). No mention of keeping dependencies updated. React 17 and React Native 0.71 are already outdated. |
| A07 | Identification & Auth | Strong. JWT rotation (SEC-INV-04), account lockout (SEC-INV-02), MFA support. | Missing: (a) MFA is defined in user model (mfaEnabled, mfaSecret) but NO MFA enrollment/verification endpoints exist in S3.3. (b) No MFA requirement for admin/staff (should be mandatory). (c) No session management for concurrent admin logins from different geolocations. |
| A08 | Software & Data Integrity | Webhook signature verification (PAY-INV-04, PAY-INV-05, WHA-INV-08). | Missing: (a) No integrity check on S3 files (checksums verified on download?). (b) No code signing or deployment integrity verification. |
| A09 | Security Logging & Monitoring | AuditLog with severity levels (S2.4), 7-year retention, Slack alerts. | Missing: (a) No security event correlation (multiple failed logins from same IP across different accounts = credential stuffing). (b) No WAF mentioned. (c) No intrusion detection system (IDS). |
| A10 | SSRF | Not addressed | **Gap:** WhatsApp media download (WHA-INV-01) downloads from Meta CDN URL. If URL is tampered with in transit, could be redirected to internal network. Need URL validation and restrict to known Meta CDN domains. |

### 8.2 Missing Security Invariants

| # | Missing Invariant | Category | Severity |
|---|------------------|----------|----------|
| SI-01 | **MFA mandatory for admin and super_admin roles** | A07: Auth | Critical |
| SI-02 | **Encryption key rotation schedule** (AES-256-GCM for TFN, Xero tokens, chat) | A02: Crypto | High |
| SI-03 | **Dependency vulnerability scanning in CI/CD** | A06: Components | High |
| SI-04 | **Admin session geolocation anomaly detection** (login from Australia then immediately from another country) | A07: Auth | Medium |
| SI-05 | **API request body size limits** (beyond file uploads) | A04: Design | Medium |
| SI-06 | **Brute-force protection on referral code validation** (`GET /referrals/validate/:code` is public) | A07: Auth | Medium |
| SI-07 | **URL validation on WhatsApp media download** (restrict to Meta CDN domains) | A10: SSRF | Medium |
| SI-08 | **NoSQL injection sanitization** (mongo-sanitize on query parameters) | A03: Injection | High |

### 8.3 Privacy Act 1988 / Australian Privacy Principles (APPs) Gaps

| APP | Requirement | PRD Coverage | Gap |
|-----|-------------|-------------|-----|
| APP 1 | Open and transparent management of personal information | Privacy policy not mentioned | No privacy policy endpoint or content. Required by law. |
| APP 3 | Collection of solicited personal information | Mostly covered by explicit form fields | Lead bulk import (LM-INV-08) requires consent column -- good. But no mechanism to verify consent was actually given. |
| APP 5 | Notification of collection | Not mentioned | Users must be notified why their data is collected at collection time. No collection notices specified for signup, lead capture, or tax filing. |
| APP 6 | Use or disclosure of personal information | Covered implicitly by RBAC scope | Staff accessing client vault creates audit log (DOC-INV-06, severity=warning) -- good. But no explicit purpose limitation on data use. |
| APP 8 | Cross-border disclosure | Not addressed | If any data transits to non-Australian servers (e.g., Stripe in US, Meta in US), disclosure to overseas recipients must be managed. PRD specifies ap-southeast-2 for MongoDB and S3 -- good. But Stripe, Twilio, Meta are US companies. |
| APP 11 | Security of personal information | Well covered (encryption, access control) | Destruction requirement: "take reasonable steps to destroy or de-identify personal information... no longer needed." Soft-delete pattern preserves PII indefinitely. No anonymization workflow. **Critical.** |
| APP 12 | Access to personal information | No data export endpoint | Clients must be able to request all personal information held about them. No `GET /users/me/data-export` endpoint. **Critical.** |
| APP 13 | Correction of personal information | Users can update profile (S6.2) | Adequate for self-service. But no mechanism for formal correction requests on data the client cannot self-edit (e.g., financial records). |

### 8.4 Third-Party Integration Security Gaps

| Integration | Gap | Risk |
|-------------|-----|------|
| Zoho Sign / DocuSign | OAuth tokens mentioned but no encryption requirement specified (unlike Xero tokens which have explicit AES-256-GCM) | Token exposure in database |
| Twilio | Account SID + Auth Token storage not specified as encrypted | Credential exposure |
| Amazon SES | IAM credentials management not specified | Over-privileged IAM role could send email as any sender |
| Meta Cloud API | System User Token encrypted (S16.1) -- good | Webhook Verify Token should also be encrypted at rest |
| Slack Webhooks | Webhook URLs are secrets -- storage not specified as encrypted | Compromise allows impersonation of QEGOS alerts |
| Firebase | Service Account JSON storage not specified | Full project access if exposed |

---

## 9. Modular Decomposition Recommendations

### 9.1 Microservice vs Monolith Module Decision

Given the team size (3 BE + 2 FE + 1 QA = 6 people) and the product stage (pre-launch), a **modular monolith** is the correct starting architecture. Microservices would introduce network complexity, deployment overhead, and distributed transaction challenges that a 6-person team cannot manage effectively.

**Recommended architecture: Modular Monolith with Event Bus**

```
┌─────────────────────────────────────────────────────┐
│                   API Gateway                        │
│    (Express, RBAC middleware, rate limiting)         │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │   Auth   │ │  Orders  │ │ Payments │ │  Leads  │ │
│  │  Module  │ │  Module  │ │  Module  │ │ Module  │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │   Tax    │ │   Xero   │ │Broadcast │ │  Chat   │ │
│  │  Engine  │ │  Module  │ │  Module  │ │ Module  │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  Vault   │ │ Tickets  │ │ WhatsApp │ │Analytics│ │
│  │  Module  │ │  Module  │ │  Module  │ │ Module  │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│                                                       │
│  ─────────── Shared Services Layer ──────────────── │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │Notification│ │  Audit  │ │  File    │ │  Cache  │ │
│  │  Service  │ │ Service  │ │ Service  │ │ Service │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│                                                       │
│  ─────────── Event Bus (BullMQ) ────────────────── │
│                                                       │
├─────────────────────────────────────────────────────┤
│       MongoDB          Redis          S3             │
└─────────────────────────────────────────────────────┘
```

### 9.2 Module Boundaries

**Extraction candidates for future microservices (when team grows to 15+):**

| Priority | Module | Reason for Extraction | Trigger |
|----------|--------|----------------------|---------|
| 1st | Notification Engine | Highest fan-out (14 dependents), independent scaling needs during broadcast campaigns | When broadcast volume exceeds 100K/day |
| 2nd | Xero Integration | External dependency with rate limits, should not block main API thread | When sync queue depth regularly exceeds 1000 |
| 3rd | Chat / Real-time | Socket.io has different scaling profile (persistent connections) from REST API (stateless) | When concurrent chat users exceed 500 |
| 4th | Analytics | Read-heavy, can use separate read replica, different caching strategy | When analytics queries impact API latency |

### 9.3 Event-Driven Architecture Completeness

The PRD uses event emitters for key flows but the events are not formally catalogued. **Recommended event catalogue:**

| Event | Publisher | Subscribers | Current Status |
|-------|-----------|-------------|----------------|
| `order.created` | Order Module | Xero (invoice?), Notification | Implied but not explicit |
| `order.statusChanged` | Order Module | AuditLog, Notification, Analytics | Implied |
| `order.completed` | Order Module | Review Scheduler, Xero, Staff Counter, Notification | Defined in ORD-INV-10 |
| `order.cancelled` | Order Module | Xero (void), Payment (cancel pending), Notification | Defined in ORD-INV-08 |
| `order.invoiceable` | Order Module | Xero Worker | Defined in S10.4 |
| `payment.succeeded` | Payment Module | Xero, Notification, Referral Reward Check | Defined in PAY-INV-12 |
| `payment.failed` | Payment Module | Notification | Defined in PAY-INV-13 |
| `payment.refunded` | Payment Module | Xero (credit note), Notification | Defined in S10.4 |
| `lead.created` | Lead Module | Assignment Engine, Dedup Check | Implied |
| `lead.converted` | Lead Module | User Module, Order Module | Defined in LM-INV-04 |
| `review.submitted` | Review Module | Google Prompt, Slack (if low), Analytics | Defined in S18.3 |
| `user.created` | User Module | Xero (contact sync), Welcome Notification | **Missing** |
| `user.deleted` | User Module | Data cleanup, Xero (archive contact) | **Missing** |
| `ticket.created` | Ticket Module | Assignment, SLA Clock, Notification | Implied |
| `ticket.slaBreached` | SLA Cron | Escalation, Slack, AuditLog | Defined in S21.4 |
| `broadcast.completed` | Broadcast Worker | Campaign Stats Update, AuditLog | **Missing** |
| `document.uploaded` | Vault Module | Virus Scan, OCR Trigger, Storage Counter | Implied |
| `taxResult.imported` | Tax Module | TaxYearSummary Update | Defined in VER-INV-14 |

**Missing events that should be defined:** `user.created`, `user.deleted`, `broadcast.completed`, `appointment.noShow`, `staff.deactivated`, `ticket.resolved`, `referral.rewarded`.

### 9.4 Shared Service Opportunities

| Service | Current State | Recommendation |
|---------|--------------|----------------|
| **File Upload** | Duplicate logic in: vault upload (S14), chat file share (S15), document upload (S11), lead activity attachments (S12) | Create `FileService` with: virus scan, MIME validation, S3 upload, presigned URL generation. All modules call this. |
| **Notification** | Already centralised (S5) | Good design. Ensure all modules use `NotificationService.send()` and never send directly via Twilio/FCM/SES. |
| **Audit** | Mongoose post-save middleware | Good pattern but fragile -- middleware must be registered on every model. Consider an explicit `AuditService.log()` call for critical operations alongside the middleware safety net. |
| **Number Generation** | Each model likely implements its own QGS-X-NNNN counter | Create `CounterService` with atomic increment. Currently no Counter model in the 38-collection list -- this is a gap (see M-04 in Data Model section). |
| **PDF Generation** | Mentioned for analytics export (S20.2), audit log export (S2.6) | No shared PDF service. Will need one for: tax estimate PDF, analytics exports, audit log exports, invoice PDFs. |

---

## 10. Risk Matrix

### Critical Gaps (14)

| Gap ID | Module(s) | Description | Business Impact | Recommended Fix | Effort | Phase |
|--------|-----------|-------------|-----------------|-----------------|--------|-------|
| GAP-C01 | Privacy (Cross-cutting) | No data anonymization/erasure workflow for Privacy Act 1988 APP 11 | Legal non-compliance. OAIC enforcement action possible. | Add DataDeletionRequest model, anonymization endpoint, and retention policy engine. | L | 0 |
| GAP-C02 | Privacy (Cross-cutting) | No client data export endpoint for APP 12 | Legal non-compliance. | Add `GET /api/v1/users/me/data-export` that aggregates all PII across collections. | M | 0 |
| GAP-C03 | Orders + Xero (S7, S10) | Async flow data consistency: Order completion triggers multiple side-effects without compensating transactions | Invoice not created, payments not synced, reviews not requested -- silently lost. | Implement outbox pattern for critical cross-module events. | L | 0-1 |
| GAP-C04 | Payments (S9) | No overdue payment follow-up automation | 5-15% revenue leakage from unpaid invoices. | Add payment reminder sequence: 24hr, 3-day, 7-day, 14-day. Auto-flag for write-off review at 60 days. | M | 1 |
| GAP-C05 | Orders (S7) | No concurrent modification protection (optimistic locking) on Order status transitions | Race conditions: simultaneous cancel + complete leads to inconsistent state. | Add `version` field to Order. Status transition requires matching version in update query. | S | 0 |
| GAP-C06 | Xero (S10) | Invoice adjustment (void + recreate) is 2 separate HTTP calls without rollback | Voided invoice with no replacement = order has no invoice. | Add saga pattern: track state machine of adjustment (void_started -> void_succeeded -> create_started -> create_succeeded). Rollback: if create fails, un-void original. | M | 2 |
| GAP-C07 | Security (S3) | MFA defined in model but no enrollment/verification endpoints | Admin/staff accounts unprotected by MFA. Single credential compromise = full system access. | Add MFA enrollment, verification, and backup code endpoints. Make MFA mandatory for admin/super_admin. | M | 0 |
| GAP-C08 | Security (S3) | No dependency vulnerability scanning | Known CVEs in dependencies go undetected. | Add npm audit + Snyk/Dependabot to CI/CD pipeline. | S | 0 |
| GAP-C09 | Orders (S7) | No engagement letter workflow (TPB requirement) | Tax agent operates without legally required engagement letters. Risks TPB registration. | Add EngagementLetter model or integrate with Zoho Sign workflow for pre-order engagement letter creation and tracking. | M | 3 |
| GAP-C10 | Infrastructure | Redis SPOF for 9 distinct platform functions | Redis outage = total platform outage. | Configure ElastiCache Multi-AZ with automatic failover. Separate critical (auth, payments) from bulk (broadcast, cache) Redis usage. | M | 0 |
| GAP-C11 | Payments (S9) | No payment amount vs order finalAmount validation | Underpayments go undetected. No partial payment workflow defined. | Add PAY-INV-16: payment.amount must equal order.finalAmount unless partial_payment flag is set (future feature). | S | 1 |
| GAP-C12 | Security | No encryption key management strategy (KMS/HSM) | AES-256-GCM keys for TFN and tokens stored as... environment variables? Key compromise exposes all encrypted data with no rotation path. | Use AWS KMS for key management. Implement key rotation with re-encryption job. | L | 0 |
| GAP-C13 | Scalability | No MongoDB archival strategy for unbounded collections (chatMessages, notifications, leadActivities) | Database grows indefinitely. Performance degrades. Storage costs escalate. | Implement time-based archival (24-month rolling) for high-growth collections, similar to auditLog archival. | M | 10 |
| GAP-C14 | Security | No NoSQL injection sanitization | Query parameter injection via `$gt`, `$where` operators. Mongoose alone does not prevent all vectors. | Add mongo-sanitize middleware globally. | S | 0 |

### High Gaps (22)

| Gap ID | Module(s) | Description | Business Impact | Recommended Fix | Effort | Phase |
|--------|-----------|-------------|-----------------|-----------------|--------|-------|
| GAP-H01 | Data Model | Missing standalone Appointment model (M-01) | Cannot schedule consultations before order exists. Staff availability queries expensive. | Extract Appointment as standalone collection. | M | 3 |
| GAP-H02 | Data Model | SupportTicket.messages as embedded array (M-03) | Unbounded growth. Document exceeds 16MB limit on long-running tickets. | Extract to TicketMessage collection. | M | 7 |
| GAP-H03 | Data Model | Missing Counter model for auto-increment IDs | Race conditions on number generation across concurrent requests. | Add Counter collection with atomic findAndModify. | S | 0 |
| GAP-H04 | Data Model | 13 critical missing indexes (IDX-01 through IDX-13) | Slow queries, full collection scans, degraded UX especially during tax season. | Define all indexes in schema files. | S | 0 |
| GAP-H05 | Data Model | QueueDeadLetter model missing (M-06) | Failed BullMQ jobs lost. Xero sync failures, broadcast failures not recoverable. | Add dead letter queue collection with admin review UI. | S | 1 |
| GAP-H06 | Invariants | Staff deactivation cascade (INV-17) | Orphaned leads, orders, tickets when staff made inactive. | Add cascade handler: reassign all active work items before deactivation. | M | 3 |
| GAP-H07 | BullMQ | All queues share single Redis | Broadcast campaign saturates Redis, payment webhooks delayed. | Use separate Redis connections for critical (payments) vs bulk (broadcasts) queues. | M | 1 |
| GAP-H08 | Business | No bulk "roll forward" for returning clients (BW-04) | Days of manual work each July creating new FY orders. | Add bulk order creation from previous FY client list. | M | 4 |
| GAP-H09 | Business | Client re-engagement for new FY not automated (BW-01) | Client churn between filing periods. | Add FY rollover cron: 1 July trigger, identify prior-year clients, auto-create broadcast campaign. | M | 8 |
| GAP-H10 | Tax Compliance | Tax Agent Lodgement Program not configurable (TC-01) | Incorrect deadline reminders. Clients panic or miss extended deadlines. | Add TaxAgentProfile model with lodgement program dates from ATO. | M | 8 |
| GAP-H11 | Payments | No discount stacking cap (RL-03) | Discounts could exceed 100%. | Add invariant: max total discount 50% (or configurable). Validate: referral + user.discount + promo cannot exceed cap. | S | 1 |
| GAP-H12 | Integration | BillingDispute has no CRUD APIs (CRUD-05) | Disputes cannot be managed programmatically. | Add full CRUD endpoints for billing disputes. | M | 1 |
| GAP-H13 | API | Missing order timeline endpoint (EP-01) | Staff must manually piece together order history from multiple sources. | Add aggregated timeline endpoint pulling from AuditLog + payments + review + status changes. | M | 3 |
| GAP-H14 | Integration | 8 missing cross-module integrations (Section 1.5) | Fragmented workflows, manual intervention needed. | Implement integration points incrementally per phase. | L | Various |
| GAP-H15 | Security | Zoho Sign/DocuSign tokens not specified as encrypted | Token exposure risk in database. | Apply same AES-256-GCM pattern as Xero tokens. | S | 0 |
| GAP-H16 | Scalability | Gmail SMTP as SPOF for transactional email (SPOF-04) | OTP delivery failure = users locked out. | Use SES for all transactional email. Gmail as development/testing only. | M | 0 |
| GAP-H17 | Security | No WAF mentioned | Unprotected against common web attacks at edge. | Deploy AWS WAF with OWASP rules in front of ALB. | M | 10 |
| GAP-H18 | Circuit Breakers | Deferred to Phase 10 but needed from Phase 1 | 40 weeks of production without circuit breakers on payment gateways. | Implement circuit breakers for Stripe/Payzoo in Phase 1, Xero in Phase 2. | M | 1-2 |
| GAP-H19 | Data Model | User model too large (30+ fields) | Performance on frequently-read document. Auth fields (refreshTokens with hashed tokens) loaded on every user fetch. | Extract UserAuth sub-document or separate collection. | M | 0 |
| GAP-H20 | Invariants | SLA clock does not pause during waiting_on_client (INV-12) | False SLA breaches penalizing staff when client is non-responsive. | Add clock pause/resume logic tied to status transitions. | M | 7 |
| GAP-H21 | Phase Sequencing | Document vault (Phase 6) needed for order processing (Phase 3) | 15+ weeks where orders cannot collect documents through platform. | Move minimal vault upload capability (upload + list + presigned download) to Phase 3. Full vault with OCR, dedup, quotas stays in Phase 6. | M | 3 |
| GAP-H22 | Phase Sequencing | Consent capture needed at signup (Phase 0) but Broadcast module is Phase 5 | No consent records exist when broadcasts begin. Must retroactively capture consent. | Add ConsentRecord model and basic consent capture to Phase 0 signup flow. | S | 0 |

### Medium Gaps (31)

| Gap ID | Module(s) | Description | Effort | Phase |
|--------|-----------|-------------|--------|-------|
| GAP-M01 | API Design | Mixed POST/GET for queries (API-01) | S | 0 |
| GAP-M02 | API Design | Inconsistent singular/plural sub-resources (API-02) | S | 0 |
| GAP-M03 | API Design | Verbs in URL paths (API-03) | S | Various |
| GAP-M04 | API Design | Inconsistent action endpoint methods (API-04) | S | Various |
| GAP-M05 | CRUD | BroadcastTemplate missing DELETE (CRUD-01) | S | 5 |
| GAP-M06 | CRUD | CannedResponse missing UPDATE/DELETE (CRUD-02) | S | 7 |
| GAP-M07 | CRUD | VaultDocument missing restore endpoint (CRUD-09) | S | 6 |
| GAP-M08 | CRUD | ConsentRecord missing direct CRUD APIs (CRUD-04) | M | 5 |
| GAP-M09 | CRUD | ReviewAssignment missing reassign endpoint (CRUD-06) | S | 3 |
| GAP-M10 | CRUD | LeadReminder missing DELETE (CRUD-08) | S | 3 |
| GAP-M11 | Data Model | Missing ApplicationConfig/SystemConfig model (M-02) | S | 0 |
| GAP-M12 | Data Model | Missing LoginHistory model (M-07) | S | 0 |
| GAP-M13 | Data Model | Missing CampaignAnalytics materialized view (M-05) | M | 5 |
| GAP-M14 | Data Model | Shared fields not abstracted as Mongoose plugins | M | 0 |
| GAP-M15 | Tax | Working Holiday Maker visa status not in Order model (TC-02) | S | 4 |
| GAP-M16 | Tax | Part-year resident not supported in calculator (TC-03) | M | 4 |
| GAP-M17 | Tax | Spouse income field missing for MLS calculation (TC-05) | S | 4 |
| GAP-M18 | Tax | Trust distributions not in calculator inputs (TC-06) | M | 4 |
| GAP-M19 | Business | No client document checklist per service (BW-05) | M | 3 |
| GAP-M20 | Business | No multi-year order view (BW-07) | M | 6 |
| GAP-M21 | Business | Appointment no-show follow-up sequence (BW-08) | S | 8 |
| GAP-M22 | Integration | Ticket creation from chat/WhatsApp has no API (EP-08, EP-09) | M | 7 |
| GAP-M23 | Integration | Outstanding payments endpoint missing (EP-10) | S | 1 |
| GAP-M24 | Security | No API request body size limits | S | 0 |
| GAP-M25 | Security | No brute-force protection on referral code validation (SI-06) | S | 8 |
| GAP-M26 | Security | URL validation on WhatsApp media download (SI-07) | S | 7 |
| GAP-M27 | Scalability | No rate limit on tax estimate endpoint (RL-01) | S | 4 |
| GAP-M28 | Scalability | No rate limit on search endpoints (RL-05) | S | 3-4 |
| GAP-M29 | Scalability | No worker scaling strategy for BullMQ | M | 10 |
| GAP-M30 | Data Consistency | Storage quota drift between upload and $inc (DC-07) | S | 6 |
| GAP-M31 | Scope Filtering | WhatsApp conversations scope unclear for non-lead contacts | S | 7 |

### Low Gaps (18)

| Gap ID | Module(s) | Description | Effort | Phase |
|--------|-----------|-------------|--------|-------|
| GAP-L01 | API Design | Stats endpoint naming inconsistency (API-05) | S | Various |
| GAP-L02 | CRUD | TaxDeadline missing DELETE | S | 8 |
| GAP-L03 | CRUD | NotificationPreference missing admin view | S | 5 |
| GAP-L04 | Tax | Medicare Levy Exemption categories not modeled (TC-04) | S | 4 |
| GAP-L05 | Tax | Deceased estate workflow not supported (TC-07) | M | Future |
| GAP-L06 | Business | No loyalty/tenure recognition (CR-01) | M | Future |
| GAP-L07 | Business | No proactive mid-year communication (CR-02) | M | Future |
| GAP-L08 | Business | No household/family grouping (CR-04) | L | Future |
| GAP-L09 | Business | No late payment fee mechanism (RL-05) | S | Future |
| GAP-L10 | Integration | Vault OCR trigger endpoint missing (EP-06) | S | 6 |
| GAP-L11 | Integration | Unassigned orders quick-view endpoint (EP-07) | S | 3 |
| GAP-L12 | Data Model | Order model should split out EFile and Appointment sub-docs | M | 3 |
| GAP-L13 | Events | Missing formal event catalogue | M | 0 |
| GAP-L14 | Scalability | No Redis key namespace separation | S | 0 |
| GAP-L15 | Scalability | No Redis memory monitoring specification | S | 0 |
| GAP-L16 | Security | Swagger UI should be disabled in production | S | 10 |
| GAP-L17 | Security | Admin session geolocation anomaly detection (SI-04) | M | 10 |
| GAP-L18 | Scalability | webhook endpoint rate limiting (RL-06) | S | 1 |

---

## Recommendations Summary

### Immediate Actions (Do Now -- Phase 0 additions)

| # | Action | Gap Ref | Effort |
|---|--------|---------|--------|
| 1 | Add data anonymization endpoint and DataDeletionRequest model | GAP-C01, GAP-C02 | L |
| 2 | Add optimistic locking (version field) to Order and Payment models | GAP-C05 | S |
| 3 | Add MFA enrollment/verification endpoints; make MFA mandatory for admin roles | GAP-C07 | M |
| 4 | Add npm audit + Snyk to CI/CD pipeline | GAP-C08 | S |
| 5 | Configure Redis Multi-AZ with automatic failover | GAP-C10 | M |
| 6 | Implement AWS KMS for encryption key management | GAP-C12 | L |
| 7 | Add mongo-sanitize middleware globally | GAP-C14 | S |
| 8 | Add ConsentRecord model and consent capture to signup flow | GAP-H22 | S |
| 9 | Define all 13 missing indexes in schema files | GAP-H04 | S |
| 10 | Add Counter model for atomic auto-increment | GAP-H03 | S |

### Short-Term (Phases 1-3 additions)

| # | Action | Gap Ref | Effort |
|---|--------|---------|--------|
| 1 | Implement outbox pattern for critical cross-module events | GAP-C03 | L |
| 2 | Add payment reminder automation (24hr, 3d, 7d, 14d) | GAP-C04 | M |
| 3 | Add engagement letter workflow | GAP-C09 | M |
| 4 | Move basic vault upload to Phase 3 | GAP-H21 | M |
| 5 | Implement circuit breakers for Stripe/Payzoo (Phase 1) and Xero (Phase 2) | GAP-H18 | M |
| 6 | Separate Redis connections for critical vs bulk queues | GAP-H07 | M |
| 7 | Add BillingDispute CRUD APIs | GAP-H12 | M |
| 8 | Use SES for transactional email instead of Gmail SMTP | GAP-H16 | M |
| 9 | Add discount stacking cap invariant | GAP-H11 | S |
| 10 | Add payment amount vs order finalAmount validation | GAP-C11 | S |

### Long-Term (Phases 4-10 and Roadmap)

| # | Action | Gap Ref | Effort |
|---|--------|---------|--------|
| 1 | Implement collection archival for chatMessages, notifications, leadActivities | GAP-C13 | M |
| 2 | Add Tax Agent Lodgement Program configuration | GAP-H10 | M |
| 3 | Add bulk order roll-forward for new FY | GAP-H08 | M |
| 4 | Add client re-engagement automation for new FY | GAP-H09 | M |
| 5 | Extract Appointment as standalone model | GAP-H01 | M |
| 6 | Extract TicketMessage from embedded array | GAP-H02 | M |
| 7 | Deploy AWS WAF | GAP-H17 | M |
| 8 | Add dead-letter queue model for failed BullMQ jobs | GAP-H05 | S |
| 9 | Add household/family grouping | GAP-L08 | L |
| 10 | Add formal event catalogue and event bus abstraction | GAP-L13 | M |

---

## Architecture Observations

### Strengths

1. **Hybrid tax engine**: The decision to NOT build ATO-certified calculation software and instead build an estimate calculator + import system is architecturally sound. It avoids regulatory risk, reduces maintenance burden, and lets QEGOS focus on its core value (CRM + client experience).

2. **Invariant-driven design**: 163 explicitly documented invariants is exceptional for a PRD. This provides clear contracts for developers and testable specifications for QA.

3. **Event-driven async processing**: Use of BullMQ for Xero sync, broadcast sending, and review scheduling decouples modules effectively. The risk is in reliability (addressed in gaps above).

4. **Financial precision**: Integer-cent arithmetic throughout (ORD-INV-04, PAY-INV-02, TAX-INV-03) eliminates floating-point rounding errors. This is correct and well-enforced.

5. **Audit trail comprehensiveness**: 7-year retention, append-only collection, severity levels, and monthly archival to Glacier. Exceeds most platforms' audit capabilities.

6. **Tax rule versioning**: The snapshot immutability model (frozen once used, corrections create new versions, amendments use original snapshot) is a sophisticated design that solves a real regulatory problem.

### Concerns

1. **12-Factor App compliance**: Configuration management (Factor III) is underspecified. No mention of environment variable management tool (Vault, SSM, etc.). The PRD hardcodes some values (e.g., bcrypt cost factor 12, JWT lifetimes) that should be environment-configurable.

2. **Observability gap**: NFR-09 mentions structured logging with Winston and NFR-20 mentions APM, but no distributed tracing (OpenTelemetry / X-Ray) is specified. With 15+ async BullMQ jobs and 6 external integrations, tracing a request across services is critical for debugging production issues.

3. **Testing strategy undefined**: No testing strategy (unit, integration, e2e ratios; critical path identification; test data management). The tax rules test suite (S8.10) is excellent but appears to be the only defined test suite in the entire PRD.

4. **Database connection management**: No mention of connection pooling configuration, read preference settings for analytics queries, or write concern levels for financial transactions. These are critical for MongoDB in production.

---

## Risk Assessment

**Overall Risk Level:** HIGH (pre-mitigation) / MEDIUM (post-mitigation of critical gaps)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Privacy Act non-compliance (APP 11, 12) | High | Critical | Implement data anonymization and export before launch |
| Redis total failure | Medium | Critical | Multi-AZ ElastiCache with automatic failover |
| Data inconsistency from async flow failures | High | High | Outbox pattern for critical cross-module events |
| Payment gateway failure without circuit breaker | Medium | High | Implement circuit breakers in Phase 1 |
| Tax agent registration risk from missing engagement letters | High | Critical | Add engagement letter workflow in Phase 3 |
| Race conditions on concurrent order modifications | Medium | High | Optimistic locking on Order model |
| Revenue leakage from missing payment follow-up | High | High | Automated payment reminder sequence |
| Database growth without archival | High (over 2 years) | Medium | Time-based archival for high-growth collections |
| Gmail SMTP failure blocking OTP/password reset | Medium | Critical | Switch transactional email to SES |
| Encryption key compromise without rotation capability | Low | Critical | AWS KMS integration |

---

## Appendix: PRD Sections Analyzed

| Section | Title | Lines | Key Focus |
|---------|-------|-------|-----------|
| S1 | System Overview | 1-98 | Architecture, infrastructure, localisation |
| S2 | User Types, Roles & RBAC | 103-298 | 7 user types, permission matrix, audit logging, permission audit tooling |
| S3 | Authentication & Security | 301-361 | JWT strategy, auth APIs, 15 security invariants |
| S4 | API Design Standards | 363-435 | Versioning, response format, error codes, idempotency, health checks |
| S5 | Notification Engine | 440-496 | Cross-module notifications, preferences, quiet hours |
| S6 | User Profile Management | 498-549 | User model (30+ fields), user APIs |
| S7 | Order/Tax Return Management | 555-802 | Order model, 9-state lifecycle, review pipeline, sales catalogue |
| S8 | Tax Calculation & Estimation Engine | 807-1228 | Hybrid model, tax rules, calculator, tax results, amendments, versioning |
| S9 | Payment Gateway | 1243-1410 | Stripe + Payzoo, gateway abstraction, billing edge cases |
| S10 | Xero Accounting Integration | 1414-1518 | OAuth, sync workflows, reconciliation |
| S11 | Document Management & Signing | 1524-1548 | Zoho Sign/DocuSign, upload pipeline |
| S12 | Lead Management | 1551-1758 | Lead model, 8-state lifecycle, scoring, automation, mobile companion |
| S13 | Broadcast Engine | 1764-1922 | SMS + Email + WhatsApp campaigns, Spam Act compliance |
| S14 | Client Portal & Document Vault | 1928-2064 | Vault model, tax year summary, storage abuse protection |
| S15 | In-App Chat | 2068-2148 | Socket.io, TFN redaction, canned responses |
| S16 | WhatsApp Business Integration | 2152-2216 | Meta Cloud API, template messaging, media download |
| S17 | Tax Deadline & Compliance Calendar | 2222-2275 | Australian tax calendar, reminders |
| S18 | Reviews & Reputation Management | 2281-2336 | Star rating, NPS, Google Review (non-gated) |
| S19 | Referral Program Engine | 2342-2401 | Codes, tracking, rewards, leaderboard |
| S20 | Revenue Intelligence & Analytics | 2408-2451 | 9 dashboard widgets, CLV, forecasting |
| S21 | Support Tickets & SLA Engine | 2457-2557 | Ticket model, SLA calculation, auto-escalation |
| S22 | Staff Management & Appointments | 2560-2598 | Staff APIs, appointment scheduling |
| S23 | Cross-Module Integration Matrix | 2604-2637 | 33 integration points |
| S24 | Non-Functional Requirements | 2641-2677 | 32 NFRs |
| S25 | Implementation Roadmap | 2681-2703 | 10 phases, 51-55 weeks |
| S26 | Appendix: Endpoint Registry | 2706-2734 | ~210 endpoints |
| S27 | Data Model Registry | 2738-2782 | 38 collections |
| S28 | Invariant Registry | 2786-2817 | ~163 invariants |

---

*End of Analysis*
*QEGOS Modular Strategy Gap Analysis v1.0*
*Analyst: Goku (Business Architect)*
*Generated: 2026-04-07*
*PRD Baseline: QEGOS Final Production PRD v4.0*
