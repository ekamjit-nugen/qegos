# QEGOS Tech Stack Documentation

**Product:** QEGOS — Tax Preparation, Filing & Client Management Platform
**Market:** Australia
**Date:** 2026-04-07
**Source:** QEGOS Final Production PRD v4.0

---

## Stack Overview

| Layer | Technology | Version / Details | Purpose |
|-------|-----------|-------------------|---------|
| Backend API | Node.js + Express | — | Core business logic, REST APIs, webhooks, cron jobs |
| Admin Dashboard | React 17 + Ant Design + Redux + BizCharts | — | Staff and admin operations |
| Mobile App | React Native 0.71 + Redux + React Navigation | — | Client-facing + Staff Lead Companion |
| Web App | React 17 + Ant Design + Redux + React Router v5 | — | Client-facing tax filing + Client Portal |
| Database | MongoDB Atlas M30+ | ap-southeast-2 (Sydney) | Document store, read replica for analytics |
| ODM | Mongoose | — | MongoDB object data modelling |
| Cache / Pub-Sub | Redis Cluster (ElastiCache) | — | Session store, Socket.io adapter, rate limiting, analytics cache, distributed locks |
| File Storage | AWS S3 | ap-southeast-2 | SSE-S3 encryption, cross-region replication for vault |
| Message Queue | BullMQ (Redis-backed) | — | Async job processing |
| Real-time | Socket.io + Redis Adapter | — | Chat, live notifications, presence |
| CI/CD | GitHub Actions | — | Automated lint, test, build, deploy for all 4 apps |
| Monitoring | Datadog / CloudWatch | — | APM, logs, metrics, alerting |

---

## Application Components

### Backend API (`qegos-api/`)

| Component | Technology | Notes |
|-----------|-----------|-------|
| Runtime | Node.js | Server-side JavaScript |
| Framework | Express | REST API framework |
| ODM | Mongoose | Schema validation, hooks, middleware |
| Validation | express-validator | Input validation on every endpoint |
| Auth | JWT (jsonwebtoken) | 15-min access + 7-day refresh tokens |
| Password Hashing | bcrypt (cost factor 12) | Min 8 chars, 1 uppercase, 1 number |
| Encryption | AES-256-GCM | TFN, Xero tokens, payment tokens (field-level) |
| Security Headers | Helmet.js | CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff |
| CORS | cors() | Explicit origin whitelist, no wildcards |
| Rate Limiting | express-rate-limit + Redis store | Per-endpoint configuration |
| Logging | Winston (JSON structured) | Correlation ID per request, CloudWatch/Datadog shipping |
| File Upload | Multer | MIME validation, size limits |
| File Type Validation | file-type (npm) | Magic bytes validation, not just extensions |
| Virus Scanning | ClamAV | Pre-storage scanning, quarantine bucket for infected files |
| API Docs | OpenAPI 3.0 (auto-generated) | Swagger UI at `/api/docs` (admin only) |

### Admin Dashboard (`qegos-admin/`)

| Component | Technology | Notes |
|-----------|-----------|-------|
| UI Framework | React 17 | SPA |
| Component Library | Ant Design | Enterprise UI components |
| State Management | Redux | Global state |
| Charts | BizCharts | Analytics dashboards, revenue forecasting, pipeline visualization |
| Routing | — | Admin routes with role-based guards |

### Mobile App (`qegos-mobile/`)

| Component | Technology | Notes |
|-----------|-----------|-------|
| Framework | React Native 0.71 | Cross-platform iOS/Android |
| State Management | Redux | Shared state patterns with web |
| Navigation | React Navigation | Stack + Tab navigators |
| Push Notifications | Firebase Cloud Messaging (FCM) | Token management per device |
| Secure Storage | Platform secure storage | Refresh tokens stored securely |

### Web App (`qegos-web/`)

| Component | Technology | Notes |
|-----------|-----------|-------|
| UI Framework | React 17 | Client-facing SPA |
| Component Library | Ant Design | Consistent design system |
| State Management | Redux | Shared patterns with admin |
| Routing | React Router v5 | Client portal routes |

---

## Infrastructure

### Database Layer

