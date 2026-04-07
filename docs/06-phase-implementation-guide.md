# QEGOS Phase Implementation Guide

**Product:** QEGOS — Tax Preparation, Filing & Client Management Platform
**Market:** Australia
**Date:** 2026-04-07
**Source:** QEGOS Final Production PRD v4.0
**Total Timeline:** 51-55 weeks (6-person team) | 16-20 months (2-3 developers)
**Recommended MVP:** Phases 0-3 (19 weeks)

---

## Team Composition

| Role | Count | Focus |
|------|-------|-------|
| Backend Engineer | 3 | API, integrations, data models, queues |
| Frontend Engineer | 2 | Admin dashboard, mobile app, web app |
| QA Engineer | 1 | Testing, automation, security |
| **Total** | **6** | |

---

## Phase 0: Foundation

**Duration:** 4 weeks
**Team:** 2 BE
**Prerequisite:** None

### Scope

RBAC middleware, permission matrix, permission audit tooling, audit logging on all models, rate limiting, JWT refresh rotation + blacklisting, standardised error handling, health check endpoints, express-validator on all existing endpoints, API versioning prefix, tax rule config model + FY2024-25 seed data.

### Data Models to Build

| Model | Collection | Key Fields |
|-------|-----------|-----------|
| Role | roles | name, displayName, permissions[{resource, actions[], scope}], isSystem, isActive |
| AuditLog | auditlogs | actor, actorType, action, resource, resourceId, changes, severity, timestamp |
| PermissionSnapshot | permissionsnapshots | roleId, permissionsBefore, permissionsAfter, diff, changedBy, reason |
| TaxRuleConfig | taxruleconfigs | snapshotId(UUID), financialYear, version, status, brackets, medicareLevyRate, hecsRepaymentTiers, ... |

### Endpoints to Build

| Endpoint | Method | Auth | PRD Section |
|----------|--------|------|-------------|
| GET /api/v1/roles | GET | admin+ | SS2.6 |
| POST /api/v1/roles | POST | super_admin | SS2.6 |
| PUT /api/v1/roles/:id | PUT | super_admin | SS2.6 |
| DELETE /api/v1/roles/:id | DELETE | super_admin | SS2.6 |
| PUT /api/v1/users/:id/role | PUT | admin+ | SS2.6 |
| POST /api/v1/audit-logs | POST | admin+ | SS2.6 |
| POST /api/v1/audit-logs/export | POST | super_admin | SS2.6 |
| GET /api/v1/audit-logs/stats | GET | admin+ | SS2.6 |
| GET /api/v1/permissions/access-report | GET | admin+ | SS2.9 |
| GET /api/v1/permissions/access-report/:resource | GET | admin+ | SS2.9 |
| GET /api/v1/permissions/user/:userId | GET | admin+ | SS2.9 |
| GET /api/v1/permissions/history | GET | admin+ | SS2.9 |
| GET /api/v1/permissions/anomalies | GET | admin+ | SS2.9 |
| POST /api/v1/permissions/simulate | POST | admin+ | SS2.9 |
| GET /health | GET | public | SS4.5 |
| GET /health/deep | GET | admin | SS4.5 |

### Invariants to Enforce

RBAC-INV-01 through RBAC-INV-12, PRM-INV-01 through PRM-INV-06, SEC-INV-01 through SEC-INV-15

### Key Implementation Notes

1. **Middleware chain:** `checkPermission(resource, action)` must be Express middleware applied globally. Public endpoints (webhooks, health) explicitly bypassed.
2. **Scope filter injection:** `req.scopeFilter` attached in middleware, route handlers MUST apply it to every DB query.
3. **403 standardization:** Identical response regardless of resource existence (RBAC-INV-08).
4. **Audit append-only:** No update/delete operations on auditlogs collection. MongoDB collection-level validator.
5. **Redis cache for roles:** 5-min TTL, invalidated on any role update.
6. **Tax rule seed data:** FY2024-25 Australian brackets (resident, non-resident, working holiday), HECS tiers, Medicare thresholds, LITO, SAPTO, CGT discount. All values in cents.

### Dependencies on External Services

- Redis (ElastiCache) for rate limiting, role caching, anomaly detection counters
- MongoDB Atlas M30+ (ap-southeast-2)

### Deliverables

- [ ] RBAC middleware working with all 7 roles and 17 resources
- [ ] Audit trail recording every mutation
- [ ] Auth hardened (JWT rotation, rate limiting, lockout)
- [ ] Tax rules seeded for FY2024-25
- [ ] Health check endpoints
- [ ] API versioning prefix (/api/v1/)
- [ ] express-validator on all existing endpoints

---

## Phase 1: Payment Hardening

**Duration:** 5 weeks
**Team:** 2 BE + 1 FE
**Prerequisite:** Phase 0

### Scope

Separate Payment collection + migration, idempotency keys, Stripe webhook signature verification, Payzoo Provider, Gateway Abstraction Layer + routing, webhook replay protection, GST rounding engine, billing dispute model, prorated cancellation workflow, write-off workflow, admin gateway config UI, payment transaction log UI.

### Data Models to Build

| Model | Collection | Key Fields |
|-------|-----------|-----------|
| Payment | payments | paymentNumber, orderId, userId, gateway, gatewayTxnId, idempotencyKey, amount(cents), status, refunds[] |
| PaymentGatewayConfig | paymentgatewayconfigs | primaryGateway, routingRule, stripeEnabled, payzooEnabled, fallbackTimeoutMs, maintenanceMode |
| WebhookEvent | webhookevents | eventId(unique), gateway, eventType, payload, status, retryCount |
| BillingDispute | billingdisputes | ticketId, orderId, paymentId, disputeType, disputedAmount, resolution, status |

### Endpoints to Build

| Endpoint | Method | Auth | PRD Section |
|----------|--------|------|-------------|
| POST /api/v1/payments/intent | POST | client(own) | SS9.4 |
| POST /api/v1/payments/capture | POST | client(own) | SS9.4 |
| POST /api/v1/payments/refund | POST | admin+ | SS9.4 |
| GET /api/v1/payments/:id | GET | admin+/client(own) | SS9.4 |
| GET /api/v1/payments/:id/status | GET | client(own) | SS9.4 |
| GET /api/v1/payments/order/:orderId | GET | admin+/staff/client | SS9.4 |
| POST /api/v1/webhooks/stripe | POST | public(sig) | SS9.4 |
| POST /api/v1/webhooks/payzoo | POST | public(HMAC) | SS9.4 |
| GET /api/v1/payments/config | GET | admin+ | SS9.4 |
| PUT /api/v1/payments/config | PUT | super_admin | SS9.4 |
| POST /api/v1/payments/config/test | POST | admin+ | SS9.4 |
| GET /api/v1/payments/logs | GET | admin+ | SS9.4 |
| GET /api/v1/payments/stats | GET | admin+ | SS9.4 |
| POST /api/v1/payments/write-off | POST | admin+ | SS9.7.5 |
| POST /api/v1/orders/:id/adjust-invoice | POST | admin+ | SS9.7.3 |

### Invariants to Enforce

PAY-INV-01 through PAY-INV-13, BIL-INV-01 through BIL-INV-07

### Key Implementation Notes

1. **Gateway Abstraction Layer:** `PaymentRouter` determines gateway based on config. `isRetryable()` function classifies errors.
2. **Stripe raw body:** Express must pass raw body (not parsed JSON) to `/webhooks/stripe` for signature verification (PAY-INV-04).
3. **Idempotency:** Unique index on `idempotencyKey`. Check-before-create pattern. Redis cache 24hr TTL.
4. **GST engine:** `Math.round(priceInCents / 11)` per line item. Sum per-item GST. Never on total (BIL-INV-01).
5. **Refund approval gates:** >$500 = admin, >$2000 = super_admin (BIL-INV-04).
6. **Invoice adjustment:** Void + recreate atomic (BIL-INV-02). Never modify AUTHORISED Xero invoice.

### Admin Dashboard (FE)

- Payment gateway configuration page
- Payment transaction log with filters
- Refund processing UI
- Billing dispute management

### Dependencies

- Stripe SDK + Stripe webhook endpoint secret
- Payzoo SDK + HMAC secret
- Phase 0 RBAC + audit logging