| Service | Config | Purpose |
|---------|--------|---------|
| MongoDB Atlas M30+ | ap-southeast-2 (Sydney) | Primary data store |
| Read Replica | Same region | Analytics queries (ANA-INV-01: analytics NEVER hit primary) |
| Backup | Continuous backup, 7-day PITR | Disaster recovery |
| Indexes | Per-model defined in PRD | Compound, text, partial, TTL as specified |

**Key design decisions:**
- All monetary values stored as integer cents (no floating point)
- Soft delete pattern across all user-facing data (`isDeleted` flag)
- Field-level AES-256-GCM encryption for sensitive data (TFN, Xero tokens)
- Audit logs: append-only collection, no updates/deletes, 7-year retention (ATO requirement)

### Cache Layer (Redis Cluster / ElastiCache)

| Use Case | TTL | Notes |
|----------|-----|-------|
| Session store | 7 days | Refresh token sessions |
| Socket.io adapter | — | Horizontal scaling for real-time |
| Rate limiting | Per-endpoint | Auth: 5/15min, API: 100/min per user |
| Analytics cache | 5 min | Stale-while-revalidate pattern (ANA-INV-06) |
| Role/permission cache | 5 min | Invalidated on role update (RBAC-INV-11) |
| Idempotency keys | 24 hours | Financial POST endpoints (PAY-INV-01) |
| Notification dedup | 5 min | Same type + recipient + resource (NTF-INV-05) |
| Xero token mutex | 5 sec | Redlock for token refresh (XRO-INV-02) |
| Bulk access counter | 1 hour | Per-user access tracking (PRM-INV-06) |
| Upload semaphore | — | Max 5 concurrent uploads per user |

### File Storage (AWS S3)

| Bucket / Path | Purpose | Encryption | Notes |
|---------------|---------|------------|-------|
| `orders/{orderId}/{filename}` | Order documents | SSE-S3 | Max 10 files/order, 20MB each |
| `vault/{userId}/{financialYear}/{uuid}-{filename}` | Document vault | SSE-S3 | Per-user isolation, quota enforced |
| Quarantine bucket | Infected files | SSE-S3 | ClamAV positive results |
| Glacier (archive) | Audit logs > 12 months | SSE-S3 | Monthly archival cron |

**Access control:** Presigned URLs with 15-minute expiry. No permanent public URLs (DOC-INV-05, CPV-INV-03).

**Cross-region replication** enabled for vault bucket (disaster recovery).

### Message Queue (BullMQ)

All async job processing runs on BullMQ backed by Redis.

| Queue / Job | Schedule | Purpose |
|-------------|----------|---------|
| XeroSyncWorker | Event-driven | Invoice creation, payment sync, credit notes |
| process-sms-queue | Every 5 min | Broadcast SMS (batch 2500, 10/sec rate) |
| process-email-queue | Every 5 min | Broadcast email (batch 500, 100/sec rate) |
| process-whatsapp-queue | Every 5 min | Broadcast WhatsApp (batch 500, 80/sec rate) |
| trigger-scheduled | Every 1 min | Start scheduled campaigns |
| sync-delivery-status | Every 15 min | Poll Twilio for SMS delivery updates |
| check-campaign-completion | Every 10 min | Mark completed campaigns |
| process-bounces | Continuous (SES SNS) | Bounce/complaint handling |
| SLA check | Every 5 min | Ticket SLA deadline monitoring |
| Permission anomaly detection | Every hour | RBAC misconfiguration scanning |
| Audit log archival | 1st of month | Archive >12-month records to S3 Glacier |
| Storage reconciliation | Monthly | Reconcile storageUsed vs actual file sizes |
| Overdue reminder marker | Cron | Set isOverdue on lead reminders |
| Auto-dormant leads | Cron | Contacted + 14 days no activity -> Dormant |
| Stale lead alert | Cron | New lead > 24hr no activity -> alert |
| Review request | Event + 24hr delay | Post-order-completion review scheduling |
| No-show marker | Cron | Auto-mark missed appointments |
| Ticket auto-close | Cron | waiting_on_client > 7 days -> close |
| Orphaned file detection | Weekly | S3 objects without matching DB record |