### Deliverables

- [ ] Dual-gateway payments operational
- [ ] Bulletproof webhook processing
- [ ] Idempotency on all financial endpoints
- [ ] GST rounding ATO-compliant
- [ ] Billing edge cases (prorated, write-off, disputes)
- [ ] Admin config UI for gateway management

---

## Phase 2: Xero Integration

**Duration:** 4 weeks
**Team:** 1 BE + 1 FE
**Prerequisite:** Phase 1

### Scope

OAuth 2.0 with encrypted tokens, Redis distributed lock for refresh, Contact sync, Invoice auto-creation, Payment sync, Credit note for refunds, invoice adjustment (void + recreate), rate limiter (60/min), sync log with retry, reconciliation report, admin settings UI.

### Data Models to Build

| Model | Collection | Key Fields |
|-------|-----------|-----------|
| XeroSyncLog | xerosynclogs | entityType, entityId, xeroEntityId, action, status, retryCount, nextRetryAt |
| Xero config fields | (on Application/Config model) | xeroConnected, xeroTenantId, xeroAccessToken(encrypted), xeroRefreshToken(encrypted), xeroTokenExpiresAt, account mappings |

### Endpoints to Build

18 endpoints per SS10.3 including: OAuth connect/callback/disconnect, config management, contact/invoice/payment sync, bulk sync, reconciliation, retry.

### Invariants to Enforce

XRO-INV-01 through XRO-INV-11

### Key Implementation Notes

1. **Token storage:** AES-256-GCM encrypt before storing. Never log tokens.
2. **Token refresh:** Redlock (5s TTL). Only one concurrent refresh.
3. **Rate limiter:** Token bucket, 60 calls/min. Excess queued.
4. **Idempotent sync:** Check xeroInvoiceId locally AND search Xero by orderNumber.
5. **Retry strategy:** Exponential backoff (1min, 5min, 30min, 2hr). After 4: fail + Slack.
6. **Offline resilience:** Disconnected = queue all ops. Reconnect = bulk sync clears queue.

### BullMQ Jobs

- XeroSyncWorker (event: "order.invoiceable")
- XeroPaymentSync (event: "payment.succeeded")
- XeroCreditNoteSync (event: "payment.refunded")

### Deliverables

- [ ] Automated accounting sync (invoices, payments, credit notes)
- [ ] Reconciliation report
- [ ] Admin Xero settings UI
- [ ] Resilient to disconnection

---

## Phase 3: Lead & Order Core

**Duration:** 6 weeks
**Team:** 2 BE + 2 FE
**Prerequisite:** Phase 0 (RBAC)

### Scope

Lead CRUD + 8-state status machine + activity logging + dedup + assignment + Kanban + staff mobile companion, Order enhancements (orderType, linkedOrderId), Review/Approval Pipeline (checklist, assignment rules, approval gate), follow-up reminders + push.

### Data Models to Build

| Model | Collection | Key Fields |
|-------|-----------|-----------|
| Lead | leads | leadNumber, source, firstName, mobile(E.164), status(1-8), priority, score, assignedTo, isConverted |
| LeadActivity | leadactivities | leadId, type, description, outcome, sentiment, performedBy |
| LeadReminder | leadreminders | leadId, assignedTo, reminderDate, isCompleted, isOverdue |
| ReviewAssignment | reviewassignments | orderId, preparerId, reviewerId, status, checklist[], changesRequested[], reviewRound |

### Endpoints to Build

32 Lead endpoints (SS12.7) + 8 Review endpoints (SS7.7) + Order enhancements.

### Invariants to Enforce

LM-INV-01 through LM-INV-12, ORD-INV-01 through ORD-INV-10, RVW-INV-01 through RVW-INV-07

### Key Implementation Notes

1. **Lead status machine:** Adjacency map validator. Lost requires lostReason.
2. **Deduplication:** Mobile AND email OR match. Non-blocking (returns matches as warning).
3. **Conversion:** MongoDB multi-document transaction. Atomic: lead + user + order.
4. **Round-robin assignment:** Skip inactive, skip at-capacity (max 50).
5. **Mobile normalization:** "0412345678" -> "+61412345678" in pre-save hook.
6. **Review pipeline:** Self-review block, seniority gate, complexity gate, round-robin.
7. **Lodgement double-gate:** Approved ReviewAssignment AND locked TaxReturnResult.

### Admin Dashboard (FE)

- Lead Dashboard (/leads/dashboard): stat cards, charts
- Lead List (/leads): tabs, filters, bulk actions
- Lead Detail (/leads/:id): contact info, activity timeline, quick actions
- Pipeline Kanban (/leads/pipeline): drag-and-drop columns

### Mobile App (FE)

- Staff Lead Companion: bottom tab "Leads"
- LeadList, LeadDetail, LogCallScreen, AddLeadScreen, LeadReminders

### BullMQ Jobs

- Auto-assign (new lead, no assignedTo)
- Stale alert (>24hr no activity)
- Auto-dormant (contacted + 14 days)
- Follow-up escalation (overdue >2hr)
- Overdue marker (set isOverdue)

### Deliverables

- [ ] Lead management operational with 8-state machine
- [ ] Activity logging and follow-up reminders
- [ ] Kanban pipeline view
- [ ] Staff mobile companion app
- [ ] Review/approval pipeline with checklist
- [ ] Order enhancements for amendments

---

## Phase 4: Lead Advanced + Tax Engine

**Duration:** 4 weeks
**Team:** 2 BE + 1 FE
**Prerequisite:** Phase 3

### Scope

Lead scoring + automation crons + bulk import/export + merge + conversion, Tax estimate calculator (pure function + APIs + client UI hooks), Tax result import system, Amendment workflow, Tax rules admin UI + test suite, taxEstimateLog storage.

### Data Models to Build

| Model | Collection | Key Fields |
|-------|-----------|-----------|
| TaxEstimateLog | taxestimatelogs | estimateId, userId, financialYear, rulesSnapshotId, input, output, context |
| TaxReturnResult | taxreturnresults | orderId, userId, rulesSnapshotId, source, income{}, deductions{}, isLocked |

### Endpoints to Build

Lead advanced: bulk import/export, merge, scoring stats.
Tax: 24 endpoints per SS8.11 including estimate, quick-estimate, rules CRUD, activate, correct, results CRUD, amendments, compare.

### Invariants to Enforce

TAX-INV-01 through TAX-INV-12, VER-INV-01 through VER-INV-14

### Key Implementation Notes

1. **Pure function:** `calculateTaxEstimate(input, rules)` has NO DB reads, NO side effects. All integer cents.
2. **Built-in test suite:** 12 test cases run automatically on rule activation. ALL must pass.
3. **Snapshot immutability:** usageCount > 0 = permanently immutable. Atomic $inc.
4. **Amendment workflow:** System auto-loads original's rulesSnapshotId. Staff cannot override.
5. **TaxYearSummary:** Populated only from TaxReturnResult (official). NEVER from estimates.

### Deliverables

- [ ] Lead scoring engine (0-100) with auto-priority
- [ ] Bulk import/export
- [ ] Lead merge
- [ ] Tax estimate calculator (pure function)
- [ ] Tax result import system
- [ ] Amendment workflow
- [ ] Tax rules admin UI + test suite
- [ ] Reproducibility guarantee

---

## Phase 5: Broadcast Engine

**Duration:** 5 weeks
**Team:** 2 BE + 1 FE
**Prerequisite:** Phase 0 (RBAC), Phase 3 (Leads/Users for audience)

### Scope

Amazon SES integration, Campaign CRUD + wizard, SMS queue (Twilio, 10/sec), Email queue (SES, 100/sec), Template library with merge tags + fallbacks, Audience segmentation, DND/opt-out + Spam Act compliance, Consent record tracking, Campaign analytics, Delivery reports.

### Data Models to Build

| Model | Collection | Key Fields |
|-------|-----------|-----------|
| BroadcastCampaign | broadcastcampaigns | campaignId, name, channel, status, audienceType, audienceFilters, abTest |
| BroadcastTemplate | broadcasttemplates | name, channel, category, body(merge tags) |
| BroadcastMessage | broadcastmessages | campaignId, recipientId, channel, status, gatewayId |
| BroadcastOptOut | broadcastoptouts | contact, contactType, channel, reason |
| ConsentRecord | consentrecords | contactId, channel, consented, consentSource, consentDate |