### Real-time (Socket.io)

| Feature | Details |
|---------|---------|
| Transport | WebSocket with long-polling fallback |
| Scaling | Redis adapter for horizontal scaling |
| Authentication | JWT on connection, expired token = forced disconnect (CHT-INV-06) |
| Rooms | `conversation_{id}` per chat |
| Sticky sessions | Via ALB (NFR-28) |
| Fallback | Offline users receive FCM push notification |

**Events:**

| Event | Direction | Payload |
|-------|-----------|---------|
| `new_message` | Server -> Client | `{conversationId, message}` |
| `message_read` | Server -> Client | `{conversationId, messageId, readAt}` |
| `typing_indicator` | Bidirectional | 3-sec debounce, 10-sec auto-expire |
| `conversation_resolved` | Server -> Client | Conversation status |
| `staff_presence` | Server -> Client | Online/offline status |

---

## Third-Party Integrations

### Payment Gateways

| Service | Purpose | Auth | Rate Limits | Integration Pattern |
|---------|---------|------|-------------|-------------------|
| **Stripe** | Primary payment gateway | API Key (server) + Publishable Key (client) | 100 req/sec | PaymentIntent flow, webhook (signature verified via `stripe.webhooks.constructEvent()`) |
| **Payzoo** | Secondary/fallback gateway | API Key + HMAC webhook | TBD | Gateway Abstraction Layer, HMAC-SHA256 signature verification |

**Gateway routing rules:** `primary_only`, `fallback`, `round_robin`, `amount_based` (configurable via `paymentGatewayConfig`).

**Fallback logic (PAY-INV-08):** Triggers ONLY on network timeout (ETIMEDOUT, ECONNREFUSED), 5xx responses, or gateway maintenance. NEVER on business errors (card_declined, insufficient_funds).

### Accounting

| Service | Purpose | Auth | Rate Limits |
|---------|---------|------|-------------|
| **Xero** | Invoice sync, payment reconciliation, credit notes | OAuth 2.0 (30-min access token, auto-refresh) | 60 calls/minute per tenant |

**Key details:**
- Access and refresh tokens encrypted with AES-256-GCM before storage (XRO-INV-01)
- Token refresh uses Redis distributed lock (Redlock, 5-sec TTL) to prevent race conditions (XRO-INV-02)
- Token bucket rate limiter wraps all Xero API calls (XRO-INV-03)
- Sync failures retry with exponential backoff: 1min -> 5min -> 30min -> 2hr, then Slack alert (XRO-INV-05)
- xero-node SDK used

### Communication

| Service | Purpose | Auth | Rate Limits | Use Case |
|---------|---------|------|-------------|----------|
| **Twilio** | SMS (OTP + broadcast) | Account SID + Auth Token | OTP: unlimited, Broadcast: 10 msg/sec | Auth OTP, broadcast campaigns, deadline reminders |
| **Amazon SES** | Email campaigns | IAM credentials | 100 emails/sec (production) | Broadcast email, bounce handling, DKIM |
| **Gmail SMTP** (Nodemailer) | Transactional email | SMTP credentials | Low volume only | OTP, password reset, order status |
| **Firebase (FCM)** | Push notifications | Service Account JSON | No practical limit | All notification types |
| **Meta Cloud API** | WhatsApp Business | System User Token + Webhook Verify Token | 80 msg/sec (business-initiated) | Two-way messaging, template messages, media |

**Architecture note (PRD SS13.1):** Gmail SMTP is NOT used for broadcasts. Gmail limits (500/day regular, 2000/day Workspace) are inadequate for marketing campaigns. Amazon SES handles all campaign email.

### Document Signing

| Service | Purpose | Auth | Rate Limits |
|---------|---------|------|-------------|
| **Zoho Sign** | Primary document signing | OAuth 2.0 | 100 API calls/day (free), 500/day (paid) |
| **DocuSign** | Alternative signing | OAuth 2.0 + JWT | 1000 calls/hour |

### Internal Alerts

| Service | Purpose | Auth | Rate Limits |
|---------|---------|------|-------------|
| **Slack Webhooks** | Internal alerts | Webhook URL | 1 msg/sec per webhook |