### Endpoints to Build

17 endpoints per SS13.3 including: campaign CRUD, send, pause/resume, preview, audience count, templates, opt-outs, dashboard.

### Invariants to Enforce

BRC-INV-01 through BRC-INV-10

### Key Implementation Notes

1. **Spam Act 2003:** Consent required, sender ID mandatory, unsubscribe in every message, honour opt-out immediately.
2. **DND check at SEND time, not schedule time.**
3. **SES bounce handling:** Hard bounce = immediate DND. 3x soft = DND. Spam complaint = all channels DND.
4. **A/B testing:** Variant selection, winner metric (open_rate or click_rate).
5. **Cost estimation:** SMS $0.075, Email $0.001, WhatsApp $0.05 per message.

### BullMQ Jobs

- process-sms-queue (every 5min, batch 2500, 10/sec)
- process-email-queue (every 5min, batch 500, 100/sec)
- process-whatsapp-queue (every 5min, batch 500, 80/sec)
- trigger-scheduled (every 1min)
- sync-delivery-status (every 15min)
- check-campaign-completion (every 10min)
- process-bounces (continuous SES SNS)

### Dependencies

- Amazon SES (configured with DKIM, bounce SNS topic)
- Twilio (existing from auth OTP)
- Meta Cloud API (WhatsApp Business — can be deferred to Phase 7)

### Deliverables

- [ ] Multi-channel campaigns (SMS, Email, WhatsApp)
- [ ] Template library with merge tags
- [ ] Spam Act compliance
- [ ] DND/opt-out management
- [ ] Campaign analytics + delivery reports

---

## Phase 6: Client Portal & Vault

**Duration:** 6 weeks
**Team:** 1 BE + 2 FE
**Prerequisite:** Phase 1 (Payments), Phase 4 (Tax Results)

### Scope

Document vault with ClamAV virus scanning + content hash dedup, S3 storage with per-user paths, Document versioning + quota enforcement (atomic counters), Upload rate limiting, Storage abuse protection + reconciliation cron, Tax year summaries (from tax results), YoY comparison, ATO refund status tracking, Prior-year prefill, Mobile + Web vault UI, Tax estimate calculator UI.

### Data Models to Build

| Model | Collection | Key Fields |
|-------|-----------|-----------|
| VaultDocument | vaultdocuments | userId, financialYear, category, fileUrl, fileSize, contentHash, virusScanStatus, version |
| TaxYearSummary | taxyearsummaries | userId, financialYear, orderId, totalIncome, refundOrOwing, atoRefundStatus |

### Endpoints to Build

14 endpoints per SS14.3: vault upload/bulk-upload, document CRUD, years, prefill, storage, tax summaries, YoY compare, ATO status.

### Invariants to Enforce

CPV-INV-01 through CPV-INV-10, STR-INV-01 through STR-INV-05, DOC-INV-01 through DOC-INV-06

### Key Implementation Notes

1. **ClamAV integration:** Must be in upload pipeline. Infected files quarantined to separate S3 bucket.
2. **Storage counter:** `User.storageUsed` updated with `$inc` (atomic). Monthly reconciliation cron.
3. **Hard delete order:** S3 first, THEN counter decrement. Never decrement without confirmed S3 delete.
4. **Upload rate limits:** Per userId (not per IP, since clients on shared networks).
5. **Presigned URLs:** 15-min expiry. Generated on-demand. Never cached or stored in DB.

### Mobile + Web (FE)

- Document vault UI organized by FY
- Upload with category selection
- Tax year summary dashboard
- YoY comparison view
- ATO refund status tracker
- Tax estimate calculator UI (from Phase 4 backend)
- Storage usage indicator

### Deliverables

- [ ] Secure document vault with virus scanning
- [ ] Storage quota enforcement
- [ ] Document versioning and dedup
- [ ] Tax year summaries
- [ ] YoY comparison
- [ ] ATO status tracking
- [ ] Prior-year prefill
- [ ] Mobile + Web vault UI
- [ ] Tax calculator UI

---

## Phase 7: Communication Suite

**Duration:** 6 weeks
**Team:** 2 BE + 2 FE
**Prerequisite:** Phase 3 (Leads), Phase 6 (Vault for media)

### Scope

In-App Chat (Socket.io + Redis adapter, TFN redaction, file sharing, canned responses, push fallback, conversation transfer), WhatsApp (Meta Cloud API, template messaging, inbound handler, media download + vault save, freeform window), Support Tickets (ticket model, SLA engine, auto-escalation crons, ticket UI in admin + portal).

### Data Models to Build

| Model | Collection | Key Fields |
|-------|-----------|-----------|
| ChatConversation | chatconversations | userId, staffId, orderId, status, unreadCounts |
| ChatMessage | chatmessages | conversationId, senderId, type, content(redacted), contentOriginal(encrypted) |
| CannedResponse | cannedresponses | title, content, category, isGlobal |
| WhatsAppConfig | whatsappconfigs | phoneNumberId, accessToken(encrypted), isConnected |
| WhatsAppMessage | whatsappmessages | direction, contactId, waMessageId, messageType, content, conversationWindowExpiresAt |
| SupportTicket | supporttickets | ticketNumber, userId, category, priority, status, slaDeadline, slaBreached, messages[] |

### Endpoints to Build

- Chat: 11 endpoints (SS15.4)
- WhatsApp: 9 endpoints (SS16.3)
- Tickets: 12 endpoints (SS21.5)

### Invariants to Enforce

CHT-INV-01 through CHT-INV-07, WHA-INV-01 through WHA-INV-08, TKT-INV-01 through TKT-INV-07

### Key Implementation Notes

1. **Socket.io:** Redis adapter for horizontal scaling. JWT auth on connection. Sticky sessions via ALB.
2. **TFN redaction:** Regex pre-save hook. Original encrypted separately.
3. **WhatsApp window:** Track per contact. Freeform only within 24hr of last inbound.
4. **Media download:** BullMQ immediate job. Meta CDN URLs expire in 30 min.
5. **SLA engine:** BullMQ cron every 5 min. Business hours: Mon-Fri 9-5 AEST (tax season: Mon-Sat 8-8).
6. **Auto-escalation:** Unassigned urgent >30min, SLA imminent at 80%, SLA breach.

### BullMQ Jobs

- SLA check (every 5 min)
- Ticket auto-close (waiting_on_client > 7 days)
- WhatsApp media download (on webhook)
- Chat auto-archive (> 2 years)
- No-show appointment (30min after end)

### Deliverables

- [ ] Real-time chat with Socket.io
- [ ] TFN auto-redaction
- [ ] WhatsApp two-way messaging
- [ ] Support ticket system with SLA
- [ ] Auto-escalation working
- [ ] Canned responses

---

## Phase 8: Engagement Modules

**Duration:** 4 weeks
**Team:** 1 BE + 1 FE
**Prerequisite:** Phase 3 (Orders), Phase 5 (Broadcast infra)

### Scope

Tax Calendar (ATO deadline seed data, reminder scheduling, cron processing, client calendar UI), Reviews (auto-request, Google prompt non-gated, Slack alerts, staff scores), Referral Engine (codes, tracking, rewards, admin config, leaderboard).

### Data Models to Build

| Model | Collection | Key Fields |
|-------|-----------|-----------|
| TaxDeadline | taxdeadlines | title, deadlineDate, type, applicableTo, reminderSchedule[], financialYear |
| Review | reviews | userId, orderId, staffId, rating(1-5), npsScore(0-10), googleReviewClicked, status |
| Referral | referrals | referralCode, referrerId, refereeId, status, rewardType, referrerRewardAmount |
| ReferralConfig | referralconfigs | isEnabled, rewardType, referrerRewardValue, refereeRewardValue, maxReferralsPerClient |

### Endpoints to Build

- Calendar: 6 endpoints (SS17.3)
- Reviews: 7 endpoints (SS18.2)
- Referrals: 11 endpoints (SS19.3)

### Invariants to Enforce