**Alert triggers:** OTP logs, stale lead alerts, failed payments, review alerts, SLA breaches, permission escalations, Xero sync failures, high error rates, security events.

---

## Security Stack

### Authentication

| Mechanism | Details |
|-----------|---------|
| Access Token | JWT, 15-minute lifetime, stored in memory only (never localStorage) |
| Refresh Token | JWT, 7-day lifetime, httpOnly secure cookie (web) / secure storage (mobile) |
| Token Rotation | Every refresh use issues new token, invalidates old. Reuse = revoke ALL (SEC-INV-04) |
| Max Sessions | 5 concurrent per user. New login at max revokes oldest (SEC-INV-06) |
| Password Change | Invalidates all JWTs issued before `passwordChangedAt` (SEC-INV-05) |
| OTP | 5-minute expiry, single use, deleted after verification (SEC-INV-08) |
| Account Lockout | 10 failed attempts = 30-minute lockout (SEC-INV-02) |
| MFA | TOTP support (authenticator apps), secret encrypted at rest |

### Authorization (RBAC)

| Component | Details |
|-----------|---------|
| Middleware | `checkPermission(resource, action)` on every endpoint |
| Scope Filtering | `all`, `assigned`, `own`, `none` — injected as `req.scopeFilter` |
| Role Cache | Redis with 5-min TTL, invalidated on role update |
| Permission Audit | Hourly anomaly detection, snapshots on every role change |
| Roles | super_admin, admin, office_manager, senior_staff, staff, client, student |

### Encryption

| Layer | Method | Scope |
|-------|--------|-------|
| At Rest (S3) | SSE-S3 | All file storage |
| At Rest (MongoDB) | AES-256-GCM | TFN, Xero tokens, MFA secrets |
| In Transit | TLS 1.2+ | All endpoints |
| Mobile | Certificate pinning | React Native app |
| Passwords | bcrypt (cost 12) | User passwords |
| Refresh Tokens | bcrypt hash | Stored hashed, never plaintext (SEC-INV-03) |

### Input / Output Security

| Control | Implementation |
|---------|---------------|
| Input Validation | express-validator on EVERY endpoint (SEC-INV-12) |
| Output Sanitization | No stack traces, file paths, or internals in production (SEC-INV-13) |
| CORS | Explicit origin whitelist: admin domain, web app domain, mobile deep link schemes (SEC-INV-11) |
| Security Headers | Helmet.js: CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff (SEC-INV-10) |
| SQL/NoSQL Injection | Parameterised Mongoose queries only, no string interpolation (SEC-INV-14) |
| File Upload | MIME magic-byte validation + ClamAV scan + size limits (SEC-INV-15) |
| TFN Redaction | Chat messages auto-redact TFN patterns; original encrypted separately (CHT-INV-01) |

### Rate Limiting

| Endpoint Category | Limit | Enforcement |
|-------------------|-------|-------------|
| OTP send | 3 per mobile per 15 min | express-rate-limit + Redis |
| OTP verify | 5 attempts per OTP | express-rate-limit + Redis |
| Sign in | 5 per email per 15 min | express-rate-limit + Redis |
| Forgot password | 3 per email per hour | express-rate-limit + Redis |
| General API | 100 per min per user | express-rate-limit + Redis |
| File upload | 20 files per 10 min per user | express-rate-limit keyed on userId |
| Upload bandwidth | 100MB per 10 min per user | Custom middleware |
| Concurrent uploads | 5 simultaneous per user | Redis semaphore |

---

## CI/CD Pipeline (GitHub Actions)

**Pipeline stages:** Lint -> Test -> Build -> Deploy

**Environments:** Staging + Production

**Scope:** All 4 application components (`qegos-api`, `qegos-admin`, `qegos-mobile`, `qegos-web`)

---

## Monitoring & Alerting

| Tool | Purpose |
|------|---------|
| Datadog / New Relic | APM: P50/P95/P99 latencies, error rates, dependency health |
| CloudWatch | Log aggregation, metrics |
| Slack Webhooks | Real-time alerts for critical events |