CAL-INV-01 through CAL-INV-04, REV-INV-01 through REV-INV-05, REF-INV-01 through REF-INV-07

### Key Implementation Notes

1. **Calendar:** Skip reminders for already-filed clients. Weekend/holiday shift. State-aware public holidays.
2. **Reviews:** Google prompt for ALL ratings (non-gated, Google ToS). NPS on separate screen. Rating 1-2 triggers Slack alert.
3. **Referrals:** Reward requires 3 conditions: completed order + succeeded payment + minimum value. Self-referral prevention. Max per year.

### Seed Data

Australian Tax Calendar: Individual deadline (31 Oct), BAS quarterly (28th of month), Super Guarantee quarterly, PAYG instalments, FBT (21 May).

### Deliverables

- [ ] Tax calendar with smart reminders
- [ ] Review system with Google integration
- [ ] Referral engine with rewards
- [ ] Admin config for all three modules

---

## Phase 9: Revenue Intelligence

**Duration:** 4 weeks
**Team:** 1 BE + 1 FE
**Prerequisite:** Phases 1-8 (data across all modules)

### Scope

Analytics aggregation on read replica, Executive dashboard, Revenue forecast (industry benchmarks year 1), CLV scoring, Staff benchmarking, Channel ROI, Seasonal trends, Churn risk, Collection rate, Ticket SLA metrics, Export to PDF/Excel, 5-min Redis cache.

### Endpoints to Build

11 endpoints per SS20.2: executive-summary, revenue-forecast, clv, staff-benchmark, channel-roi, seasonal-trends, churn-risk, service-mix, collection-rate, pipeline-health, export.

### Invariants to Enforce

ANA-INV-01 through ANA-INV-07

### Key Implementation Notes

1. **Read replica ONLY.** Separate MongoDB connection string for analytics. NEVER hit primary.
2. **Revenue = Payment.status in [succeeded, captured].** Not Order.finalAmount.
3. **Pre-computed:** Executive summary runs as BullMQ job every 5 min. Served from cache.
4. **Year 1:** Configurable industry benchmarks for forecast. Display "Estimated" label.

### Dashboard Widgets (FE)

- Revenue Forecast (pipeline value x conversion probability)
- Client Lifetime Value (VIP identification)
- Staff Productivity (orders/time, conversion rate, rating)
- Channel ROI (cost per acquisition)
- Seasonal Trends (YoY filing volume)
- Churn Risk (filed last year, not this year)
- Service Mix (revenue by service)
- Collection Rate (payment timeliness)
- Lead Pipeline Health

### Deliverables

- [ ] Executive dashboard with all 9 widgets
- [ ] Revenue forecasting
- [ ] CLV scoring
- [ ] Staff benchmarking
- [ ] Export to PDF/Excel
- [ ] All queries on read replica, cached 5 min

---

## Phase 10: Polish & Hardening

**Duration:** 3 weeks
**Team:** Full team (3 BE + 2 FE + 1 QA)
**Prerequisite:** All previous phases

### Scope

Integration testing (all cross-module flows), Load testing (500 concurrent, 50 req/sec), Security audit (OWASP Top 10), i18n foundation (i18next), Monitoring setup (Datadog/CloudWatch), CI/CD pipelines, OpenAPI documentation, Notification preference centre, Circuit breaker implementation, Permission anomaly detection activation.

### Workstreams

**BE Team:**
- Integration test suite: end-to-end flows across all modules
- Circuit breaker implementation for all external services
- Permission anomaly detection cron (hourly)
- i18n foundation (i18next for backend messages)
- OpenAPI 3.0 auto-generation from validators

**FE Team:**
- Notification preference centre (all channels)
- i18n foundation (React i18next)
- Accessibility audit (WCAG 2.1 AA)

**QA:**
- Load testing: 500 concurrent users, 50 req/sec
- Security audit: OWASP Top 10 checklist
- Cross-module integration test scenarios

**DevOps (shared):**
- Monitoring: Datadog/CloudWatch setup
- CI/CD: GitHub Actions for all 4 apps (lint -> test -> build -> deploy)
- Staging + production environments

### Cross-Module Integration Tests