**Structured logging:** JSON format via Winston, correlation ID per request, shipped to CloudWatch/Datadog.

**Health check endpoints:**

| Endpoint | Auth | Checks |
|----------|------|--------|
| `GET /health` | Public | Shallow: app running, uptime, version |
| `GET /health/deep` | Admin | Deep: MongoDB, Redis, S3, Xero, Stripe, Twilio status |

---

## Circuit Breaker Pattern (NFR-25)

All external service integrations behind circuit breakers:

| Service | Open After | Half-Open After |
|---------|-----------|-----------------|
| Xero | 5 failures | 30 seconds |
| Stripe | 5 failures | 30 seconds |
| Payzoo | 5 failures | 30 seconds |
| Twilio | 5 failures | 30 seconds |
| Amazon SES | 5 failures | 30 seconds |
| Meta Cloud API | 5 failures | 30 seconds |

---

## Non-Functional Requirements Summary

| Requirement | Target |
|-------------|--------|
| Concurrent Users | 500 |
| Sustained Throughput | 50 req/sec |
| Lead Capacity | 10K leads |
| Order Capacity | 50K orders |
| Audit Retention | 7 years (ATO) |
| Backup | Continuous, 7-day PITR |
| API Versioning | `/api/v1/`, breaking changes under `/api/v2/` with 6-month deprecation |
| Accessibility | WCAG 2.1 AA (web + portal) |
| i18n | English primary; Chinese, Hindi, Punjabi, Vietnamese planned |
| Privacy Compliance | Privacy Act 1988 + Australian Privacy Principles (APPs) |
| Anti-Spam Compliance | Spam Act 2003 |

---

## 38 MongoDB Collections

| # | Model | Collection | PRD Section |
|---|-------|-----------|-------------|
| 1 | User | users | SS6 |
| 2 | Role | roles | SS2 |
| 3 | AuditLog | auditlogs | SS2 |
| 4 | PermissionSnapshot | permissionsnapshots | SS2 |
| 5 | OTP | otps | SS3 |
| 6 | Notification | notifications | SS5 |
| 7 | NotificationPreference | notificationpreferences | SS5 |
| 8 | Order | orders | SS7 |
| 9 | Sales | sales | SS7 |
| 10 | ReviewAssignment | reviewassignments | SS7 |
| 11 | TaxRuleConfig | taxruleconfigs | SS8 |
| 12 | TaxEstimateLog | taxestimatelogs | SS8 |
| 13 | TaxReturnResult | taxreturnresults | SS8 |
| 14 | Payment | payments | SS9 |
| 15 | PaymentGatewayConfig | paymentgatewayconfigs | SS9 |
| 16 | WebhookEvent | webhookevents | SS9 |
| 17 | BillingDispute | billingdisputes | SS9 |
| 18 | XeroSyncLog | xerosynclogs | SS10 |
| 19 | VaultDocument | vaultdocuments | SS14 |
| 20 | TaxYearSummary | taxyearsummaries | SS14 |
| 21 | Lead | leads | SS12 |
| 22 | LeadActivity | leadactivities | SS12 |
| 23 | LeadReminder | leadreminders | SS12 |
| 24 | BroadcastCampaign | broadcastcampaigns | SS13 |
| 25 | BroadcastTemplate | broadcasttemplates | SS13 |
| 26 | BroadcastMessage | broadcastmessages | SS13 |
| 27 | BroadcastOptOut | broadcastoptouts | SS13 |
| 28 | ConsentRecord | consentrecords | SS13 |
| 29 | ChatConversation | chatconversations | SS15 |
| 30 | ChatMessage | chatmessages | SS15 |
| 31 | CannedResponse | cannedresponses | SS15 |
| 32 | WhatsAppConfig | whatsappconfigs | SS16 |
| 33 | WhatsAppMessage | whatsappmessages | SS16 |
| 34 | TaxDeadline | taxdeadlines | SS17 |
| 35 | Review | reviews | SS18 |
| 36 | Referral | referrals | SS19 |
| 37 | ReferralConfig | referralconfigs | SS19 |
| 38 | SupportTicket | supporttickets | SS21 |