| Test | Modules | Flow |
|------|---------|------|
| Signup to filing | Auth, Orders, Tax, Payments, Xero, Reviews | Full client lifecycle |
| Lead to revenue | Leads, Users, Orders, Payments, Analytics | Full conversion pipeline |
| Broadcast to conversion | Broadcast, Leads, Orders, Analytics | Campaign ROI tracking |
| WhatsApp to vault | WhatsApp, Vault, Orders | Document flow |
| Support lifecycle | Chat, Tickets, Reviews, Analytics | Full support cycle |

### NFRs Validated

- NFR-15: 500 concurrent users, 50 req/sec
- NFR-18: WCAG 2.1 AA
- NFR-19: i18n foundation
- NFR-20: APM monitoring
- NFR-21: Slack alerting
- NFR-22: CI/CD pipelines
- NFR-25: Circuit breakers
- NFR-31: Permission anomaly detection

### Deliverables

- [ ] All integration tests passing
- [ ] Load test passing (500 users, 50 req/sec)
- [ ] Security audit clean (OWASP Top 10)
- [ ] Monitoring and alerting operational
- [ ] CI/CD pipelines for all 4 apps
- [ ] OpenAPI documentation generated
- [ ] Notification preference centre
- [ ] Circuit breakers on all external services
- [ ] Production-ready

---

## Summary Timeline

```
Week  1-4:   Phase 0 (Foundation)           [2 BE]
Week  5-9:   Phase 1 (Payments)             [2 BE + 1 FE]
Week  9-12:  Phase 2 (Xero)                 [1 BE + 1 FE]  -- parallel with Phase 3 start
Week  9-14:  Phase 3 (Lead & Order Core)    [2 BE + 2 FE]
Week 15-18:  Phase 4 (Lead Adv + Tax)       [2 BE + 1 FE]
Week 19-23:  Phase 5 (Broadcast)            [2 BE + 1 FE]
Week 24-29:  Phase 6 (Client Portal)        [1 BE + 2 FE]
Week 30-35:  Phase 7 (Communication)        [2 BE + 2 FE]
Week 36-39:  Phase 8 (Engagement)           [1 BE + 1 FE]
Week 40-43:  Phase 9 (Analytics)            [1 BE + 1 FE]
Week 44-46:  Phase 10 (Polish)              [Full team]
```

**MVP (Phases 0-3): ~19 weeks** with full team.
**Full platform: ~46-51 weeks** with 6-person team.
**With 2-3 developers: 16-20 months minimum.**

---

## Risk Registry

| Risk | Impact | Mitigation |
|------|--------|-----------|
| ATO changes tax brackets mid-build | Re-seed tax rules | Tax rules as DATA not code. Admin can update without deploy. |
| Xero API rate limits hit during bulk sync | Sync delays | Token bucket rate limiter. Queue with backoff. |
| ClamAV false positives on client uploads | Support load | Manual review queue. Admin can override quarantine. |
| Stripe/Payzoo downtime | Payment failures | Gateway fallback pattern. Maintenance mode toggle. |
| Meta WhatsApp quality rating drops | Message throttling | Monitor quality rating. Template approval process. |
| MongoDB transaction failures (conversion) | Data inconsistency | Retry logic. Compensating transactions. |
| Storage costs escalate | Budget | Per-user quotas. Orphaned file detection. Glacier archival. |

---

## Invariant Count by Phase

| Phase | Invariant Prefixes | Count |
|-------|-------------------|-------|
| 0 | RBAC-INV, PRM-INV, SEC-INV | 33 |
| 1 | PAY-INV, BIL-INV | 20 |
| 2 | XRO-INV | 11 |
| 3 | LM-INV, ORD-INV, RVW-INV | 29 |
| 4 | TAX-INV, VER-INV | 26 |
| 5 | BRC-INV | 10 |
| 6 | CPV-INV, STR-INV, DOC-INV | 21 |
| 7 | CHT-INV, WHA-INV, TKT-INV | 22 |
| 8 | CAL-INV, REV-INV, REF-INV | 16 |
| 9 | ANA-INV | 7 |
| 10 | (validation of all above) | — |
| **Total** | | **~195** |
