<!--
  QEGOS FINAL PRODUCTION PRD v4.0
  Target Market: Australia
  Consolidated: April 2026
  Classification: Confidential — Engineering Reference
  
  THIS IS THE SINGLE SOURCE OF TRUTH.
  All supplement files (Tax Engine, Versioning, Gaps 8-13) have been merged.
  Do NOT reference the v3 PRD or any supplement files — they are superseded.
  
  Modules: 26 sections | ~210 API endpoints | ~160 invariants | 37 data models
-->

# QEGOS — Final Production-Grade Platform PRD v4.0

**Australia Market | April 2026 | Confidential — Engineering Reference**

**This is the SINGLE SOURCE OF TRUTH. All prior documents are superseded.**

---

## 1. SYSTEM OVERVIEW

QEGOS is a tax preparation, filing, and client management platform for the Australian market. It serves registered tax agents, BAS agents, and their clients through four application surfaces, with an extensible module architecture covering the full client lifecycle: lead capture → engagement → filing → payment → retention → referral.

### 1.1 Application Components

| Component | Tech Stack | Location | Purpose |
|-----------|-----------|----------|---------|
| Backend API | Node.js, Express, MongoDB, Mongoose | qegos-api/ | Core business logic, REST APIs, webhooks, cron jobs |
| Admin Dashboard | React 17, Ant Design, Redux, BizCharts | qegos-admin/ | Staff and admin operations |
| Mobile App | React Native 0.71, Redux, React Navigation | qegos-mobile/ | Client-facing + Staff Lead Companion |
| Web App | React 17, Ant Design, Redux, React Router v5 | qegos-web/ | Client-facing tax filing + Client Portal |

### 1.2 Infrastructure

| Layer | Technology | Details |
|-------|-----------|---------|
| Database | MongoDB Atlas M30+ | ap-southeast-2 (Sydney), read replica for analytics |
| Cache / Pub-Sub | Redis Cluster (ElastiCache) | Session store, Socket.io adapter, rate limiting, analytics cache, distributed locks |
| File Storage | AWS S3 | ap-southeast-2, SSE-S3 encryption at rest, cross-region replication for vault |
| Message Queue | BullMQ (Redis-backed) | Async job processing: Xero sync, broadcast sends, webhook processing |
| Real-time | Socket.io + Redis Adapter | Chat, live notifications, presence |
| Email (Transactional) | Gmail SMTP via Nodemailer | OTP, password reset, order status — low volume only |
| Email (Marketing) | Amazon SES | Broadcast campaigns, review requests, deadline reminders |
| SMS | Twilio | OTP, broadcast SMS, deadline reminders |
| Push Notifications | Firebase Cloud Messaging (FCM) | Mobile push for all notification types |
| WhatsApp | Meta Cloud API (WhatsApp Business) | Two-way messaging, template messages, media |
| Document Signing | Zoho Sign / DocuSign | Tax return signing, engagement letters |
| Payments | Stripe + Payzoo (via Gateway Abstraction) | Card payments, refunds, multi-gateway routing |
| Accounting | Xero (xero-node SDK, OAuth 2.0) | Invoice sync, payment reconciliation |
| Internal Alerts | Slack Webhooks | OTP logs, stale lead alerts, failed payments, review alerts |
| Monitoring | Datadog / CloudWatch | APM, logs, metrics, alerting |
| CI/CD | GitHub Actions | Automated test, build, deploy for all 4 apps |

### 1.3 Australian Localisation Context

| Aspect | Australia Specifics |
|--------|-------------------|
| Tax Authority | ATO (Australian Taxation Office) |
| Individual Tax ID | TFN (Tax File Number) — 9 digits, XXX XXX XXX |
| Business Tax ID | ABN (Australian Business Number) — 11 digits |
| Tax Year | 1 July – 30 June (FY2025 = 1 Jul 2024 – 30 Jun 2025) |
| Currency | AUD (Australian Dollar). All amounts stored as integer cents. |
| GST | 10% Goods and Services Tax. Reported via BAS (Business Activity Statement). |
| PAYG | Pay As You Go withholding and instalments |
| Superannuation | Employer-paid retirement contributions (currently 11.5%) |
| Key Tax Forms | Individual Tax Return (ITR), BAS, IAS, PAYG Summary |
| Key Tax Slips | PAYG Payment Summary (equivalent of T4), Dividend Statement, Interest Statement, Private Health Insurance Statement |
| Filing Deadline (Individual) | 31 October (self-lodgement) or varies by tax agent lodgement program |
| Filing Deadline (BAS) | Quarterly: 28th of month following quarter end |
| Tax Agent Registration | Must be registered with TPB (Tax Practitioners Board) |
| Privacy Law | Privacy Act 1988 + Australian Privacy Principles (APPs) |
| Anti-Spam | Spam Act 2003 (requires consent, identification, unsubscribe) |
| Phone Format | E.164: +61XXXXXXXXX (9 digits after country code) |
| States/Territories | NSW, VIC, QLD, SA, WA, TAS, NT, ACT |
| Medicare Levy | 2% of taxable income (+ 1-1.5% surcharge if no PHI above threshold) |
| HECS-HELP | Student loan repayment based on income thresholds |
| Negative Gearing | Investment property loss offset against income |
| CGT Discount | 50% discount on capital gains held > 12 months |

### 1.4 Third-Party Integrations

| Integration | Purpose | Auth Method | Rate Limits |
|------------|---------|-------------|-------------|
| Stripe | Primary payment gateway | API Key (server) + Publishable Key (client) | 100 req/sec |
| Payzoo | Secondary payment gateway | API Key + HMAC webhook | TBD — document after integration |
| Xero | Accounting sync | OAuth 2.0 (30-min access token, auto-refresh) | 60 calls/minute per tenant |
| Twilio | SMS (OTP + broadcast) | Account SID + Auth Token | 10 msg/sec (broadcast), unlimited (OTP) |
| Amazon SES | Email campaigns | IAM credentials | 100 emails/sec (production) |
| Firebase | Push notifications | Service Account JSON | No practical limit |
| Meta Cloud API | WhatsApp Business | System User Token + Webhook Verify Token | 80 msg/sec (business-initiated) |
| Zoho Sign | Document signing | OAuth 2.0 | 100 API calls/day (free tier), 500/day (paid) |
| DocuSign | Document signing (alt) | OAuth 2.0 + JWT | 1000 calls/hour |
| AWS S3 | File storage | IAM Role (EC2) or Access Key | No practical limit |
| Slack | Internal alerts | Webhook URL | 1 msg/sec per webhook |

---


---

## 2. USER TYPES, ROLES & RBAC

### 2.1 User Types

| Type | ID | Description | Access Surfaces |
|------|-----|------------|-----------------|
| Super Admin | 0 | Platform owner/operator | Admin Dashboard (full access) |
| Admin | 1 | System administrator | Admin Dashboard (full access) |
| Office Manager | 5 | Branch/office manager | Admin Dashboard (operational access) |
| Senior Staff | 6 | Senior tax professional/reviewer | Admin Dashboard (limited) + Mobile Lead Companion |
| Staff | 3 | Tax preparation professional | Admin Dashboard (limited) + Mobile Lead Companion |
| Client | 2 | Individual taxpayer/customer | Mobile App + Web App + Client Portal |
| Student | 4 | Educational institution user (discounted) | Mobile App + Web App + Client Portal |

### 2.2 Role Data Model (role.js)

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| name | String | required, unique, lowercase | Role identifier: super_admin, admin, office_manager, senior_staff, staff, client, student |
| displayName | String | required | Human-readable: "Super Admin", "Office Manager" |
| permissions | Array[Object] | required | [{resource: String, actions: [String], scope: Enum}] |
| permissions[].resource | String | required | Entity type: users, orders, payments, leads, broadcasts, vault_documents, xero_config, payment_config, analytics, reviews, chat, referrals, staff_mgmt, system_config, audit_logs, calendar, whatsapp |
| permissions[].actions | Array[Enum] | required | create, read, update, delete, assign, export, bulk_action |
| permissions[].scope | Enum | required | all — unrestricted access to all records; assigned — only records where assignedTo/processingBy matches actor; own — only records where userId matches actor; none — no access |
| isSystem | Boolean | default: false | System roles cannot be deleted or have permissions reduced below baseline |
| isActive | Boolean | default: true | Disabled roles deny all access |
| createdBy | ObjectId ref User | — | Who created this custom role |
| createdAt / updatedAt | Date | auto | Timestamps |

### 2.3 Permission Matrix (Default Baseline)

| Resource | super_admin | admin | office_manager | senior_staff | staff | client | student |
|----------|-------------|-------|----------------|--------------|-------|--------|---------|
| users | CRUD / all | CRUD / all | R / all | R / assigned | R / assigned | RU / own | RU / own |
| orders | CRUD / all | CRUD / all | CRUD / all | CRUD / assigned | RU / assigned | CR / own | CR / own |
| payments | CRUD / all | CRUD / all | R / all | R / assigned | R / assigned | R / own | R / own |
| leads | CRUD / all | CRUD / all | CRUD / all | CRUD / all | CRUD / assigned | — | — |
| lead_activities | CRUD / all | CRUD / all | CRUD / all | CRUD / all | CRUD / assigned | — | — |
| broadcasts | CRUD / all | CRUD / all | CRU / all | R / all | — | — | — |
| vault_documents | CRUD / all | CRUD / all | RU / all | RU / assigned | R / assigned | CRUD / own | CRUD / own |
| xero_config | CRUD / all | CRUD / all | R / all | — | — | — | — |
| payment_config | CRUD / all | CRUD / all | R / all | — | — | — | — |
| analytics | R / all | R / all | R / all | R / own | R / own | — | — |
| reviews | CRUD / all | CRUD / all | RU / all | R / own | R / own | CRU / own | CRU / own |
| chat | CRUD / all | CRUD / all | R / all | RU / assigned | RU / assigned | RU / own | RU / own |
| referrals | CRUD / all | CRUD / all | R / all | R / all | — | R / own | R / own |
| staff_mgmt | CRUD / all | CRUD / all | RU / all | — | — | — | — |
| system_config | CRUD / all | CRU / all | R / all | — | — | — | — |
| audit_logs | R / all | R / all | — | — | — | — | — |
| calendar | CRUD / all | CRUD / all | CRUD / all | R / all | R / all | R / own | R / own |
| whatsapp_config | CRUD / all | CRUD / all | R / all | — | — | — | — |

### 2.4 Audit Log Data Model (auditLog.js)

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| actor | ObjectId ref User | required | Who performed the action |
| actorType | Enum | required | super_admin, admin, office_manager, senior_staff, staff, client, student, system, cron |
| action | Enum | required | create, read, update, delete, status_change, assign, reassign, login, login_failed, logout, export, bulk_action, convert, merge, refund, void, payment_capture, config_change |
| resource | String | required | Entity type being acted upon |
| resourceId | ObjectId | required | Entity ID |
| resourceNumber | String | — | Human-readable ID (QGS-O-0001, QGS-L-0001) for easy search |
| changes | Object | — | {field: {from: oldValue, to: newValue}} — only for update actions |
| description | String | — | Human-readable summary: "Changed order #QGS-O-0012 status from Processing to Completed" |
| metadata | Object | — | {ipAddress, userAgent, requestMethod, requestPath, sessionId, geoLocation} |
| severity | Enum | required | info — routine operations; warning — sensitive data access (vault docs, payment details); critical — financial mutations, config changes, failed auth |
| timestamp | Date | auto, index | ISO 8601 with timezone |

**Indexes:** {timestamp: -1}, {actor: 1, timestamp: -1}, {resource: 1, resourceId: 1}, {severity: 1, timestamp: -1}, {action: 1, timestamp: -1}

**Retention:** Append-only (no updates, no deletes). 7-year retention (ATO record-keeping requirement). Records older than 12 months archived to S3 Glacier via cron. TTL index disabled.

### 2.5 RBAC Middleware Specification

```
Middleware: checkPermission(resource, action)

Flow:
1. Extract JWT from Authorization header
2. Decode token → get userId, roleId
3. Fetch role from Redis cache (TTL 5min) or MongoDB
4. Find permission entry where permission.resource === resource
5. If no entry → return 403
6. If action not in permission.actions → return 403
7. Based on permission.scope:
   - "all" → proceed, no query filter
   - "assigned" → inject query filter: {assignedTo: userId} OR {processingBy: userId}
   - "own" → inject query filter: {userId: userId}
   - "none" → return 403
8. Attach scopeFilter to req.scopeFilter for use in route handler
9. Proceed to route handler

CRITICAL: Route handlers MUST apply req.scopeFilter to all database queries.
CRITICAL: 403 response is identical regardless of whether resource exists or not (prevent enumeration).
```

### 2.6 RBAC APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| GET /api/v1/roles | GET | super_admin, admin | List all roles with permissions |
| POST /api/v1/roles | POST | super_admin | Create custom role |
| PUT /api/v1/roles/:id | PUT | super_admin | Edit role permissions (cannot reduce system role below baseline) |
| DELETE /api/v1/roles/:id | DELETE | super_admin | Delete custom role (not system roles). Fails if any user assigned. |
| PUT /api/v1/users/:id/role | PUT | admin+ | Assign role to user. AuditLog: severity=critical |
| POST /api/v1/audit-logs | POST | admin+ | Query audit logs. Filters: actor, actorType, action, resource, resourceId, severity, dateRange, search (description). Paginated. |
| POST /api/v1/audit-logs/export | POST | super_admin | Export filtered audit logs as CSV/Excel |
| GET /api/v1/audit-logs/stats | GET | admin+ | Summary: actions/day, top actors, critical events count, failed logins |

### 2.7 RBAC Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| RBAC-INV-01 | Every API endpoint executes checkPermission() before any business logic | Express middleware applied globally, explicit bypass only for public endpoints (webhooks, health check) |
| RBAC-INV-02 | Scope "assigned" means query filter {assignedTo: actorId} OR {processingBy: actorId} is injected into every DB query | req.scopeFilter auto-applied in base query builder |
| RBAC-INV-03 | Scope "own" means query filter {userId: actorId} is injected into every DB query | req.scopeFilter auto-applied in base query builder |
| RBAC-INV-04 | Role changes (assign/modify) require super_admin or admin and create AuditLog with severity=critical | Endpoint guard + post-save middleware |
| RBAC-INV-05 | System roles cannot be deleted, and their permissions cannot be reduced below baseline values defined in seed data | Pre-save validator compares against baseline |
| RBAC-INV-06 | Every mutation (create/update/delete) on orders, payments, invoices, refunds, user data, config creates AuditLog | Mongoose post-save/post-remove middleware on relevant models |
| RBAC-INV-07 | AuditLog collection is append-only. No update operations. No delete operations. No TTL index. | MongoDB collection-level validator rejects update/delete. Application code has no update/delete functions. |
| RBAC-INV-08 | Failed permission checks return standardised 403: {status: 403, code: "FORBIDDEN", message: "Insufficient permissions"} with zero resource-existence information | Middleware response standardisation |
| RBAC-INV-09 | Bulk operations (bulk assign, bulk status change, bulk export) check permissions per item, not once for the batch | Loop validation in bulk handlers. If any item fails, entire batch fails with item-level errors. |
| RBAC-INV-10 | Audit logs retained for 7 years (ATO record-keeping). Monthly archival of records > 12 months to S3 Glacier. | Cron job: first of month, archive + compress to S3 |
| RBAC-INV-11 | Role cache in Redis invalidated on any role update. Max stale time: 5 minutes (TTL). | Cache invalidation in role update handler + TTL |
| RBAC-INV-12 | A user with a disabled role (isActive=false) is treated as having zero permissions and cannot access any endpoint | checkPermission checks role.isActive first |

### 2.8 RBAC Use Cases

| UC-ID | Use Case | Actor | Precondition | Flow | Postcondition |
|-------|----------|-------|--------------|------|---------------|
| RBAC-UC-01 | Staff tries to access another staff's leads | Staff | role=staff, scope=assigned | 1. GET /api/v1/leads 2. Middleware injects filter {assignedTo: staffId} 3. Only assigned leads returned | Staff sees 12 of 200 total leads (their assignments only) |
| RBAC-UC-02 | Client tries to view another client's order | Client | role=client, scope=own | 1. GET /api/v1/orders/:foreignOrderId 2. Middleware injects {userId: clientId} 3. No match (foreign order belongs to different user) 4. Return 403 | Client gets 403. No data leakage about whether order exists. |
| RBAC-UC-03 | Admin reviews who changed a payment | Admin | AuditLog exists for payment | 1. Admin opens order detail 2. Clicks "Audit History" tab 3. POST /api/v1/audit-logs {resource: "payment", resourceId: paymentId} 4. Chronological list: who, when, what changed, from what to what | Full change history visible with actor names and timestamps |
| RBAC-UC-04 | Office manager tries to delete staff account | Office Manager | Has staff_mgmt permissions: RU (no delete) | 1. DELETE /api/v1/staff/:id 2. checkPermission("staff_mgmt", "delete") 3. "delete" not in actions array 4. Return 403 | Staff account unchanged. AuditLog: "Permission denied: office_manager attempted delete on staff_mgmt" |
| RBAC-UC-05 | Super admin creates custom "Intern" role | Super Admin | Logged in | 1. POST /api/v1/roles {name: "intern", permissions: [{resource: "orders", actions: ["read"], scope: "assigned"}]} 2. Role created with isSystem=false 3. Can be assigned to users | New role available. Only allows reading assigned orders. |

---


### 2.9 Permission Audit Tooling

This sub-module provides tooling to answer: "who has access to what," track permission changes over time, and detect misconfigurations.

#### Permission Snapshot (permissionSnapshot.js)

Stores a point-in-time snapshot of all role-permission assignments whenever a role is modified.

| Field | Type | Description |
|-------|------|-------------|
| snapshotId | String (auto) | UUID |
| roleId | ObjectId ref Role | Role that changed |
| roleName | String | Role name at snapshot time |
| permissionsBefore | Array[Object] | Full permissions array BEFORE change |
| permissionsAfter | Array[Object] | Full permissions array AFTER change |
| diff | Array[Object] | [{resource, action, scope, changeType: "added" | "removed" | "scope_changed", before, after}] |
| changedBy | ObjectId ref User | Who made the change |
| reason | String (required) | Why the change was made |
| createdAt | Date | auto |

#### Permission Audit APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| GET /api/v1/permissions/access-report | GET | Admin+ | "Who has access to what" — matrix of all users × resources × actions. Filterable by resource, action, user. |
| GET /api/v1/permissions/access-report/:resource | GET | Admin+ | All users who can access a specific resource (e.g., "payments") with their action+scope. |
| GET /api/v1/permissions/user/:userId | GET | Admin+ | Complete access profile for one user: role, all permissions, scope restrictions. |
| GET /api/v1/permissions/history | GET | Admin+ | Permission change history. Filters: roleId, dateRange. Shows diffs. |
| GET /api/v1/permissions/history/:roleId | GET | Admin+ | Change history for specific role with full before/after diffs. |
| GET /api/v1/permissions/anomalies | GET | Admin+ | Misconfiguration detection report. |
| GET /api/v1/permissions/resource-access-log/:resource/:resourceId | GET | Admin+ | Who accessed this specific resource instance in last N days. Reads from AuditLog. |
| POST /api/v1/permissions/simulate | POST | Admin+ | "What if" — simulate permission change before applying. Body: {roleId, proposedPermissions}. Returns: {affectedUsers[], addedAccess[], removedAccess[]}. READ-ONLY — never modifies data. |

#### Anomaly Detection Rules (BullMQ cron, every hour)

| Rule | Condition | Severity | Action |
|------|-----------|----------|--------|
| Staff with admin-level access | Non-admin user has CRUD/all on payments or system_config | Critical | Immediate Slack alert + dashboard flag |
| Orphaned users | Active user with disabled role (isActive=false) | High | Dashboard flag |
| Over-privileged scope | Staff with "all" scope on resource where "assigned" is standard | Warning | Dashboard flag |
| No reviewer available | Zero users with role that has review permissions | Critical | Immediate Slack alert |
| Unused admin accounts | Admin users with no login in 90+ days | Warning | Monthly report |
| Permission escalation | Role change that adds payment/config/audit_logs access | Critical | AuditLog + Slack + require super_admin approval |
| Bulk access detection | Single user accessed > 50 different client records in 1 hour | Warning | Real-time Slack alert (potential data exfiltration) |

#### Permission Audit Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| PRM-INV-01 | Every role modification creates a permissionSnapshot with full before/after diff | Post-save middleware on Role model |
| PRM-INV-02 | Role modification requires reason field. Empty reason = rejected. | express-validator |
| PRM-INV-03 | Permission escalation (adding payment/config/audit_logs access) requires super_admin approval. Cannot be done by regular admin. | Pre-update check on sensitive resources |
| PRM-INV-04 | Anomaly detection runs as BullMQ cron every hour. Results cached. Critical anomalies trigger immediate Slack alert. | Cron + Slack webhook |
| PRM-INV-05 | "Simulate" endpoint is READ-ONLY. It calculates impact but NEVER modifies any data. | Separate handler with no write operations |
| PRM-INV-06 | Bulk access detection (>50 records/hour) is real-time. Uses Redis counter per user, incremented on every scope-filtered read. | Redis INCR with 1-hour TTL |


---

## 3. AUTHENTICATION & SECURITY

### 3.1 Authentication Data Model Additions (to User model)

| Field | Type | Description |
|-------|------|-------------|
| refreshTokens | Array[Object] | [{token: String(hashed), deviceId: String, userAgent: String, ipAddress: String, createdAt: Date, expiresAt: Date}] — max 5 active sessions |
| failedLoginAttempts | Number | Counter, resets on successful login |
| accountLockedUntil | Date | Null if not locked. Set to now+30min after 10 failures. |
| lastLoginAt | Date | Timestamp of last successful login |
| lastLoginIp | String | IP of last successful login |
| passwordChangedAt | Date | When password was last changed. All JWTs issued before this are invalid. |
| mfaEnabled | Boolean | Two-factor authentication enabled |
| mfaSecret | String (encrypted) | TOTP secret for authenticator apps |

### 3.2 JWT Token Strategy

| Token | Lifetime | Storage (Client) | Contains |
|-------|----------|------------------|----------|
| Access Token | 15 minutes | Memory only (never localStorage) | {userId, userType, roleId, iat, exp} |
| Refresh Token | 7 days | httpOnly secure cookie (web) / secure storage (mobile) | {userId, deviceId, tokenVersion, iat, exp} |

**Token Rotation:** Every refresh token use issues a NEW refresh token and invalidates the old one. If an old refresh token is reused (replay attack), ALL refresh tokens for that user are invalidated immediately (force re-login on all devices).

### 3.3 Authentication APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/auth/send-otp | POST | Public | Send OTP via Twilio. Rate limit: 3 per mobile per 15 min. Validates +61 format. |
| POST /api/v1/auth/verify-otp | POST | Public | Verify OTP, return access + refresh tokens. Rate limit: 5 attempts per OTP. |
| POST /api/v1/auth/signup | POST | Public | Client registration. Returns JWT tokens. |
| POST /api/v1/auth/signin | POST | Public | Email/password login (admin/staff). Rate limit: 5 per email per 15 min. |
| POST /api/v1/auth/refresh | POST | Refresh Token (cookie/header) | Issue new access token + rotate refresh token. |
| POST /api/v1/auth/logout | POST | Authenticated | Invalidate current refresh token. Remove from refreshTokens array. |
| POST /api/v1/auth/logout-all | POST | Authenticated | Invalidate ALL refresh tokens (force logout all devices). |
| POST /api/v1/auth/forgot-password | POST | Public | Send reset link via email. Rate limit: 3 per email per hour. |
| POST /api/v1/auth/reset-password | POST | Reset Token (URL param) | Set new password. Invalidate all refresh tokens. Set passwordChangedAt. |
| POST /api/v1/auth/change-password | POST | Authenticated | Change password. Requires current password. Invalidate all other refresh tokens. |
| POST /api/v1/auth/check-user | POST | Public | Check if mobile/email exists. Returns {exists: boolean} only. No user details. |

### 3.4 Security Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| SEC-INV-01 | Rate limiting on ALL auth endpoints: OTP send (3/mobile/15min), OTP verify (5/OTP), signin (5/email/15min), forgot-password (3/email/hour) | express-rate-limit with Redis store |
| SEC-INV-02 | Account lockout after 10 consecutive failed login attempts. Lock duration: 30 minutes. Admin can unlock manually. | failedLoginAttempts counter, accountLockedUntil check pre-auth |
| SEC-INV-03 | Refresh tokens are hashed (bcrypt) before storage. Raw token never stored. | Hash on save, compare on refresh |
| SEC-INV-04 | Refresh token rotation: every use issues new token, invalidates old. Reuse of old token = revoke ALL tokens for user. | Token version tracking, reuse detection |
| SEC-INV-05 | Access tokens issued before passwordChangedAt are rejected | JWT middleware: if iat < passwordChangedAt → 401 |
| SEC-INV-06 | Maximum 5 concurrent sessions per user. New login when at max revokes oldest session. | refreshTokens array max length enforcement |
| SEC-INV-07 | All passwords hashed with bcrypt (cost factor 12). Minimum 8 characters, at least 1 uppercase, 1 number. | Pre-save hook + express-validator |
| SEC-INV-08 | OTP expires after 5 minutes. Single use only. Deleted after successful verification. | TTL index on OTP model |
| SEC-INV-09 | TFN (Tax File Number) is NEVER stored in plaintext. Encrypted with AES-256-GCM. Only last 3 digits stored unencrypted for display. | Field-level encryption on Order model |
| SEC-INV-10 | All API responses use Helmet.js with: CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff | Helmet middleware configuration |
| SEC-INV-11 | CORS whitelist: admin domain, web app domain, mobile deep link schemes only. No wildcards. | cors() middleware with explicit origin array |
| SEC-INV-12 | Every API input validated with express-validator. No raw req.body access anywhere. | Validation middleware per route |
| SEC-INV-13 | Error responses in production: {status, code, message}. Never expose stack traces, file paths, or internal details. | Global error handler strips details in production |
| SEC-INV-14 | All MongoDB queries use parameterised queries via Mongoose. No raw string interpolation in queries. | Code review + ESLint rule |
| SEC-INV-15 | File uploads validated server-side: MIME type check (magic bytes, not just extension), file size limit, virus scan | Multer + file-type + ClamAV pipeline |

---

## 4. API DESIGN STANDARDS

### 4.1 API Versioning

All endpoints prefixed with `/api/v1/`. Breaking changes ship under `/api/v2/` with 6-month deprecation notice on v1. Non-breaking additions (new fields, new endpoints) ship in current version.

### 4.2 Request/Response Standards

**Standard Success Response:**
```json
{
  "status": 200,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142,
    "totalPages": 8
  }
}
```

**Standard Error Response:**
```json
{
  "status": 400,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "errors": [
    {"field": "mobile", "message": "Must be valid Australian mobile (+61XXXXXXXXX)"}
  ]
}
```

**HTTP Method Conventions:**
| Method | Use | Idempotent |
|--------|-----|-----------|
| GET | Read operations (list, detail, stats) | Yes |
| POST | Create operations, complex queries with body | No (except with idempotency key) |
| PUT | Full update (replace) | Yes |
| PATCH | Partial update (status change, toggle) | Yes |
| DELETE | Soft-delete | Yes |

**Pagination:** Cursor-based for large collections (leads, orders, messages). Offset-based for small collections (staff, roles, templates). All list endpoints support: page, limit (max 100), sort, order (asc/desc).

**Filtering:** All list endpoints accept filters as query params (GET) or body fields (POST for complex filters). Date ranges: {dateFrom, dateTo} in ISO 8601.

### 4.3 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Input validation failed |
| INVALID_CREDENTIALS | 401 | Wrong email/password/OTP |
| TOKEN_EXPIRED | 401 | JWT expired |
| FORBIDDEN | 403 | Insufficient permissions (RBAC) |
| NOT_FOUND | 404 | Resource not found (within scope) |
| CONFLICT | 409 | Duplicate resource (idempotency key, unique constraint) |
| RATE_LIMITED | 429 | Too many requests |
| GATEWAY_ERROR | 502 | Third-party service failed (Stripe, Xero, Twilio) |
| SERVICE_UNAVAILABLE | 503 | Maintenance mode or circuit breaker open |

### 4.4 Idempotency

All POST endpoints that create financial resources (payments, refunds, invoices) MUST accept an `Idempotency-Key` header (UUID v4). Server stores {key → response} in Redis (TTL 24 hours). Duplicate keys return the cached response without re-executing.

### 4.5 Health Check Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| GET /health | Public | Shallow: app running, returns {status: "ok", uptime, version} |
| GET /health/deep | Admin | Deep: checks MongoDB, Redis, S3, Xero connection, Stripe, Twilio. Returns per-service status. |

---


---

## 5. NOTIFICATION ENGINE (Cross-Module)

### 5.1 Overview

Centralised notification system used by ALL modules. Every notification is created through a single service that handles channel routing (push, SMS, email, in-app, Slack), delivery tracking, and preference checking.

### 5.2 Notification Data Model (notification.js)

| Field | Type | Description |
|-------|------|-------------|
| recipientId | ObjectId ref User | Target user |
| recipientType | Enum | client, staff, admin |
| type | Enum | order_status, payment_received, payment_failed, document_signed, lead_assigned, lead_reminder, follow_up_due, follow_up_overdue, broadcast_delivery, chat_message, review_request, review_submitted, referral_reward, deadline_reminder, cra_status_update, system_alert |
| title | String | Notification title |
| body | String | Notification body (supports merge tags) |
| channels | Array[Enum] | push, sms, email, in_app, slack — which channels to use |
| channelResults | Object | {push: {sent: Boolean, sentAt: Date, error: String}, sms: {...}, ...} |
| data | Object | Payload for deep linking: {screen: "OrderDetail", orderId: "..."} |
| isRead | Boolean | For in-app notifications |
| readAt | Date | When marked as read |
| relatedResource | String | order, lead, payment, review, etc. |
| relatedResourceId | ObjectId | For linking to source |
| createdAt | Date | auto |

### 5.3 Notification Preferences (notificationPreference.js)

| Field | Type | Description |
|-------|------|-------------|
| userId | ObjectId ref User | unique |
| preferences | Object | {order_status: {push: true, sms: false, email: true}, payment_received: {...}, ...} |
| quietHoursEnabled | Boolean | Don't send push/SMS during quiet hours |
| quietHoursStart | String | "21:00" (9 PM) |
| quietHoursEnd | String | "08:00" (8 AM) |
| timezone | String | "Australia/Sydney" (IANA timezone) |
| language | Enum | en, zh, hi, pa, vi, ar, other — for notification content localisation |

### 5.4 Notification APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| GET /api/v1/notifications | GET | Authenticated | In-app notifications for current user. Paginated. Filter: isRead, type. |
| PATCH /api/v1/notifications/:id/read | PATCH | Authenticated (own) | Mark as read |
| PATCH /api/v1/notifications/read-all | PATCH | Authenticated | Mark all as read |
| GET /api/v1/notifications/unread-count | GET | Authenticated | Badge count |
| GET /api/v1/notifications/preferences | GET | Authenticated | Current user's notification preferences |
| PUT /api/v1/notifications/preferences | PUT | Authenticated | Update preferences |
| POST /api/v1/notifications/send | POST | Admin+ | Manual send to single user or broadcast |

### 5.5 Notification Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| NTF-INV-01 | Notification preferences are checked BEFORE sending on any channel. User has opted out of SMS → no SMS sent regardless of module request. | NotificationService.send() checks preferences first |
| NTF-INV-02 | Quiet hours respected for push and SMS channels. Email and in-app are not subject to quiet hours. During quiet hours, push/SMS are queued and sent when quiet hours end. | Pre-send timezone check + BullMQ delayed job |
| NTF-INV-03 | Push notification failure (invalid FCM token) triggers token cleanup — remove stale token from user's device list | FCM error handler |
| NTF-INV-04 | All notification templates support merge tags: {{firstName}}, {{orderNumber}}, {{amount}}, {{staffName}}, {{deadlineDate}} | Template renderer with fallback values |
| NTF-INV-05 | Deduplication: same type + same recipientId + same relatedResourceId within 5 minutes = skip | Redis dedup key with 5min TTL |
## 6. USER PROFILE MANAGEMENT

### 6.1 User Data Model (user.js)

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| email | String | required (admin/staff), unique, lowercase, valid email | Email address |
| mobile | String | required (client), unique, E.164 (+61XXXXXXXXX) | Australian mobile |
| firstName | String | required | First name |
| lastName | String | required | Last name |
| password | String | required (admin/staff), bcrypt hashed | Password (clients use OTP) |
| userType | Number | required, enum: 0-6 | Maps to role (legacy field, role takes precedence) |
| roleId | ObjectId ref Role | required | RBAC role assignment |
| status | Boolean | default: true | Active/inactive |
| profileImage | String | — | S3 URL |
| dateOfBirth | Date | — | DOB |
| gender | Enum | male, female, other, prefer_not_to_say | Gender |
| address | Object | — | {street, suburb, state (Enum: NSW/VIC/QLD/SA/WA/TAS/NT/ACT), postcode (4 digits), country (default: "AU")} |
| tfnLastThree | String | — | Last 3 digits of TFN (display only) |
| tfnEncrypted | String | — | Full TFN encrypted with AES-256-GCM |
| abnNumber | String | — | ABN for self-employed/business clients |
| maritalStatus | Enum | — | single, married, de_facto, separated, divorced, widowed |
| preferredLanguage | Enum | default: "en" | en, zh, hi, pa, vi, ar, other |
| preferredContact | Enum | default: "sms" | call, sms, email, whatsapp |
| timezone | String | default: "Australia/Sydney" | IANA timezone |
| referralCode | String | unique | Auto-generated: QGS-REF-XXXX |
| creditBalance | Number | default: 0 | Referral/promo credits in cents |
| storageUsed | Number | default: 0 | Vault storage in bytes |
| storageQuota | Number | default: 524288000 | 500MB default in bytes |
| fcmTokens | Array[Object] | — | [{token, deviceId, platform (ios/android/web), lastUsed}] |
| consentRecord | Object | — | {marketingSms: {consented: Boolean, date: Date, source: String}, marketingEmail: {...}, marketingWhatsapp: {...}, marketingPush: {...}} |
| college | String | — | For student users |
| discount | Number | default: 0 | Percentage discount |
| isDeleted | Boolean | default: false | Soft delete flag |
| deletedAt | Date | — | When soft-deleted |
| createdAt / updatedAt | Date | auto | Timestamps |

### 6.2 User APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| GET /api/v1/users/me | GET | Authenticated | Current user profile |
| PUT /api/v1/users/me | PUT | Authenticated | Update own profile (name, email, mobile, address, preferences) |
| POST /api/v1/users/me/avatar | POST | Authenticated | Upload profile image to S3 |
| GET /api/v1/users/:id | GET | Admin+ / Staff (assigned) | View user detail |
| PUT /api/v1/users/:id | PUT | Admin+ | Admin edit any user |
| GET /api/v1/users | GET | Admin+ | List users. Filters: userType, search (name/email/mobile), status, state, dateRange. Paginated. |
| PATCH /api/v1/users/:id/type | PATCH | Admin | Change user type (client↔student) |
| PATCH /api/v1/users/:id/status | PATCH | Admin | Toggle active/inactive |
| DELETE /api/v1/users/:id | DELETE | Admin | Soft-delete (isDeleted=true). AuditLog: severity=critical. |
| PUT /api/v1/users/me/consent | PUT | Authenticated | Update marketing consent per channel. Records timestamp and source. |
| GET /api/v1/users/me/consent | GET | Authenticated | Current consent status per channel |

---


---

## 7. ORDER / TAX RETURN MANAGEMENT

### 7.1 Order Data Model (order.js)

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| orderNumber | String | auto, unique | QGS-O-XXXX (auto-increment) |
| userId | ObjectId ref User | required, index | Client who owns this return |
| leadId | ObjectId ref Lead | — | Source lead if converted |
| financialYear | String | required | "2024-25" (Australian FY format: Jul-Jun) |
| status | Number | required, enum: 1-9 | Order lifecycle status |
| personalDetails | Object | required | {firstName, lastName, dateOfBirth, gender, tfnEncrypted, tfnLastThree, abnNumber, address, mobile, email} |
| maritalStatus | Enum | — | single, married, de_facto, separated, divorced, widowed |
| spouse | Object | — | {firstName, lastName, dateOfBirth, tfnEncrypted, tfnLastThree, mobile, email} |
| dependants | Array[Object] | — | [{firstName, lastName, dateOfBirth, relationship (Enum: child, student, invalid, other), medicareEligible}] |
| incomeDetails | Object | — | {employmentIncome: Boolean, businessIncome: Boolean, rentalIncome: Boolean, investmentIncome: Boolean, foreignIncome: Boolean, capitalGains: Boolean, governmentPayments: Boolean, superannuationIncome: Boolean} |
| deductionDetails | Object | — | {workRelatedExpenses: Boolean, selfEducation: Boolean, vehicleExpenses: Boolean, homeOffice: Boolean, donations: Boolean, privateHealthInsurance: Boolean, incomeProtection: Boolean} |
| questions | Object | — | Flexible Q&A for tax-specific questions |
| documents | Array[Object] | max: 10 | [{documentId, fileName, fileUrl, documentType, status (pending/signed/verified), zohoRequestId, docuSignEnvelopeId}] |
| lineItems | Array[Object] | — | [{salesId: ObjectId, title: String, price: Number (cents), quantity: Number, priceAtCreation: Number (cents)}] — price snapshot at order time |
| totalAmount | Number | — | Sum of lineItems in cents |
| discountPercent | Number | — | Applied discount |
| discountAmount | Number | — | Calculated discount in cents |
| finalAmount | Number | — | totalAmount - discountAmount in cents |
| processingBy | ObjectId ref User | — | Assigned staff member |
| completionPercent | Number | default: 0 | Progress 0-100 |
| scheduledAppointment | Object | — | {date, timeSlot, staffId, type (Enum: in_person, phone, video), meetingLink, status (Enum: scheduled, completed, no_show, cancelled)} |
| eFileStatus | Enum | — | not_filed, pending, submitted, accepted, rejected, assessed |
| eFileReference | String | — | ATO lodgement reference number |
| noaReceived | Boolean | default: false | Notice of Assessment received |
| noaDate | Date | — | NOA issue date |
| refundOrOwing | Number | — | Positive = refund, negative = owing (cents) |
| xeroInvoiceId | String | — | Linked Xero invoice UUID |
| xeroInvoiceNumber | String | — | Xero invoice number (human readable) |
| reviewId | ObjectId ref Review | — | Linked client review |
| notes | String | — | Internal staff notes |
| isDeleted | Boolean | default: false | Soft delete |
| createdAt / updatedAt | Date | auto | Timestamps |

### 7.2 Order Status Lifecycle (9 States)

| Code | Label | Description | Colour | Allowed Transitions |
|------|-------|-------------|--------|-------------------|
| 1 | Pending | Order created, awaiting document collection | Blue | → 2, 9 |
| 2 | Documents Received | Client has uploaded required documents | Orange | → 3, 1, 9 |
| 3 | Assigned | Assigned to staff for preparation | Yellow | → 4, 2, 9 |
| 4 | In Progress | Staff actively preparing return | Purple | → 5, 3, 9 |
| 5 | Review | Return prepared, pending review/client sign-off | Cyan | → 6, 4, 9 |
| 6 | Completed | Return finalised and signed | Green | → 7, 9 |
| 7 | Lodged | Submitted to ATO via e-file or manually | Teal | → 8 |
| 8 | Assessed | ATO has issued Notice of Assessment | Dark Green | (terminal) |
| 9 | Cancelled | Order cancelled | Red | → 1 (reopen) |

**Transition Rules:**
- Forward transitions: any authorised user with correct role
- Backward transitions (e.g., 4→3): require senior_staff or admin
- Cancel (→9): requires admin or office_manager. Creates AuditLog severity=critical.
- Reopen (9→1): requires admin only.
- Status change to 6 (Completed): triggers review request (24hr delay)
- Status change to 3 (Assigned): requires processingBy to be set
- Status change to 7 (Lodged): requires eFileReference or manual confirmation

### 7.3 Order APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/orders | POST | Client (own) / Admin | Create new order. Body: personalDetails, financialYear, lineItems from Sales catalogue. |
| GET /api/v1/orders | GET | Admin+ / Staff (assigned) / Client (own) | List orders. Filters: status, financialYear, processingBy, userId, search, dateRange, eFileStatus. Paginated. Scope-filtered. |
| GET /api/v1/orders/:id | GET | Admin+ / Staff (assigned) / Client (own) | Full order detail with populated refs. Scope-filtered. |
| PUT /api/v1/orders/:id | PUT | Admin+ / Staff (assigned) | Update order details. Cannot change userId or orderNumber. |
| PATCH /api/v1/orders/:id/status | PATCH | Admin+ / Staff (assigned) | Status transition. Body: {status, note}. Validates transition rules. AuditLog. |
| PUT /api/v1/orders/:id/assign | PUT | Admin+ / Office Manager | Assign to staff. Body: {processingBy}. AuditLog. |
| PUT /api/v1/orders/:id/bulk-assign | PUT | Admin+ | Bulk assign orders to staff. Body: {orderIds[], processingBy}. |
| POST /api/v1/orders/:id/appointment | POST | Client (own) / Admin | Schedule appointment. Body: {date, timeSlot, type, staffId}. |
| PATCH /api/v1/orders/:id/progress | PATCH | Staff (assigned) / Admin | Update completion percentage. |
| POST /api/v1/orders/:id/calculation | POST | Admin+ / Staff | Calculate: sum lineItems, apply discount, return totals. |
| GET /api/v1/orders/stats | GET | Admin+ | Order counts by status, by FY, by staff. |
| GET /api/v1/orders/revenue | GET | Admin+ | Revenue stats: total, by period, by service. |

### 7.4 Order Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| ORD-INV-01 | Status transitions follow the defined state machine. Invalid transitions return 400 with {allowedTransitions: [...]}. | Transition validator function using adjacency map |
| ORD-INV-02 | lineItems[].priceAtCreation captures the price at order creation time. If Sales catalog price changes later, existing orders are unaffected. | Set on create, immutable after |
| ORD-INV-03 | totalAmount, discountAmount, finalAmount are recalculated server-side on every order update. Client-submitted totals are ignored. | Calculation in pre-save middleware |
| ORD-INV-04 | All monetary values stored as integers (cents). No floating point arithmetic. | Mongoose schema type: Number, validate: Number.isInteger |
| ORD-INV-05 | TFN fields encrypted with AES-256-GCM before storage. Only tfnLastThree stored in plaintext. | Encryption in pre-save hook, decryption in toJSON only for authorised roles |
| ORD-INV-06 | Order.userId is immutable after creation. | Pre-update validator |
| ORD-INV-07 | Assigning staff (processingBy) creates AuditLog and sends push notification to assigned staff. | Post-save middleware |
| ORD-INV-08 | Cancel (→9) requires reason field. Triggers: void Xero invoice (if exists), cancel any pending payments. | Cancel handler with cascading actions |
| ORD-INV-09 | Soft delete: isDeleted=true. Excluded from all queries except admin "Deleted Orders" view. Hard delete never available via API. | Default query middleware |
| ORD-INV-10 | Order completion (→6) triggers: review request scheduling (24hr delay via BullMQ), Xero invoice finalisation, staff completion counter increment | Event emitter: "order.completed" |

### 7.5 Sales & Services Catalogue (sales.js)

| Field | Type | Description |
|-------|------|-------------|
| title | String (required) | Service name |
| description | String | Service description |
| price | Number (required) | Price in cents (AUD) |
| gstInclusive | Boolean | default: true. Australian prices typically include GST. |
| gstAmount | Number | Auto-calculated: price / 11 (for GST-inclusive) |
| category | Enum | individual, business, investment, other |
| inputBased | Boolean | Price varies by complexity |
| inputBasedType | String | Description of what varies |
| isActive | Boolean | default: true |
| sortOrder | Number | Display order |
| xeroAccountCode | String | Mapped Xero revenue account code |

**Example Australian Services:**

| Service | Price (AUD incl GST) | Category |
|---------|---------------------|----------|
| Individual Tax Return (simple) | $99.00 | individual |
| Individual Tax Return (standard) | $165.00 | individual |
| Individual Tax Return (complex) | $275.00 | individual |
| Rental Property Schedule | $110.00 | investment |
| Capital Gains Tax Schedule | $88.00 | investment |
| Business & Professional Income | $220.00 | business |
| Sole Trader / ABN Return | $330.00 | business |
| BAS Preparation (quarterly) | $165.00 | business |
| PAYG Instalment Variation | $55.00 | business |
| Amendment to Prior Year | $132.00 | individual |
| Private Health Insurance Rebate | $22.00 | individual |
| HECS-HELP Debt Review | $33.00 | individual |

---


### 7.6 Order Model Additions (Amendment & Review Support)

The following fields are added to the Order model for amendment tracking and the review/approval pipeline:

| Field (NEW) | Type | Description |
|-------------|------|-------------|
| orderType | Enum | standard, amendment. Default: "standard". |
| linkedOrderId | ObjectId ref Order | If amendment: the original order being amended. |
| amendmentCount | Number | On original order: increments when amendments are created against it. |
| lineItems[].completionStatus | Enum | not_started, in_progress, completed, cancelled — for prorated cancellations |
| lineItems[].completedAt | Date | When this line item was marked complete |
| lineItems[].proratedAmount | Number | Staff-entered prorated amount if partial cancellation (cents) |

### 7.7 Review & Approval Pipeline

#### Overview

The TPB (Tax Practitioners Board) Code of Professional Conduct requires adequate supervision of tax returns. A junior preparer lodging a return without review risks the tax agent's registration. This sub-module implements a formal review pipeline with checklist, assignment rules, and approval gates.

#### Review Assignment (reviewAssignment.js)

| Field | Type | Description |
|-------|------|-------------|
| orderId | ObjectId ref Order | unique — one active review per order |
| preparerId | ObjectId ref User | Staff who prepared the return |
| reviewerId | ObjectId ref User | Senior staff/admin assigned to review |
| status | Enum | pending_review, in_review, changes_requested, approved, rejected |
| checklist | Array[Object] | [{item: String, checked: Boolean, note: String}] |
| reviewNotes | String | Reviewer's overall notes |
| changesRequested | Array[Object] | [{field, issue, instruction, resolvedBy, resolvedAt}] |
| changesResolvedCount | Number | How many change requests resolved |
| approvedAt | Date | When approved |
| rejectedAt | Date | When rejected |
| rejectedReason | String | Why rejected |
| reviewRound | Number | default: 1. Increments on each changes_requested cycle |
| timeToReview | Number | Minutes from pending_review to approved/rejected |
| createdAt / updatedAt | Date | auto |

#### Default Review Checklist (Configurable by Admin)

| # | Item | Category |
|---|------|----------|
| 1 | Client identity verified (TFN matches, DOB matches) | Compliance |
| 2 | All income sources accounted for (cross-check with prior year) | Accuracy |
| 3 | Deductions supported by documentation in vault | Accuracy |
| 4 | Medicare levy correctly applied (check residency, family status) | Calculation |
| 5 | HECS-HELP correctly assessed (check debt status) | Calculation |
| 6 | Private health insurance status verified | Calculation |
| 7 | Capital gains discount correctly applied (holding period > 12 months) | Calculation |
| 8 | Negative gearing calculations verified (if applicable) | Calculation |
| 9 | Prior-year figures consistent with last year's return | Consistency |
| 10 | Client engagement letter signed | Compliance |
| 11 | All required documents uploaded to vault | Completeness |
| 12 | Estimated refund/owing figure reasonable (no obvious errors) | Sanity check |

#### Review Workflow

```
Staff completes return preparation
  → Order status: In Progress (4)
    ↓
Staff clicks "Submit for Review"
  → Order status: Review (5)
  → ReviewAssignment created (status: pending_review)
  → Reviewer assigned (based on rules below)
  → Push notification to reviewer
    ↓
Reviewer opens return
  → ReviewAssignment status: in_review
  → Reviewer works through checklist
    ↓
  ┌─── All checks pass ───┐     ┌─── Issues found ───────────┐
  ↓                        ↓     ↓                             ↓
Reviewer approves          Reviewer requests changes
  → status: approved         → status: changes_requested
  → approvedAt = now         → changesRequested[] populated
  → Order unlocked           → Order status back to In Progress (4)
    for lodgement             → Push notification to preparer
  → AuditLog: "Return        → Preparer fixes issues
    approved by [reviewer]"   → Preparer resubmits for review
                               → reviewRound++ (tracks cycles)
```

#### Review Assignment Rules

| Rule | Condition | Action |
|------|-----------|--------|
| Self-review block | Always | preparerId !== reviewerId. System prevents same person. |
| Seniority gate | Preparer is junior staff (< 1 year) | Must be reviewed by senior_staff or admin |
| Complexity gate | Order has > 3 line items OR has rental/CGT/foreign income | Must be reviewed by senior_staff or admin |
| Manager review | Order value > $500 or client is VIP (CLV top 10%) | Auto-assign to office_manager |
| Round-robin | No configured pairing | Round-robin among senior_staff and admin |

#### Review APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/order-reviews/submit | POST | Staff (assigned preparer) | Submit order for review. Creates ReviewAssignment. Order status → Review (5). |
| GET /api/v1/order-reviews/pending | GET | Senior Staff+ | My pending reviews. |
| GET /api/v1/order-reviews/:orderId | GET | Staff (preparer) / Senior Staff+ | Review detail with checklist. |
| PATCH /api/v1/order-reviews/:orderId/start | PATCH | Reviewer | Start reviewing. Status → in_review. |
| PATCH /api/v1/order-reviews/:orderId/approve | PATCH | Reviewer | Approve. All checklist items must be checked. AuditLog. |
| PATCH /api/v1/order-reviews/:orderId/request-changes | PATCH | Reviewer | Request changes. Body: {changesRequested[], reviewNotes}. Order status → In Progress (4). |
| PATCH /api/v1/order-reviews/:orderId/reject | PATCH | Reviewer / Admin | Reject return entirely. Body: {rejectedReason}. |
| POST /api/v1/order-reviews/:orderId/resolve-change | POST | Preparer | Mark a change request as resolved. |
| GET /api/v1/order-reviews/stats | GET | Admin+ | Review metrics: avg time, approval rate, changes per round, by reviewer, by preparer. |

#### Review Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| RVW-INV-01 | Order CANNOT transition from Review (5) to Completed (6) without an approved ReviewAssignment | Status transition validator checks ReviewAssignment.status === "approved" |
| RVW-INV-02 | Preparer CANNOT be the same person as reviewer. preparerId !== reviewerId. | Pre-assignment validation |
| RVW-INV-03 | Approval requires ALL checklist items checked. Cannot approve with unchecked items. | Pre-approve validation |
| RVW-INV-04 | Review approval creates AuditLog: {action: "return_approved", preparerId, reviewerId, reviewRound, timeToReview}. severity=info. | Post-approve middleware |
| RVW-INV-05 | Changes-requested loops increment reviewRound. If reviewRound > 3, auto-escalate to admin with flag: "Return requires excessive revisions." | Post-changes-requested check |
| RVW-INV-06 | Review metrics (time to review, approval rate) tracked per reviewer for staff benchmarking. | Analytics aggregation |
| RVW-INV-07 | Return cannot be lodged (status → 7) without BOTH: approved ReviewAssignment AND locked TaxReturnResult. Belt and suspenders. | Double-check in status transition validator |


---

## 8. TAX CALCULATION & ESTIMATION ENGINE

### 8.1 Architectural Approach: Hybrid Model

QEGOS uses a **hybrid approach** to tax calculations:

1. **Tax Estimate Calculator** (client-facing) — provides ESTIMATED tax refund/owing for engagement, lead conversion, and staff quick-quoting. Clearly labelled "estimate only." ~80% accuracy — this is a sales and engagement tool.
2. **External Professional Software** (staff-facing) — actual tax returns prepared in ATO-certified software (Xero Tax, LodgeiT, MYOB Tax, or HandiTax). These tools are TPB-compliant, ATO-certified, and updated within days of budget announcements.
3. **Tax Result Import System** (staff-facing) — official calculation results from external software imported into QEGOS for client portal display, YoY comparison, and analytics.

**Why not build a full calculation engine?** Building ATO-certified tax calculation capability requires 12-16 weeks additional development, independent audit, annual maintenance on every federal budget, and carries professional indemnity liability. Most tax agents already have certified software. QEGOS adds value as the CRM/workflow/client experience layer — not as a duplicate calculation engine.

**CRITICAL DISCLAIMER:** Every screen showing estimate results MUST display: "This is an estimate only, not a tax return. Your actual refund or amount owing may differ. Consult your registered tax agent for an accurate assessment."

### 8.2 Tax Rule Configuration (taxRuleConfig.js)

Tax rules are stored as DATA, not hardcoded logic. When brackets change (budget announcements), an admin updates the config — no code deploy needed. Each version is immutable once used.

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| snapshotId | String | auto (UUID v4), unique, immutable | Permanent identifier. NEVER changes. This is what calculations reference. |
| financialYear | String | required | "2024-25" |
| version | Number | auto-increment per FY | v1, v2, v3... Each correction creates new version |
| status | Enum | required | draft — editable, not yet in use; active — current default for this FY; superseded — was active, replaced by newer version; frozen — used by at least one calculation, permanently immutable |
| effectiveFrom | Date | required | When these rules take effect (typically 1 July) |
| effectiveTo | Date | required | When these rules expire (typically 30 June) |
| midFyOverrides | Array[Object] | — | For mid-FY budget changes: [{field, value, effectiveFrom, legislationRef, note}] |
| residentBrackets | Array[Object] | required | [{min: Number (cents), max: Number (cents, null for top bracket), rate: Number, base: Number (cents)}] |
| nonResidentBrackets | Array[Object] | required | Same structure, different rates |
| workingHolidayBrackets | Array[Object] | required | Same structure, different rates |
| medicareLevyRate | Number | required | 0.02 (2%) |
| medicareLevySingleThreshold | Number | required | In cents — below this, reduced/nil levy |
| medicareLevySingleShadeIn | Number | — | Phase-in range start (cents) |
| medicareLevyFamilyThreshold | Number | — | Family threshold (cents) |
| medicareLevyFamilyPerChild | Number | — | Additional per dependent child (cents) |
| medicareLevySeniorSingleThreshold | Number | — | Higher threshold for seniors (cents) |
| medicareLevySurchargeTiers | Array[Object] | — | [{min, max, rate}] — for earners without PHI |
| litoMaxOffset | Number | — | Low Income Tax Offset max (cents) |
| litoFullThreshold | Number | — | Full offset below this income (cents) |
| litoPhaseOutStart | Number | — | Phase-out begins (cents) |
| litoPhaseOutEnd | Number | — | Phase-out ends (cents) |
| litoPhaseOutRate | Number | — | Reduction rate (e.g., 0.05 = 5 cents per dollar) |
| saptoMaxSingle | Number | — | Senior Australians offset max single (cents) |
| saptoMaxCouple | Number | — | Combined max for couple |
| saptoThresholdSingle | Number | — | Income threshold for seniors |
| saptoPhaseOutRate | Number | — | Reduction rate |
| hecsRepaymentTiers | Array[Object] | — | [{min, max, rate}] — ~15 tiers, all in cents |
| cgtDiscount | Number | — | 0.50 — 50% for assets held >12 months |
| instantAssetWriteOff | Number | — | Threshold for small business (cents) |
| superGuaranteeRate | Number | — | 0.115 for FY2024-25 (11.5%) |
| legislationReference | String | — | E.g., "Income Tax Rates Act 1986 as amended by Treasury Laws Amendment (Stage 3) 2024" |
| budgetReference | String | — | E.g., "2024-25 Federal Budget, Paper No. 2" |
| verifiedBy | ObjectId ref User | — | Admin who verified against ATO published tables |
| verifiedAt | Date | — | When verified |
| usageCount | Number | default: 0 | How many calculations reference this snapshot. Once > 0, status auto-transitions to "frozen". |
| parentSnapshotId | String | — | If this version corrects a previous one, links to the parent |
| changeReason | String | required if parentSnapshotId exists | Why the correction was made |
| changeLog | Array[Object] | — | [{date, field, from, to, reason, updatedBy}] — only during draft phase |
| isImmutable | Boolean | computed | True if usageCount > 0 |
| createdBy | ObjectId ref User | required | Who created |
| createdAt / updatedAt | Date | auto | Timestamps |

**Indexes:** `{snapshotId: 1}` unique, `{financialYear: 1, status: 1}`, `{financialYear: 1, version: -1}`

### 8.3 Rule Lifecycle & Snapshot Immutability

```
draft ──────→ active ──────→ superseded
  │              │                │
  │              ↓                │
  │           frozen              │
  │         (usageCount > 0       │
  │          auto-transitions)    │
  ↓                               ↓
deleted                        (immutable forever)
(only if draft,
 never used)
```

**Transitions:**

| From | To | Trigger | Effect |
|------|----|---------|--------|
| draft | active | Admin activates | Previous active → superseded. New rules become default for FY. |
| draft | deleted | Admin discards | Only if usageCount === 0. Hard delete allowed. |
| active | frozen | First calculation uses it | Auto-transition. usageCount incremented. Config becomes immutable. |
| active | superseded | New version activated for same FY | Old active → superseded. Still accessible by snapshotId. |
| frozen | (none) | Cannot transition | Permanently immutable. Cannot edit, delete, or supersede. |
| superseded | (none) | Cannot transition | Permanently immutable if usageCount > 0. |

**CRITICAL RULE:** Once `usageCount > 0`, the config document is PERMANENTLY IMMUTABLE. No field can be modified. Any correction creates a new version with `parentSnapshotId` pointing to the corrected one.

### 8.4 FY2024-25 Tax Brackets (Seed Data — Stage 3 Tax Cuts)

**Resident Individual:**

| Taxable Income | Tax Rate | Base Tax | In Cents (min, max, rate, base) |
|---------------|----------|----------|--------------------------------|
| $0 – $18,200 | 0% | $0 | 0, 1820000, 0, 0 |
| $18,201 – $45,000 | 16% | $0 | 1820001, 4500000, 0.16, 0 |
| $45,001 – $135,000 | 30% | $4,288 | 4500001, 13500000, 0.30, 428800 |
| $135,001 – $190,000 | 37% | $31,288 | 13500001, 19000000, 0.37, 3128800 |
| $190,001+ | 45% | $51,638 | 19000001, null, 0.45, 5163800 |

**Non-Resident Individual:**

| Taxable Income | Tax Rate | Base Tax |
|---------------|----------|----------|
| $0 – $135,000 | 30% | $0 |
| $135,001 – $190,000 | 37% | $40,500 |
| $190,001+ | 45% | $60,850 |

**Working Holiday Maker (417/462 visa):**

| Taxable Income | Tax Rate | Base Tax |
|---------------|----------|----------|
| $0 – $45,000 | 15% | $0 |
| $45,001 – $135,000 | 30% | $6,750 |
| $135,001 – $190,000 | 37% | $33,750 |
| $190,001+ | 45% | $54,100 |

### 8.5 Calculation Engine (taxCalculator.js — Pure Function, No Side Effects)

```
FUNCTION calculateTaxEstimate(input, rules):

INPUT:
  - financialYear: String
  - residencyStatus: "resident" | "non_resident" | "working_holiday"
  - dateOfBirth: Date (for SAPTO eligibility)
  - grossEmploymentIncome: Number (cents)
  - businessIncome: Number (cents)
  - rentalIncome: Number (cents) — can be negative (negative gearing)
  - interestIncome: Number (cents)
  - dividendIncome: Number (cents)
  - dividendFrankingCredits: Number (cents)
  - capitalGains: Object {shortTerm: cents, longTerm: cents}
  - foreignIncome: Number (cents)
  - governmentPayments: Number (cents)
  - superannuationIncome: Number (cents)
  - deductions: Object {workRelated, selfEducation, vehicleExpenses, homeOffice, donations, incomeProtection, accountingFees, other} — all cents
  - privateHealthInsurance: Boolean
  - hasHecsDebt: Boolean
  - hasSfssDebt: Boolean
  - isEligibleSenior: Boolean
  - spouseIncome: Number (cents)
  - numberOfDependants: Number
  - taxWithheld: Number (cents)
  - paymentSummaries: Array[{employerName, grossIncome, taxWithheld}]

OUTPUT:
  - grossIncome, totalDeductions, taxableIncome: Number (cents)
  - baseTax, medicareLevyAmount, medicareLevySurcharge: Number (cents)
  - litoOffset, saptoOffset: Number (cents)
  - hecsRepayment: Number (cents)
  - totalTaxPayable, totalTaxWithheld: Number (cents)
  - estimatedRefundOrOwing: Number (cents) — positive = refund
  - effectiveTaxRate, marginalTaxRate: Number (percentage)
  - breakdown: Array[{label, amount, type}]
  - warnings: Array[String]
  - disclaimer: String (ALWAYS present)
  - calculatedAt: Date
  - rulesSnapshotId: String
  - rulesVersion: Number

STEPS:

1. GROSS INCOME
   grossIncome = employment + business + rental + interest + dividends
                 + frankingCredits + capitalGainsCalculated + foreign
                 + government + superannuation
   capitalGainsCalculated = shortTermGains + (longTermGains × (1 - cgtDiscount))
   Note: CGT discount only for residents, assets held >12 months
   If rentalIncome < 0: included (negative gearing reduces total)
     → Add warning: "Rental loss of ${amount} applied (negative gearing)"

2. DEDUCTIONS
   totalDeductions = sum of all deduction fields
   Validations: donations capped at taxableIncome
   If totalDeductions <= 30000 cents ($300) AND only workRelated:
     Use $300 standard deduction shortcut
     → Add warning: "Using $300 standard deduction"

3. TAXABLE INCOME
   taxableIncome = max(0, grossIncome - totalDeductions)

4. BASE TAX (from bracket table)
   Select bracket table by residencyStatus
   Find bracket where taxableIncome falls
   baseTax = bracket.base + ((taxableIncome - bracket.min + 1) × bracket.rate)
   Round to nearest cent

5. MEDICARE LEVY (residents only — non-residents exempt)
   If non-resident: 0, skip
   If taxableIncome <= threshold: 0
   If in shade-in range: (taxableIncome - threshold) × 0.10
   Else: taxableIncome × medicareLevyRate
   Apply family reduction if spouse/dependants
   Apply senior threshold if eligible

6. MEDICARE LEVY SURCHARGE (residents without PHI above threshold)
   If PHI = true: 0
   Else: find tier, apply rate
   → Add warning: "MLS of ${rate}% applies — consider PHI"

7. LOW INCOME TAX OFFSET (LITO) — residents only
   If below threshold: full offset ($700)
   If in phase-out: reduce by rate per dollar over threshold
   Else: 0

8. SENIOR AUSTRALIANS AND PENSIONERS TAX OFFSET (SAPTO)
   If not eligible senior: 0
   Apply threshold and phase-out calculation

9. HECS-HELP REPAYMENT
   If no HECS debt: 0
   Find repayment tier, apply rate
   → Add warning: "HECS-HELP repayment of ${amount} — compulsory"

10. TOTAL TAX PAYABLE
    totalTaxPayable = baseTax + medicareLevyAmount + medicareLevySurcharge
                      - litoOffset - saptoOffset - frankingCredits
    totalTaxPayable = max(0, totalTaxPayable)
    totalWithHecs = totalTaxPayable + hecsRepayment

11. REFUND OR OWING
    estimatedRefundOrOwing = taxWithheld - totalWithHecs
    Handle excess franking credits (refundable)

12. RATES
    effectiveTaxRate = (totalTaxPayable / grossIncome) × 100
    marginalTaxRate = current bracket rate × 100

13. ALWAYS RETURN disclaimer, rulesSnapshotId, rulesVersion, calculatedAt
```

### 8.6 Tax Estimate Log (taxEstimateLog.js)

Estimates are STORED (not ephemeral) for dispute resolution and audit.

| Field | Type | Description |
|-------|------|-------------|
| estimateId | String (auto) | QGS-EST-XXXX |
| userId | ObjectId ref User | Who requested |
| leadId | ObjectId ref Lead | If estimate was for a lead |
| orderId | ObjectId ref Order | If linked to existing order |
| financialYear | String | "2024-25" |
| rulesSnapshotId | String (immutable) | EXACT snapshotId used. Permanently binds to this snapshot. |
| rulesVersion | Number | Human-readable version at time of calc |
| input | Object | Complete input snapshot (all fields from calculation input) |
| output | Object | Complete output (all fields from calculation output) |
| context | Enum | client_portal, staff_quick_quote, landing_page, phone_call, order_review |
| performedBy | ObjectId ref User | Staff who ran it (if staff-initiated) |
| expiresAt | Date | 12 months from creation |
| createdAt | Date | auto |

**Indexes:** `{userId: 1, financialYear: 1, createdAt: -1}`, `{leadId: 1}`, `{rulesSnapshotId: 1}`

### 8.7 Tax Return Result (taxReturnResult.js)

For importing OFFICIAL calculation results from external tax software.

| Field | Type | Description |
|-------|------|-------------|
| orderId | ObjectId ref Order | unique — one result per order |
| userId | ObjectId ref User | Client |
| financialYear | String | "2024-25" |
| rulesSnapshotId | String (immutable after lock) | snapshotId of taxRuleConfig active when return was prepared |
| source | Enum | manual_entry, xero_tax, lodgeit, myob_tax, handitax, other |
| sourceReference | String | External software reference number |
| returnType | Enum | original, amendment. Default: "original" |
| originalReturnId | ObjectId ref TaxReturnResult | If amendment: links to original |
| amendmentNumber | Number | 1, 2, 3... sequential amendments |
| amendmentReason | String | Required if returnType=amendment |
| amendmentChanges | Object | Auto-calculated diff: {income: {field: {from, to}}, deductions: {...}} |
| income | Object | {employment, business, rental, interest, dividends, frankingCredits, capitalGains, foreign, government, superannuation, other, total} — all cents |
| deductions | Object | {workRelated, selfEducation, vehicle, homeOffice, donations, incomeProtection, accounting, other, total} — all cents |
| taxableIncome | Number | From official return (cents) |
| taxOnIncome | Number | Base tax (cents) |
| medicareLevyAmount | Number | Including surcharge if applicable (cents) |
| offsets | Object | {lito, sapto, franking, other, total} — all cents |
| hecsRepayment | Number | Compulsory repayment (cents) |
| totalTaxPayable | Number | Final tax payable (cents) |
| taxWithheld | Number | Total PAYG withheld (cents) |
| refundOrOwing | Number | Official figure (cents) |
| superannuationTotal | Number | Reportable super (cents) |
| lodgementDate | Date | When lodged with ATO |
| lodgementMethod | Enum | ato_portal, sbr, paper |
| assessmentDate | Date | ATO NOA date |
| assessmentNoticeRef | String | NOA reference |
| assessmentVariance | Number | If ATO adjusted: difference from lodged (cents) |
| atoAmendmentRef | String | ATO amendment reference number |
| atoAmendmentStatus | Enum | not_lodged, lodged, processing, completed, rejected |
| previousEstimateId | ObjectId ref TaxEstimateLog | Estimate shown for dispute resolution |
| preparedAt | Date | When staff finished preparing |
| isLocked | Boolean | default: false. True on lodgement. After: financial figures immutable. |
| lockedAt | Date | When locked |
| lockedBy | ObjectId ref User | Who locked |
| enteredBy | ObjectId ref User | Staff who entered results |
| verifiedBy | ObjectId ref User | Senior staff who verified |
| createdAt / updatedAt | Date | auto |

### 8.8 Amendment Workflow

```
Client discovers error in prior-year return
  ↓
Staff creates Amendment Order
  - orderType: "amendment"
  - linkedOrderId: original order
  - financialYear: SAME as original (not current FY)
  - lineItems: [{title: "Amendment to Prior Year", price: 13200}]
  ↓
System loads ORIGINAL return's rulesSnapshotId
  - Fetches taxRuleConfig by snapshotId (NOT "active" FY config)
  - Guarantees correct FY brackets even years later
  ↓
Staff prepares amended return in external software (same FY rules)
  ↓
Staff enters amended results: POST /api/v1/tax-results/amendment
  - System auto-calculates diff (amendmentChanges)
  - Links to original via originalReturnId
  ↓
Amendment lodged with ATO → atoAmendmentRef recorded → isLocked = true
  ↓
ATO processes → atoAmendmentStatus updated → additional refund/owing handled
```

### 8.9 Reproducibility Guarantee

Given any TaxReturnResult or TaxEstimateLog record, the system can reproduce the EXACT same calculation output at any point in the future by:

1. Reading the stored `rulesSnapshotId`
2. Loading the FROZEN taxRuleConfig for that snapshot
3. Reading the stored input
4. Running `calculateTaxEstimate(input, rules)` — same pure function
5. Getting IDENTICAL output (integer arithmetic is deterministic)

This guarantee holds even if: rules have been corrected (corrections create new versions), the current FY uses different brackets, years have passed, or the calculation engine code has been updated.

### 8.10 Tax Rules Test Suite (Built-in Validation)

When admin activates new rules, these test cases run automatically. ALL must pass.

| Test Case | Input | Expected | Purpose |
|-----------|-------|----------|---------|
| Zero income | gross: 0 | tax: 0, refund: 0 | Base case |
| Below tax-free | gross: $18,200 | tax: 0, ML: 0 | Threshold |
| Just above | gross: $18,201 | tax: $0.16 | Boundary |
| Median income | gross: $65,000 | Validate vs ATO calculator | Sanity check |
| High income no PHI | gross: $100,000, PHI: false | MLS applied | Surcharge |
| Senior low income | gross: $32,000, senior: true | SAPTO applied | Offset |
| Non-resident | gross: $50,000, non-res | 30% from $0, no LITO, no ML | Non-res rules |
| Negative gearing | employ: $80K, rental: -$10K | taxable: $70K | Loss offset |
| CGT with discount | longTermGain: $20K | Only $10K included | 50% discount |
| HECS minimum | gross: $54,882 | HECS: 1% | Min tier |
| Franking excess | income: $10K, franking: $5K | Excess refunded | Refundable credits |
| Standard deduction | deductions: $300 | Auto-applied | Shortcut |

### 8.11 Tax APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/tax/estimate | POST | Authenticated | Full tax estimate. Stores in taxEstimateLog. Returns full breakdown. |
| POST /api/v1/tax/quick-estimate | POST | Public | Simplified (income + deductions only). For marketing. Returns range. |
| GET /api/v1/tax/rules/:financialYear | GET | Admin+ | View tax rules for FY. |
| GET /api/v1/tax/rules | GET | Admin+ | List all FY rules with status. |
| POST /api/v1/tax/rules | POST | Admin+ | Create new tax rules (status=draft). |
| PUT /api/v1/tax/rules/:id | PUT | Admin+ | Edit draft rules only. |
| PATCH /api/v1/tax/rules/:id/activate | PATCH | Super Admin | Activate rules for FY. Runs test suite. Archives previous. AuditLog critical. |
| POST /api/v1/tax/rules/:id/validate | POST | Admin+ | Run test cases against rules. |
| POST /api/v1/tax/rules/:id/correct | POST | Admin+ | Create corrected version of frozen/superseded rules. Body: {corrections, changeReason}. Creates new version with parentSnapshotId. Does NOT modify original. |
| GET /api/v1/tax/rules/snapshot/:snapshotId | GET | Admin+ | Fetch exact frozen rules by snapshotId. |
| GET /api/v1/tax/rules/:financialYear/history | GET | Admin+ | All versions for FY with status, usageCount, changeReason. |
| GET /api/v1/tax/brackets/:financialYear | GET | Authenticated | Tax brackets for display. |
| GET /api/v1/tax/hecs-tiers/:financialYear | GET | Authenticated | HECS repayment tiers for display. |
| POST /api/v1/tax/recalculate | POST | Staff+ | Recalculate using specific snapshotId. Does NOT modify records. |
| POST /api/v1/tax/compare | POST | Staff+ | Compare two calculations side-by-side. Returns field-by-field diff. |
| POST /api/v1/tax-results | POST | Staff (assigned) / Admin | Enter official tax results for an order. Populates TaxYearSummary. |
| GET /api/v1/tax-results/:orderId | GET | Staff (assigned) / Client (own) / Admin | View official results. |
| PUT /api/v1/tax-results/:orderId | PUT | Staff (assigned) / Admin | Update results (e.g., after ATO assessment). AuditLog. |
| POST /api/v1/tax-results/:orderId/verify | POST | Senior Staff+ | Mark as verified by second person. |
| POST /api/v1/tax-results/amendment | POST | Staff+ | Create amendment return. Auto-loads original's rulesSnapshotId. Auto-diffs. |
| GET /api/v1/tax-results/:orderId/amendments | GET | Staff+ / Client (own) | List amendments against original. |
| PATCH /api/v1/tax-results/:id/lock | PATCH | Staff+ | Lock return. Freezes all financial figures + rulesSnapshotId. |
| GET /api/v1/tax-results/:orderId/estimates | GET | Staff+ / Admin | All estimates shown for this client+FY. For dispute resolution. |
| POST /api/v1/tax-results/compare/:orderId | POST | Staff+ | Compare estimate vs official result. Shows variance breakdown. |

### 8.12 Tax Calculation Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| TAX-INV-01 | Tax rules are DATA, not hardcoded. All calculation logic reads from rules parameter. | Pure function signature: (input, rules) → output |
| TAX-INV-02 | calculateTaxEstimate is a PURE FUNCTION. No database reads, no side effects. | Function signature enforcement |
| TAX-INV-03 | ALL monetary values in cents (integers). No floating point at any stage. Division: Math.round(). | Integer arithmetic throughout |
| TAX-INV-04 | Tax payable can NEVER be negative. Floor at 0. Excess credits added to refund separately. | max(0, ...) on totalTaxPayable |
| TAX-INV-05 | Every estimate result includes: disclaimer, rulesSnapshotId, rulesVersion, calculatedAt, warnings. ALWAYS. | Output schema validation |
| TAX-INV-06 | Non-residents EXEMPT from: Medicare levy, MLS, LITO, SAPTO. Calculation skips these. | residencyStatus check per step |
| TAX-INV-07 | HECS-HELP is ADDITIONAL to tax payable. Displayed separately. Not in "tax payable" but in "total owing." | Separate line in breakdown |
| TAX-INV-08 | CGT 50% discount: residents only, assets held > 12 months. Non-residents get no discount. | Residency + holding check |
| TAX-INV-09 | Estimates now STORED in taxEstimateLog. Every estimate creates a record. Retained 12 months minimum. | POST /tax/estimate creates log before responding |
| TAX-INV-10 | Admin can update rules anytime. Old calculations retain their rulesSnapshotId forever. | Version tracking + immutability |
| TAX-INV-11 | Budget changes: admin creates draft, reviews, activates. No auto-update from external source. Human verification required. | Draft → active workflow |
| TAX-INV-12 | Estimate calculator is clearly positioned as ESTIMATE. Does NOT replace professional software. No ATO certification claimed. | Disclaimer on every output + UI |

### 8.13 Rule Versioning Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| VER-INV-01 | Once usageCount > 0, taxRuleConfig is PERMANENTLY IMMUTABLE. No modification. Any correction creates new version. | Pre-update middleware rejects if usageCount > 0 |
| VER-INV-02 | Every calculation stores exact rulesSnapshotId. This field is immutable after creation. | Schema: {rulesSnapshotId: {immutable: true}} |
| VER-INV-03 | usageCount increments atomically via $inc. Prevents race conditions. | findOneAndUpdate with $inc |
| VER-INV-04 | Only ONE active taxRuleConfig per FY. Activation atomically supersedes previous. | MongoDB transaction |
| VER-INV-05 | Amendments MUST use original return's rulesSnapshotId. System auto-loads. No manual override. | Amendment endpoint fetches from originalReturnId |
| VER-INV-06 | Locked returns (isLocked=true): NO financial field modification. Only ATO status fields editable. | Pre-update middleware |
| VER-INV-07 | Rule correction creates new version with parentSnapshotId. changeReason REQUIRED. No cascade to existing calculations. | Validation + no cascade |
| VER-INV-08 | When displaying historical return, show rulesVersion from preparation time, NOT current. | UI loads from stored snapshotId |
| VER-INV-09 | Mid-FY overrides apply only to calculations where preparedAt > override.effectiveFrom. | Date check in calculation engine |
| VER-INV-10 | Deleting taxRuleConfig: ONLY if status=draft AND usageCount=0. | Pre-delete guard |
| VER-INV-11 | snapshotId is UUID v4, generated at creation, NEVER regenerated or reused. | UUID generation in pre-save, unique index |
| VER-INV-12 | amendmentChanges auto-calculated by system (diff original vs amended). Staff cannot manually specify. | Server-side diff |
| VER-INV-13 | AuditLog severity=critical for: rule activation, rule correction, return lock, amendment creation. | Post-save middleware |
| VER-INV-14 | Tax result import populates TaxYearSummary automatically. Estimates NEVER write to TaxYearSummary. | Separate write paths |

### 8.14 Tax Use Cases

| UC-ID | Use Case | Flow |
|-------|----------|------|
| TAX-UC-01 | Client checks estimate from portal | 1. Opens "Estimate Calculator" 2. Enters: employment $75K, $2K deductions, has HECS 3. POST /tax/estimate 4. Returns: taxable $73K, tax ~$12.4K, HECS ~$2.2K, withheld $16K, est. refund ~$1.4K 5. Disclaimer shown. CTA: "Start FY2024-25 Return" |
| TAX-UC-02 | Lead conversion quick estimate | 1. Staff on phone 2. Quick estimate: "$95K income, rental losing $8K" 3. Estimated tax saving from negative gearing: ~$2,400 4. "We could save you around $2,400. Come in for full assessment?" 5. Lead → Qualified |
| TAX-UC-03 | Budget updates brackets | 1. Budget announces new brackets for FY2025-26 2. Admin: POST /tax/rules (draft) 3. Reviews vs ATO tables 4. Validates: POST /tax/rules/:id/validate → all tests pass 5. Super Admin activates → old rules preserved 6. AuditLog critical |
| TAX-UC-04 | Admin corrects rule typo after returns lodged | 1. Discovers HECS tier wrong in v1 (snap: abc-123, usageCount: 347) 2. POST /tax/rules/abc-123/correct → new v2 (snap: def-456) 3. v1 STAYS FROZEN — 347 returns unchanged 4. New calcs use v2 |
| TAX-UC-05 | Client disputes estimate | 1. Client: "You said $3,200!" 2. GET /tax-results/:orderId/estimates 3. Shows: QGS-EST-0847, 15 Aug, by Jane, est. refund $3,187 4. "Actual includes bank interest not in estimate" 5. Dispute resolved with evidence |
| TAX-UC-06 | Amendment to prior year | 1. Forgot $3K deductions from FY2023-24 2. Create amendment order (linkedOrderId, same FY) 3. System loads original snap: xyz-789 (FY2023-24 rules) 4. Prepare amended return with FY2023-24 brackets 5. Enter results → auto-diff → additional $900 refund 6. Lodge amendment with ATO |
| TAX-UC-07 | Reproduce 2-year-old calculation for ATO audit | 1. ATO queries FY2022-23 return 2. Load rulesSnapshotId: old-001 3. POST /tax/recalculate with stored input + old-001 rules 4. Output matches stored result exactly 5. Export as PDF for ATO |

## 9. PAYMENT GATEWAY (STRIPE + PAYZOO)

### 9.1 Payment Data Model (payment.js) — SEPARATE COLLECTION

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| paymentNumber | String | auto, unique | QGS-PAY-XXXX |
| orderId | ObjectId ref Order | required, index | Parent order |
| userId | ObjectId ref User | required, index | Payer |
| gateway | Enum | required | stripe, payzoo |
| gatewayTxnId | String | index | Stripe PaymentIntent ID or Payzoo transaction ID |
| gatewayCustomerId | String | — | Stripe Customer ID or Payzoo equivalent |
| idempotencyKey | String | required, unique | Client-generated UUID v4 — prevents duplicate payments |
| amount | Number | required, integer | Amount in cents (AUD). ALWAYS integer. |
| currency | String | default: "AUD" | ISO 4217 currency code |
| status | Enum | required | pending, requires_capture, authorised, captured, succeeded, failed, cancelled, refund_pending, refunded, partially_refunded, disputed |
| capturedAmount | Number | default: 0 | Amount actually captured in cents |
| refundedAmount | Number | default: 0 | Cumulative refund amount in cents |
| failureCode | String | — | Gateway-specific error code |
| failureMessage | String | — | Human-readable failure reason |
| refunds | Array[Object] | — | [{refundId: String, amount: Number, reason: String, gateway: String, gatewayRefundId: String, status: Enum, createdAt: Date, processedAt: Date}] |
| metadata | Object | — | {clientIp, userAgent, deviceType (mobile/web), browserFingerprint} |
| xeroPaymentId | String | — | Linked Xero payment UUID |
| xeroSynced | Boolean | default: false | Has been synced to Xero |
| webhookProcessed | Boolean | default: false | Gateway webhook received and processed |
| webhookProcessedAt | Date | — | Webhook processing timestamp |
| createdAt / updatedAt | Date | auto | Timestamps |

### 9.2 Payment Gateway Config (paymentGatewayConfig.js)

| Field | Type | Description |
|-------|------|-------------|
| primaryGateway | Enum | stripe, payzoo |
| routingRule | Enum | primary_only, fallback, round_robin, amount_based |
| amountThreshold | Number | For amount_based: below threshold → primary, above → secondary (cents) |
| stripeEnabled | Boolean | Toggle Stripe |
| stripePublishableKey | String | Client-side key |
| payzooEnabled | Boolean | Toggle Payzoo |
| payzooPublicKey | String | Client-side key |
| fallbackTimeoutMs | Number | default: 10000 — wait time before fallback |
| maintenanceMode | Boolean | default: false — disable all payments |
| maintenanceMessage | String | User-facing message during maintenance |
| updatedBy | ObjectId ref User | Last modifier |
| updatedAt | Date | auto |

### 9.3 Webhook Event (webhookEvent.js) — REPLAY PROTECTION

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| eventId | String | required, unique | Gateway event ID (Stripe: evt_xxx, Payzoo: equivalent) |
| gateway | Enum | required | stripe, payzoo |
| eventType | String | required | payment_intent.succeeded, charge.refunded, etc. |
| payload | Object | required | Raw webhook body (stored for debugging/replay) |
| processedAt | Date | — | When successfully processed |
| status | Enum | required | received, processing, processed, failed, ignored |
| error | String | — | Processing error details |
| retryCount | Number | default: 0 | Processing retry count |

### 9.4 Payment APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/payments/intent | POST | Client (own) | Create payment intent. Body: {orderId, idempotencyKey, gateway? (optional, uses routing rule if omitted)}. Returns: {clientSecret, gateway, publishableKey, paymentId}. |
| POST /api/v1/payments/capture | POST | Client (own) | Capture authorised payment. Body: {paymentId, idempotencyKey}. |
| POST /api/v1/payments/refund | POST | Admin+ | Initiate refund. Body: {paymentId, amount? (partial, in cents), reason, idempotencyKey}. Full refund if amount omitted. |
| GET /api/v1/payments/:id | GET | Admin+ / Client (own) | Payment detail with gateway status |
| GET /api/v1/payments/:id/status | GET | Client (own) | Real-time status poll from gateway |
| GET /api/v1/payments/order/:orderId | GET | Admin+ / Staff (assigned) / Client (own) | All payments for an order |
| POST /api/v1/webhooks/stripe | POST | Public (signature-verified) | Stripe webhook. Verifies stripe.webhooks.constructEvent(). |
| POST /api/v1/webhooks/payzoo | POST | Public (HMAC-verified) | Payzoo webhook. Verifies HMAC-SHA256 signature. |
| GET /api/v1/payments/config | GET | Admin+ | Current gateway configuration |
| PUT /api/v1/payments/config | PUT | Super Admin | Update gateway config. AuditLog: severity=critical. |
| POST /api/v1/payments/config/test | POST | Admin+ | Test gateway connectivity (creates $0 auth, immediately voids). |
| GET /api/v1/payments/logs | GET | Admin+ | Transaction log. Filters: gateway, status, dateRange, amountRange. Paginated. |
| GET /api/v1/payments/stats | GET | Admin+ | Gateway comparison: success rate, avg latency, failure breakdown, revenue by gateway. |

### 9.5 Payment Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| PAY-INV-01 | Every payment creation requires an idempotencyKey (UUID v4). Duplicate keys return the original response, never create a new payment. | Unique index on idempotencyKey. Pre-create check. |
| PAY-INV-02 | All amounts stored as integers (cents). $165.00 = 16500. No floating point. | Mongoose: type Number, validate: Number.isInteger |
| PAY-INV-03 | Webhook events processed exactly once. WebhookEvent.eventId unique index. Duplicate webhooks return 200 OK without reprocessing. | Check-before-process pattern |
| PAY-INV-04 | Stripe webhooks MUST verify signature using stripe.webhooks.constructEvent(body, sig, endpointSecret). Raw body (not parsed JSON) required. | Express raw body middleware for /webhooks/stripe path |
| PAY-INV-05 | Payzoo webhooks MUST verify HMAC-SHA256 signature from X-Payzoo-Signature header. | HMAC verification middleware |
| PAY-INV-06 | Refund amount can NEVER exceed capturedAmount. Validation: sum(existing refunds) + newRefundAmount <= capturedAmount. | Pre-refund calculation in handler |
| PAY-INV-07 | Payment status transitions are strictly one-directional: pending → authorised → captured → succeeded. Cannot reverse. Only exception: → failed (from any pre-succeeded state), → refunded/partially_refunded (from succeeded). | Transition validator |
| PAY-INV-08 | Gateway fallback triggers ONLY on: network timeout (ETIMEDOUT, ECONNREFUSED), 5xx responses, or gateway maintenance. NEVER on business errors (card_declined, insufficient_funds, expired_card). | Error classification in PaymentRouter: isRetryable() function |
| PAY-INV-09 | Client-side NEVER receives raw gateway objects. All responses pass through PaymentResponseTransformer that strips gateway internals. | Response transformer in controller |
| PAY-INV-10 | maintenanceMode=true: all payment endpoints return 503 {code: "PAYMENT_MAINTENANCE", message: config.maintenanceMessage, retryAfter: 3600}. | Pre-route middleware checks config |
| PAY-INV-11 | Every payment state change creates AuditLog with severity=critical. Includes: old status, new status, gateway, amount, actor. | Post-save middleware |
| PAY-INV-12 | Successful payment triggers: Order.payment association, Xero sync job (BullMQ), push notification to client, in-app notification. | Event emitter: "payment.succeeded" |
| PAY-INV-13 | Failed payment after 3 gateway retries: mark as failed, send push notification "Payment failed", do NOT auto-retry further (client must re-initiate). | Retry count in payment creation flow |

### 9.6 Payment Use Cases

| UC-ID | Use Case | Flow |
|-------|----------|------|
| PAY-UC-01 | Happy path: Stripe payment | 1. Client selects Pay → app calls POST /payments/intent {orderId, idempotencyKey: uuid()} 2. PaymentRouter checks config: primary=stripe → creates Stripe PaymentIntent 3. Stores Payment(status=pending, gateway=stripe) 4. Returns {clientSecret, gateway: "stripe", publishableKey} 5. Client confirms via Stripe SDK 6. Stripe webhook: payment_intent.succeeded 7. WebhookEvent stored, Payment.status→succeeded 8. BullMQ job: sync to Xero 9. Push notification: "Payment of $165.00 received for Order #QGS-O-0042" |
| PAY-UC-02 | Stripe timeout → Payzoo fallback | 1. POST /payments/intent 2. PaymentRouter tries Stripe 3. Stripe ETIMEDOUT after 10s 4. isRetryable=true → Router auto-creates Payzoo intent 5. Returns {clientSecret: payzooSecret, gateway: "payzoo"} 6. Client SDK detects gateway=payzoo, loads Payzoo UI 7. AuditLog: "Gateway fallback: stripe→payzoo, reason: ETIMEDOUT" |
| PAY-UC-03 | Card declined (NO fallback) | 1. POST /payments/intent → Stripe PaymentIntent created 2. Client confirms → Stripe returns card_declined 3. isRetryable=false → NO fallback to Payzoo 4. Return error to client: "Card declined. Please try a different card." |
| PAY-UC-04 | Duplicate network request | 1. Client's network flaky, request sent twice with same idempotencyKey 2. Second request finds existing Payment with this key 3. Returns original response (same clientSecret, same paymentId) 4. Only one PaymentIntent exists in Stripe |
| PAY-UC-05 | Partial refund | 1. Admin: POST /payments/refund {paymentId, amount: 5000, reason: "Overcharge", idempotencyKey} 2. Validate: 0 (existing refunds) + 5000 <= 16500 (captured) ✓ 3. Call gateway.refund(5000) 4. Payment.refundedAmount=5000, status=partially_refunded 5. Refund entry added to Payment.refunds[] 6. BullMQ job: create Xero credit note for $50.00 7. Push notification to client: "Refund of $50.00 processed" |
| PAY-UC-06 | Webhook replay attack | 1. Attacker replays captured webhook 2. POST /webhooks/stripe → verify signature → PASS (same body, valid sig) 3. Check WebhookEvent: eventId already exists, status=processed 4. Return 200 OK, no reprocessing 5. Log: "Duplicate webhook ignored: evt_xxx" |

---


### 9.7 Billing Edge Cases

#### 9.7.1 Prorated Pricing (Partial Cancellation)

When a client cancels a partially-completed order, staff marks each line item's completion status. System recalculates.

**Workflow:** Client requests cancellation → staff reviews line items → marks each: completed (full charge), in_progress (staff enters prorated amount), not_started ($0) → system recalculates finalAmount → if already paid: refund difference → Xero: void old invoice, create adjusted invoice + credit note for difference.

#### 9.7.2 GST Rounding (Australian Rules)

**ATO requirement:** GST calculated PER LINE ITEM, rounded to nearest cent. Total GST = sum of per-item GST. NEVER calculate GST on the total.

All arithmetic in cents (integers): `Math.round(priceInCents / 11)` per line item, then sum.

Example: Service $99 → GST = Math.round(9900/11) = 900 cents ($9.00). Service $165 → GST = Math.round(16500/11) = 1500 cents ($15.00). Total GST = 900 + 1500 = 2400 cents ($24.00).

#### 9.7.3 Invoice Adjustment After Xero Sync

Adjusting an order after its invoice has been synced to Xero is a TWO-STEP atomic operation: void the existing AUTHORISED invoice + create a new invoice with corrected amounts. Never modify a synced Xero invoice in place (Xero doesn't support modifying AUTHORISED invoices). Credit note issued for any paid difference.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/orders/:id/adjust-invoice | POST | Admin+ | Adjust order line items. If Xero invoice exists: void old + create new. AuditLog severity=critical. |

#### 9.7.4 Billing Dispute (billingDispute.js)

| Field | Type | Description |
|-------|------|-------------|
| ticketId | ObjectId ref SupportTicket | Linked support ticket |
| orderId | ObjectId ref Order | Disputed order |
| paymentId | ObjectId ref Payment | Disputed payment |
| disputeType | Enum | overcharge, service_not_delivered, quality_issue, incorrect_amount, duplicate_charge, unauthorised |
| disputedAmount | Number | Amount in dispute (cents) |
| clientStatement | String | Client's description |
| staffAssessment | String | Investigation findings |
| resolution | Enum | full_refund, partial_refund, credit_issued, no_action, service_redo, discount_applied |
| resolvedAmount | Number | Amount resolved (cents) |
| status | Enum | raised, investigating, pending_approval, approved, rejected, completed |
| approvedBy | ObjectId ref User | Admin who approved resolution |
| xeroAdjustmentMade | Boolean | Has Xero been adjusted |
| createdAt / updatedAt | Date | auto |

#### 9.7.5 Write-Off / Bad Debt

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/payments/write-off | POST | Admin+ | Write off unpaid invoice. Requires: outstanding > 90 days, 2+ contact attempts, admin approval. Voids Xero invoice + bad debt entry. AuditLog critical. |

#### 9.7.6 Billing Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| BIL-INV-01 | GST = Math.round(priceInCents / 11) per line item. Sum per-item. Never on total. | GST calculator function |
| BIL-INV-02 | Invoice adjustment after Xero sync: void + recreate atomic. Never modify AUTHORISED. | XeroInvoiceAdjuster |
| BIL-INV-03 | Prorated cancellation: staff marks each line item. System cannot auto-prorate. | UI enforcement |
| BIL-INV-04 | Refunds > $500 (50000 cents) require admin approval. > $2,000 (200000 cents) require super_admin. | Approval gate in refund handler |
| BIL-INV-05 | Write-offs: 90+ days outstanding, 2+ contact attempts documented, admin approval. | Pre-write-off validation |
| BIL-INV-06 | Duplicate charge detection: 2 payments same orderId within 5 min = auto-flag for review. Do NOT auto-refund. | BullMQ post-payment check |
| BIL-INV-07 | All billing disputes create AuditLog severity=critical. | Post-save middleware |


---

## 10. XERO ACCOUNTING INTEGRATION

### 10.1 Xero Connection Config (Stored in Application model or dedicated config)

| Field | Type | Description |
|-------|------|-------------|
| xeroConnected | Boolean | Is Xero connected |
| xeroTenantId | String | Xero organisation tenant ID |
| xeroAccessToken | String (AES-256-GCM encrypted) | OAuth access token — 30 min expiry |
| xeroRefreshToken | String (AES-256-GCM encrypted) | OAuth refresh token |
| xeroTokenExpiresAt | Date | Token expiry timestamp |
| xeroRevenueAccountCode | String | Revenue account code (e.g., "200") |
| xeroBankAccountId | String | Bank account for payment reconciliation |
| xeroGstAccountCode | String | GST collected account (Australian GST) |
| xeroDefaultTaxType | String | "OUTPUT" for GST on sales |

### 10.2 Xero Sync Log (xeroSyncLog.js)

| Field | Type | Description |
|-------|------|-------------|
| entityType | Enum | contact, invoice, payment, credit_note |
| entityId | String | QEGOS entity ID (orderId, paymentId, userId) |
| xeroEntityId | String | Xero UUID |
| action | Enum | create, update, void, delete |
| status | Enum | queued, processing, success, failed, retrying |
| requestPayload | Object | Outgoing API request body |
| responsePayload | Object | Xero API response |
| error | String | Error message if failed |
| retryCount | Number | default: 0, max: 4 |
| nextRetryAt | Date | Scheduled next retry (exponential backoff) |
| processedAt | Date | When completed |
| createdAt | Date | auto |

### 10.3 Xero APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| GET /api/v1/xero/connect | GET | Admin+ | Initiate OAuth 2.0 authorisation flow. Redirect to Xero. |
| GET /api/v1/xero/callback | GET | Public (state param verified) | OAuth callback. Store encrypted tokens. |
| POST /api/v1/xero/disconnect | POST | Admin+ | Revoke tokens, set xeroConnected=false. AuditLog. |
| GET /api/v1/xero/status | GET | Admin+ | Connection status, token health, last sync time. |
| GET /api/v1/xero/config | GET | Admin+ | Account code mapping configuration. |
| PUT /api/v1/xero/config | PUT | Admin+ | Update account mapping. AuditLog. |
| GET /api/v1/xero/accounts | GET | Admin+ | Fetch Chart of Accounts from Xero for dropdown. |
| GET /api/v1/xero/tax-rates | GET | Admin+ | Fetch GST and other tax rates from Xero. |
| POST /api/v1/xero/sync-contact | POST | Admin+ / System | Sync single User to Xero Contact. |
| POST /api/v1/xero/sync-contacts | POST | Admin+ | Bulk sync all unsynced Users. |
| POST /api/v1/xero/create-invoice | POST | System (event-driven) | Create Xero invoice from Order. |
| PUT /api/v1/xero/update-invoice/:orderId | PUT | System | Update invoice when order line items change. |
| POST /api/v1/xero/void-invoice/:orderId | POST | Admin+ | Void invoice (order cancelled). |
| POST /api/v1/xero/bulk-sync-invoices | POST | Admin+ | Sync all orders missing xeroInvoiceId. |
| POST /api/v1/xero/record-payment | POST | System (event-driven) | Record payment as Xero payment against invoice. |
| POST /api/v1/xero/create-credit-note | POST | System | Credit note for refund. |
| GET /api/v1/xero/sync-logs | GET | Admin+ | Sync history. Filters: entityType, status, dateRange. Paginated. |
| POST /api/v1/xero/reconciliation | POST | Admin+ | Compare QEGOS payments vs Xero payments. Flag mismatches > $0.01. |
| POST /api/v1/xero/retry/:syncLogId | POST | Admin+ | Manually retry a failed sync. |

### 10.4 Xero Sync Workflows

**Order → Invoice (Auto-Sync):**
1. Order status changes to In Progress (4) or order created with line items
2. Event emitter: "order.invoiceable"
3. BullMQ job picked up by XeroSyncWorker
4. Check: xeroConnected? → if false, queue with status=queued, retry when reconnected
5. Check: Order has xeroInvoiceId? → if yes, skip (idempotent)
6. Check: User has Xero Contact? → if no, create from User (name, email, mobile, address)
7. Build invoice: line items from Order.lineItems (using priceAtCreation), GST calculation, student discount
8. POST invoice to Xero (status = AUTHORISED)
9. Store xeroInvoiceId + xeroInvoiceNumber on Order
10. XeroSyncLog: status=success

**Payment → Xero Payment (Auto-Sync):**
1. Payment.status changes to succeeded
2. Event emitter: "payment.succeeded"
3. BullMQ job: XeroPaymentSync
4. Find Order.xeroInvoiceId (if no invoice yet, wait and retry)
5. Create Xero Payment against invoice, reference: paymentNumber
6. If overpayment: create Xero Prepayment
7. Store xeroPaymentId on Payment record
8. XeroSyncLog: status=success

**Refund → Credit Note:**
1. Refund processed on gateway
2. Event: "payment.refunded" or "payment.partially_refunded"
3. BullMQ job: XeroCreditNoteSync
4. Create Xero Credit Note against invoice for refund amount
5. Allocate credit note to invoice
6. XeroSyncLog: status=success

### 10.5 Xero Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| XRO-INV-01 | Access and refresh tokens encrypted with AES-256-GCM using per-environment key before storage. Never logged. | Encryption in setter, decryption in getter |
| XRO-INV-02 | Token refresh uses Redis distributed lock (Redlock) to prevent race conditions. Only one refresh at a time; other requests queue. | Redlock with 5-second TTL |
| XRO-INV-03 | All Xero API calls routed through rate limiter: max 60 calls/minute per tenant. Excess queued with delay. | Token bucket in XeroClient wrapper |
| XRO-INV-04 | Before creating invoice, check Order.xeroInvoiceId. If exists, skip. Additionally search Xero by reference (orderNumber) to prevent duplicates from manual Xero entries. | Dual check: local + Xero search |
| XRO-INV-05 | Sync failures retry with exponential backoff: 1min → 5min → 30min → 2hr. After 4 failures: status=failed, Slack alert to admin. | BullMQ retry config + Slack webhook |
| XRO-INV-06 | Xero Contact matched by email (primary), then mobile, never by name (too ambiguous). | Contact lookup strategy in sync |
| XRO-INV-07 | Invoice line items use priceAtCreation from Order, not current Sales catalogue price. | Read from Order.lineItems, not Sales model |
| XRO-INV-08 | Voiding invoice requires Order.status = Cancelled (9). Admin override available with AuditLog severity=critical. | Pre-void status check + admin flag |
| XRO-INV-09 | Reconciliation report flags any payment mismatch > $0.01 between QEGOS and Xero. | Tolerance threshold in reconciliation query |
| XRO-INV-10 | If Xero disconnected: all operations continue normally. Sync jobs queue (status=queued). When reconnected, bulk sync clears queue. | Offline queue pattern |
| XRO-INV-11 | GST calculation in invoice matches Australian rules: GST-inclusive price / 11 = GST component. | Australian GST formula in invoice builder |

---


---

## 11. DOCUMENT MANAGEMENT & SIGNING

### 11.1 Document APIs (Existing, Enhanced)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/documents/create | POST | Staff+ / Admin | Upload document to Zoho Sign for client signing |
| POST /api/v1/documents/send-for-sign | POST | Staff+ / Admin | Send document to client via Zoho Sign |
| POST /api/v1/documents/generate-uri | POST | Staff+ | Generate embedded signing URL for in-app signing |
| POST /api/v1/documents/upload | POST | Client (own) / Staff (assigned) | Upload document to order (S3 storage) |
| POST /api/v1/documents/upload-proof | POST | Client (own) | Upload ID verification documents |
| POST /api/v1/webhooks/zoho | POST | Public (signature verified) | Zoho Sign webhook: receives signed PDFs, emits SIGN_COMPLETE event |
| GET /api/v1/documents/order/:orderId | GET | Staff (assigned) / Client (own) / Admin | List all documents for an order |

### 11.2 Document Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| DOC-INV-01 | All uploaded files virus-scanned (ClamAV) before S3 storage. Infected files quarantined to separate S3 bucket. | ClamAV in upload pipeline |
| DOC-INV-02 | File types restricted to: PDF, JPG, JPEG, PNG, HEIC, TIFF. Validated by magic bytes, not just extension. | file-type npm package + Multer filter |
| DOC-INV-03 | Max file size: 20MB per file, 10 files per order. | Multer limits |
| DOC-INV-04 | S3 objects stored with server-side encryption (SSE-S3). Path: orders/{orderId}/{filename}. | S3 putObject with ServerSideEncryption |
| DOC-INV-05 | Presigned URLs for document download expire in 15 minutes. Never store permanent public URLs. | generatePresignedUrl(Expires: 900) |
| DOC-INV-06 | Document download by staff creates AuditLog with severity=warning. | Post-presign audit |

---

## 12. LEAD MANAGEMENT

### 12.1 Overview

Captures, tracks, nurtures, and converts potential clients into active orders. Centralised system where every interaction — phone calls, walk-ins, SMS inquiries, web form submissions, referrals, WhatsApp messages — is logged with clear next steps and status tracking.

### 12.2 Lead Data Model (lead.js)

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| leadNumber | String | auto, unique | QGS-L-XXXX (auto-increment) |
| source | Enum | required | phone_inbound, phone_outbound, walk_in, web_form, referral, sms_inquiry, whatsapp, social_media, marketing_campaign, repeat_client, partner, google_ads, facebook_ads, other |
| firstName | String | required | Lead first name |
| lastName | String | — | Lead last name |
| mobile | String | required, E.164 (+61XXXXXXXXX) | Primary phone |
| email | String | valid email | Email address |
| preferredLanguage | Enum | — | en, zh, hi, pa, vi, ar, other |
| preferredContact | Enum | — | call, sms, email, whatsapp |
| suburb | String | — | Suburb |
| state | Enum | — | NSW, VIC, QLD, SA, WA, TAS, NT, ACT |
| postcode | String | — | 4-digit Australian postcode |
| financialYear | String | — | Year of interest (e.g., "2024-25") |
| serviceInterest | Array[ObjectId ref Sales] | — | Services interested from catalogue |
| estimatedValue | Number | — | Estimated order value in cents |
| maritalStatus | Enum | — | single, married, de_facto, separated, divorced, widowed |
| hasSpouse | Boolean | — | For joint filing consideration |
| numberOfDependants | Number | — | Dependant count |
| employmentType | Enum | — | employed, self_employed, contractor, retired, student, unemployed, multiple |
| hasRentalProperty | Boolean | — | Investment property flag (high-value indicator for AU) |
| hasSharePortfolio | Boolean | — | Share/crypto investments flag |
| hasForeignIncome | Boolean | — | Foreign income flag |
| status | Number | required, enum: 1-8 | Lead lifecycle status |
| priority | Enum | required, default: "warm" | hot, warm, cold |
| score | Number | default: 0 | Lead score (0-100, auto-calculated) |
| assignedTo | ObjectId ref User | — | Staff assigned |
| nextAction | String | — | Next follow-up action description |
| nextActionDate | Date | — | When to follow up |
| followUpCount | Number | default: 0 | Total follow-ups performed |
| lastContactedAt | Date | — | Last interaction timestamp |
| isConverted | Boolean | default: false | Has been converted to order |
| convertedOrderId | ObjectId ref Order | — | Linked order after conversion |
| convertedUserId | ObjectId ref User | — | Linked user after conversion |
| lostReason | Enum | — | price_too_high, chose_competitor, diy_filing, not_interested, unreachable, timing, already_filed, other |
| lostReasonNote | String | — | Free-text detail for lost reason |
| tags | Array[String] | — | Custom tags for categorisation |
| campaignId | ObjectId ref Campaign | — | If sourced from broadcast |
| referralCode | String | — | Referral code used |
| costPerLead | Number | — | Acquisition cost in cents (for ROI calculation) |
| isDeleted | Boolean | default: false | Soft delete |
| createdAt / updatedAt | Date | auto | Timestamps |

### 12.3 Lead Activity / Conversation Log (leadActivity.js)

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| leadId | ObjectId ref Lead | required, index | Parent lead |
| type | Enum | required | phone_call_outbound, phone_call_inbound, phone_call_missed, sms_sent, sms_received, email_sent, email_received, whatsapp_sent, whatsapp_received, walk_in_meeting, video_call, voicemail_left, note, status_change, assignment_change, follow_up_scheduled, follow_up_completed, follow_up_missed, document_shared, quote_sent, converted |
| subject | String | — | Brief subject line |
| description | String | required | Detailed conversation notes |
| outcome | Enum | — | interested, callback_requested, not_interested, no_answer, voicemail, busy, wrong_number, meeting_booked, quote_requested, converted, needs_documents, thinking, price_enquiry, other |
| sentiment | Enum | — | positive, neutral, negative |
| callDuration | Number | — | Duration in seconds (for phone calls) |
| callDirection | Enum | — | inbound, outbound |
| nextAction | String | — | Follow-up set during this interaction |
| nextActionDate | Date | — | When to follow up |
| quotedAmount | Number | — | If pricing was shared (cents) |
| servicesQuoted | Array[ObjectId ref Sales] | — | Services quoted |
| performedBy | ObjectId ref User | required | Staff who logged this activity |
| attachments | Array[Object] | — | [{fileName, fileUrl, fileType, fileSize}] |
| isSystemGenerated | Boolean | default: false | Auto-logged vs manual entry |
| createdAt | Date | auto | Timestamp |

### 12.4 Follow-Up Reminder (leadReminder.js)

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| leadId | ObjectId ref Lead | required, index | Parent lead |
| assignedTo | ObjectId ref User | required, index | Staff to remind |
| reminderDate | Date | required | Date of reminder |
| reminderTime | String | required | Time (HH:mm format) |
| title | String | required | Reminder title |
| description | String | — | Additional context |
| isCompleted | Boolean | default: false | Done flag |
| completedAt | Date | — | When completed |
| isOverdue | Boolean | default: false | Past due (cron-set) |
| isSnoozed | Boolean | default: false | Postponed |
| snoozedUntil | Date | — | Snoozed until when |
| notificationSent | Boolean | default: false | Push notification sent |
| createdAt | Date | auto | Timestamp |

### 12.5 Lead Status Lifecycle (8 States)

| Code | Label | Description | Colour | Allowed Transitions |
|------|-------|-------------|--------|-------------------|
| 1 | New | Lead captured, not yet contacted | Blue | → 2, 7 |
| 2 | Contacted | First contact made | Orange | → 3, 7, 8 |
| 3 | Qualified | Confirmed as potential client | Yellow | → 4, 7, 8 |
| 4 | Quote Sent | Pricing/services shared | Purple | → 5, 6, 7, 8 |
| 5 | Negotiation | Active discussion, lead considering | Cyan | → 6, 7, 8 |
| 6 | Won/Converted | Converted to order | Green | (terminal) |
| 7 | Lost | Did not convert (with reason required) | Red | → 1 (reopen) |
| 8 | Dormant | No response after multiple attempts | Grey | → 2 (re-engage) |

### 12.6 Lead Scoring Engine (0-100)

| Factor | Points | Condition |
|--------|--------|-----------|
| Has email | +5 | Email provided |
| Complete profile | +10 | All tax profile fields filled |
| Rental property | +15 | hasRentalProperty = true (high-value AU service) |
| Share portfolio | +10 | hasSharePortfolio = true |
| Self-employed / contractor | +15 | employmentType in [self_employed, contractor] |
| Multiple services interested | +10 | serviceInterest.length >= 2 |
| Has spouse | +10 | hasSpouse = true |
| Has dependants | +5 | numberOfDependants > 0 |
| Responded positively | +15 | Activity outcome = interested |
| Requested quote | +10 | Quote activity exists |
| Referral source | +10 | source = referral |
| Repeat client | +15 | source = repeat_client |
| Recent contact (within 3 days) | +5 | lastContactedAt within 72 hours |
| Foreign income (complex) | +10 | hasForeignIncome = true |
| Overdue follow-ups | -10 | Has overdue reminders |
| Multiple no-answer | -10 | 3+ no_answer outcomes |
| Gone cold (no activity 7+ days) | -5 | No activity in 7 days |

Score recalculates on: activity creation, status change, profile update, reminder completion/overdue.

Auto-priority thresholds: 0-30 = cold, 31-60 = warm, 61-100 = hot.

### 12.7 Lead Backend APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/leads | POST | Staff+ / Admin | Create lead. Returns {lead, isDuplicate, duplicateMatches[]} if potential dups found. |
| GET /api/v1/leads | GET | Staff (assigned) / Admin+ | List with filters: status, priority, source, assignedTo, dateRange, state, tags, hasFollowUpDue, search. Paginated. Scope-filtered. |
| GET /api/v1/leads/:id | GET | Staff (assigned) / Admin+ | Full detail with populated refs. |
| PUT /api/v1/leads/:id | PUT | Staff (assigned) / Admin+ | Update lead info. Triggers score recalculation. |
| PATCH /api/v1/leads/:id/status | PATCH | Staff (assigned) / Admin+ | Status transition. Validates state machine. Body: {status, lostReason?, lostReasonNote?}. AuditLog. |
| PUT /api/v1/leads/:id/assign | PUT | Admin+ / Office Manager | Assign/reassign to staff. AuditLog. Push notification to new assignee. |
| PUT /api/v1/leads/bulk-assign | PUT | Admin+ | Bulk assign. Body: {leadIds[], assignedTo}. |
| PATCH /api/v1/leads/bulk-status | PATCH | Admin+ | Bulk status change. Body: {leadIds[], status, lostReason?}. |
| POST /api/v1/leads/import | POST | Admin+ | Excel/CSV upload. Two-pass: validate all rows → import all. Returns {imported, errors[]}. |
| POST /api/v1/leads/export | POST | Admin+ | Export filtered leads as Excel. |
| POST /api/v1/leads/search | POST | Staff+ | Full-text search on name, mobile, email. |
| POST /api/v1/leads/check-duplicate | POST | Staff+ | Check mobile AND email for existing leads. Returns matches with confidence. |
| POST /api/v1/leads/merge | POST | Admin+ | Merge two leads. Body: {primaryLeadId, secondaryLeadId, fieldSelections: {name: "primary", email: "secondary", ...}}. AuditLog. |
| POST /api/v1/leads/activities | POST | Staff (assigned) / Admin+ | Log activity. Body: {leadId, type, description, outcome, ...}. Updates Lead.lastContactedAt and Lead.score. |
| GET /api/v1/leads/:id/activities | GET | Staff (assigned) / Admin+ | All activities for lead, chronological. Paginated. |
| PUT /api/v1/leads/activities/:id | PUT | Activity creator / Admin | Edit activity notes/outcome. |
| POST /api/v1/leads/log-call | POST | Staff+ | Shortcut: log outbound call with duration, outcome, notes, next step. |
| GET /api/v1/leads/staff/:staffId/activities | GET | Staff (own) / Admin+ | All activities by specific staff. |
| GET /api/v1/leads/todays-calls | GET | Staff (own) / Admin+ | All call activities today. |
| POST /api/v1/leads/reminders | POST | Staff+ | Create follow-up reminder. |
| GET /api/v1/leads/:id/reminders | GET | Staff (assigned) / Admin+ | Reminders for a lead. |
| GET /api/v1/leads/reminders/today | GET | Staff (own) / Admin+ | Today's pending follow-ups. |
| GET /api/v1/leads/reminders/overdue | GET | Staff (own) / Admin+ | All overdue reminders. |
| PATCH /api/v1/leads/reminders/:id/complete | PATCH | Staff+ | Mark reminder done. |
| PATCH /api/v1/leads/reminders/:id/snooze | PATCH | Staff+ | Snooze to new date/time. |
| POST /api/v1/leads/:id/convert | POST | Staff+ / Admin | Convert lead → create User (if new) + Order. Pre-fills from lead data. Sets isConverted=true, links IDs. AuditLog. MongoDB transaction. |
| POST /api/v1/leads/:id/convert-existing | POST | Staff+ / Admin | Link to existing user, create order. |
| GET /api/v1/leads/stats/dashboard | GET | Admin+ | Total, by status, by source, conversion rate, pipeline value. |
| GET /api/v1/leads/stats/pipeline | GET | Admin+ | Kanban data: leads grouped by status with counts and values. |
| GET /api/v1/leads/stats/staff | GET | Admin+ | Per-staff: assigned, contacted, converted, follow-up compliance %. |
| GET /api/v1/leads/stats/source | GET | Admin+ | Conversion rate and avg value by source. |
| GET /api/v1/leads/stats/aging | GET | Admin+ | Leads by age per status bucket. |

### 12.8 Lead Automation Rules (Cron-based via BullMQ)

| Rule | Trigger | Action |
|------|---------|--------|
| Auto-assign | New lead, no assignedTo | Round-robin to active staff (skip inactive, skip at-max-capacity) |
| Stale alert | New lead > 24hr no activity | Push notification + Slack alert to assignee and admin |
| Auto-dormant | Contacted + 14 days no activity | Status → Dormant. System-generated activity log. |
| Follow-up escalation | Reminder overdue > 2 hours | Slack alert to admin with lead details |
| Re-engagement flag | Dormant > 30 days | Tag as "re-engagement" for broadcast targeting |
| Duplicate detection | New lead, existing mobile OR email | Flag but don't block. Return matches. |
| Score recalculation | Any lead activity, status change, profile update | Recalculate score, update priority if threshold crossed |
| Overdue marker | Reminder past reminderDate+reminderTime | Set isOverdue=true, send push notification |

### 12.9 Lead Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| LM-INV-01 | Lead deduplication checks mobile AND email ($or query). Match on either = potential duplicate. Returns matches with confidence score, does NOT block creation. | Pre-create duplicate check with response |
| LM-INV-02 | Status transitions follow defined state machine. Invalid transition returns 400 with {currentStatus, allowedTransitions}. | Adjacency map validator |
| LM-INV-03 | Transition to Lost (7) requires lostReason field. Without it, return 400. | Express-validator conditional |
| LM-INV-04 | Lead conversion (→6) is atomic: set isConverted=true AND create User (if new) AND create Order AND link all IDs in a single MongoDB transaction. | MongoDB multi-document transaction |
| LM-INV-05 | A lead can be converted ONCE. Subsequent convert attempts return 409 {code: "ALREADY_CONVERTED", convertedOrderId}. | Pre-convert check |
| LM-INV-06 | Lead merge: ALL activities from secondary lead transferred to primary. ALL reminders transferred. Secondary lead soft-deleted. AuditLog with both IDs. | Bulk update in merge handler |
| LM-INV-07 | Round-robin assignment skips staff where: status=false, current lead count >= configurable max (default: 50). | Staff query with filters in assignment algorithm |
| LM-INV-08 | Bulk import: two-pass validation. Pass 1: validate every row (mobile format, required fields, duplicate check). Pass 2: insert all. If ANY row fails pass 1, NOTHING imports. Returns row-level errors. | Validation-first pattern |
| LM-INV-09 | Lead.mobile normalised to E.164 (+61XXXXXXXXX) on save. "0412345678" → "+61412345678". | Pre-save normalisation hook |
| LM-INV-10 | Soft-deleted leads excluded from all queries except admin "Deleted" view. Activities and reminders for deleted leads preserved for audit. | Default query middleware: {isDeleted: {$ne: true}} |
| LM-INV-11 | Score recalculates on every event. If score crosses priority threshold, priority auto-updates and push notification sent to assigned staff. | Post-score-calc threshold check |
| LM-INV-12 | Lead.estimatedValue is in cents (integer). | Mongoose validate |

### 12.10 Lead Admin Panel Features

**Lead Dashboard (/leads/dashboard):** Stat cards (Total Active, New This Week, Hot Leads, Today's Follow-ups, Conversion Rate, Pipeline Value). Charts: Pipeline Funnel, Leads by Source (pie), Conversion Trend (line), Staff Performance (bar).

**Lead List (/leads):** Tabs: All | New | Active Pipeline | Won | Lost | Dormant | My Leads. Columns: Lead#, Name, Mobile, Source, Status, Priority, Assigned To, Next Action, Last Contacted, Value, Age. Filters: Status, Priority, Source, Staff, Date Range, State, Tags, Has Follow-up Due. Bulk actions: Assign, Status Change, Export, Delete.

**Lead Detail (/leads/:id):** Left panel: Contact info, Priority/Score badges, Status dropdown with transition validation, Tax profile, Quick actions (Log Call, Send SMS, Send WhatsApp, Schedule Follow-up, Convert). Right panel: Activity timeline (chronological), inline forms for Add Note/Log Call. Prominent Next Steps section with overdue indicator.

**Pipeline Kanban (/leads/pipeline):** Drag-and-drop columns: New → Contacted → Qualified → Quote Sent → Negotiation → Won. Cards: name, mobile, priority dot, estimated value, next action date, staff avatar. Summary row: count + total value per column.

**Staff Mobile Lead Companion:** Bottom tab "Leads" for staff users. LeadList: today's follow-ups + recently assigned. LeadDetail: contact info + activity timeline + quick actions. LogCallScreen: call logging form. AddLeadScreen: quick capture. LeadReminders: today's pending + overdue.

---


---

## 13. BROADCAST ENGINE (SMS + EMAIL + WHATSAPP)

### 13.1 Overview

Unified multi-channel communication engine. Targeted campaigns to Leads, Users, and custom audiences with scheduling, templates, segmentation, analytics, and Spam Act 2003 compliance. Uses Twilio (SMS), Amazon SES (Email), and Meta Cloud API (WhatsApp).

**CRITICAL ARCHITECTURE DECISION:** Gmail SMTP is NOT used for broadcasts. Gmail limits (500/day regular, 2000/day Workspace) are wholly inadequate for marketing campaigns. Amazon SES handles all campaign email at $0.10/1000 messages with proper bounce handling, DKIM, and deliverability tooling.

### 13.2 Data Models

**Broadcast Campaign (broadcastCampaign.js)**

| Field | Type | Description |
|-------|------|-------------|
| campaignId | String (auto) | QGS-BC-XXXX |
| name | String (required) | Campaign name |
| channel | Enum | sms, email, whatsapp, sms_email, all |
| status | Enum | draft, scheduled, sending, paused, sent, failed, cancelled |
| audienceType | Enum | all_leads, filtered_leads, all_users, filtered_users, custom_list |
| audienceFilters | Object | {leadStatus[], priority[], source[], state[], tags[], userType[], financialYear, hasConsent: Boolean} |
| customList | Array[Object] | [{mobile, email, firstName, lastName}] — for imported audiences |
| smsTemplateId / emailTemplateId / whatsappTemplateId | ObjectId ref | Template references |
| smsBody | String | Final SMS content (merge tags resolved at send time) |
| emailSubject / emailBody | String | Final email content |
| whatsappTemplateName | String | Pre-approved WhatsApp template name |
| whatsappTemplateParams | Array[String] | Parameter values for WhatsApp template |
| scheduledAt | Date | Null = immediate send |
| totalRecipients | Number | Audience count (calculated at send time) |
| sentCount / failedCount | Number | Delivery counters |
| openCount / clickCount | Number | Email engagement (email only) |
| optOutCount | Number | Opt-outs from this campaign |
| abTest | Object | {enabled: Boolean, variants: [{name, subject, body, percentage}], winnerMetric: "open_rate" or "click_rate", winnerSelectedAt: Date} |
| costEstimate | Number | Estimated cost in cents (SMS: count × $0.075, Email: count × $0.001, WhatsApp: count × $0.05) |
| createdBy | ObjectId ref User | Campaign creator |
| createdAt / updatedAt | Date | auto |

**Broadcast Template (broadcastTemplate.js)**

| Field | Type | Description |
|-------|------|-------------|
| name | String (required) | Template name |
| channel | Enum | sms, email, whatsapp |
| category | Enum | follow_up, promotion, reminder, announcement, welcome, re_engagement, deadline, review_request |
| subject | String | Email subject (email only) |
| body | String (required) | Message with merge tags: {{firstName}}, {{lastName}}, {{leadNumber}}, {{orderNumber}}, {{serviceName}}, {{financialYear}}, {{deadlineDate}}, {{staffName}}, {{companyName}} |
| isActive | Boolean | Enabled/disabled |
| usageCount | Number | Times used (for sorting) |
| createdBy | ObjectId ref User | Creator |

**Broadcast Message (broadcastMessage.js) — per-recipient tracking**

| Field | Type | Description |
|-------|------|-------------|
| campaignId | ObjectId ref | Parent campaign |
| recipientId | ObjectId | Lead or User ID |
| recipientType | Enum | lead, user, custom |
| recipientMobile / recipientEmail | String | Resolved contact |
| channel | Enum | sms, email, whatsapp |
| status | Enum | queued, sending, sent, delivered, failed, bounced, opened, clicked, opted_out |
| gatewayId | String | Twilio SID / SES Message ID / WhatsApp Message ID |
| error | String | Error details |
| sentAt / deliveredAt / openedAt / clickedAt | Date | Lifecycle timestamps |
| abVariant | String | Which A/B variant was sent |

**DND / Opt-Out List (broadcastOptOut.js)**

| Field | Type | Description |
|-------|------|-------------|
| contact | String | Mobile (E.164) or email address |
| contactType | Enum | mobile, email |
| channel | Enum | sms, email, whatsapp, all |
| reason | Enum | user_request, reply_stop, bounce_hard, bounce_soft_3x, admin_manual, spam_complaint |
| campaignId | ObjectId ref | Triggering campaign (if applicable) |
| createdAt | Date | auto |

**Consent Record (consentRecord.js)**

| Field | Type | Description |
|-------|------|-------------|
| contactId | ObjectId | User or Lead ID |
| contactType | Enum | user, lead |
| channel | Enum | sms, email, whatsapp, push |
| consented | Boolean | true = opted in |
| consentSource | Enum | signup, import, referral, web_form, verbal, admin_manual |
| consentDate | Date | When consent was given |
| consentEvidence | String | Description: "Signed up via mobile app", "Imported from CSV with consent column" |
| withdrawnAt | Date | When consent was withdrawn (if applicable) |

### 13.3 Broadcast APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/broadcasts/campaigns | POST | Admin+ / Office Manager | Create campaign (draft). |
| GET /api/v1/broadcasts/campaigns | GET | Admin+ | List with filters, pagination. |
| GET /api/v1/broadcasts/campaigns/:id | GET | Admin+ | Detail with stats. |
| PUT /api/v1/broadcasts/campaigns/:id | PUT | Admin+ | Edit draft/paused campaign only. |
| POST /api/v1/broadcasts/campaigns/:id/send | POST | Admin+ | Send immediately or schedule. Recalculates audience at execution time. |
| PATCH /api/v1/broadcasts/campaigns/:id/pause | PATCH | Admin+ | Pause sending campaign. |
| PATCH /api/v1/broadcasts/campaigns/:id/resume | PATCH | Admin+ | Resume paused campaign. |
| POST /api/v1/broadcasts/campaigns/:id/duplicate | POST | Admin+ | Clone as new draft. |
| POST /api/v1/broadcasts/campaigns/:id/preview | POST | Admin+ | Preview with sample merge data. |
| POST /api/v1/broadcasts/campaigns/:id/audience-count | POST | Admin+ | Calculate audience count with current filters. |
| GET /api/v1/broadcasts/campaigns/:id/messages | GET | Admin+ | Per-recipient delivery log. Paginated. |
| GET /api/v1/broadcasts/campaigns/:id/stats | GET | Admin+ | Delivery, open, click, opt-out rates. |
| POST /api/v1/broadcasts/templates | POST | Admin+ | Create template. |
| GET /api/v1/broadcasts/templates | GET | Admin+ | List by channel/category. |
| PUT /api/v1/broadcasts/templates/:id | PUT | Admin+ | Edit template. |
| POST /api/v1/broadcasts/optouts | POST | Admin+ | Add to opt-out list. |
| GET /api/v1/broadcasts/optouts | GET | Admin+ | List all opt-outs. Paginated. |
| POST /api/v1/broadcasts/optouts/check | POST | Admin+ | Check if contact is opted out. |
| POST /api/v1/broadcasts/optouts/import | POST | Admin+ | Bulk import DND via Excel. |
| GET /api/v1/broadcasts/dashboard | GET | Admin+ | Overall broadcast analytics. |
| POST /api/v1/broadcasts/campaigns/:id/export | POST | Admin+ | Export delivery report as Excel. |

### 13.4 Sending Engine

**SMS (Twilio):** Rate limit: 10 msg/sec. Batch: 2500/cron run. STOP keyword detection → auto-add to DND. SID stored per message.

**Email (Amazon SES):** HTML templates with merge tags. Open tracking: 1x1 pixel (caveat: Apple Mail Privacy blocks ~50% — display disclaimer on open rates). Click tracking: link rewriting through /api/v1/broadcasts/track/:messageId. Bounce handling: SES SNS notifications for bounces and complaints. Hard bounce → immediate DND. 3x soft bounce → DND. Spam complaint → immediate DND.

**WhatsApp (Meta Cloud API):** Template messages only for business-initiated. Freeform within 24hr of client message. Per-message delivery and read receipts from Meta webhook.

**Cron Jobs (BullMQ):**

| Job | Schedule | Action |
|-----|----------|--------|
| process-sms-queue | Every 5 min | Send queued SMS (batch 2500, rate 10/sec) |
| process-email-queue | Every 5 min | Send queued emails (batch 500, rate 100/sec) |
| process-whatsapp-queue | Every 5 min | Send queued WhatsApp (batch 500, rate 80/sec) |
| trigger-scheduled | Every 1 min | Start campaigns where scheduledAt <= now |
| sync-delivery-status | Every 15 min | Poll Twilio for SMS delivery updates |
| check-campaign-completion | Every 10 min | Mark campaigns as "sent" when all messages processed |
| process-bounces | Continuous (SES SNS) | Handle bounce/complaint notifications |

### 13.5 Spam Act 2003 Compliance (Australia)

| Requirement | Implementation |
|-------------|---------------|
| Consent required | ConsentRecord checked pre-send. No consent = no message. |
| Identify sender | All SMS include business name. All emails include From name + ABN. |
| Unsubscribe mechanism | SMS: "Reply STOP to unsubscribe" auto-appended. Email: unsubscribe link auto-appended. |
| Honour opt-out within 5 business days | Immediate effect: DND list checked at send time, not schedule time. |
| No harvested addresses | Import requires consent column. Admin must confirm consent source. |

### 13.6 Broadcast Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| BRC-INV-01 | NEVER send to a contact on the DND/opt-out list. Check at SEND time (not schedule time) because contacts can opt out between scheduling and execution. | Pre-send DND check in queue processor |
| BRC-INV-02 | SMS includes "Reply STOP to unsubscribe" footer automatically. Cannot be removed. | Template renderer auto-appends |
| BRC-INV-03 | Email includes sender identification (business name + ABN) and unsubscribe link. Cannot be removed. | Template renderer auto-appends |
| BRC-INV-04 | Hard bounce (550) = immediate DND for email. 3x soft bounce from same address = DND. Spam complaint = immediate DND for all channels. | Bounce handler + complaint handler |
| BRC-INV-05 | Campaign in "sending" status cannot be edited. Only "draft" and "paused" are editable. | Pre-edit status check |
| BRC-INV-06 | Audience recalculated at execution time. Contacts added/removed between schedule and send are reflected. | Just-in-time audience resolution |
| BRC-INV-07 | Consent record required per contact per channel. No ConsentRecord = no message. Import must include consent column. | Pre-send consent check |
| BRC-INV-08 | Merge tag failures use fallback values: {{firstName}} → "Valued Client", {{lastName}} → "". Never send "Hello {{firstName}}". | Template renderer with fallback map |
| BRC-INV-09 | Open rate metrics display disclaimer: "Open tracking may be blocked by some email clients (Apple Mail Privacy Protection). Actual opens may be 30-50% higher." | UI disclaimer on analytics |
| BRC-INV-10 | Campaign cost estimate calculated pre-send and displayed to admin for approval before sending. | Pre-send cost calculation in audience count endpoint |

---


---

## 14. CLIENT PORTAL & DOCUMENT VAULT

### 14.1 Vault Document (vaultDocument.js)

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| userId | ObjectId ref User | required, index | Owner |
| financialYear | String | required | "2024-25" Australian FY format |
| category | Enum | required | payg_summary (Payment Summary), interest_statement, dividend_statement, managed_fund_statement, rental_income, self_employment, private_health_insurance, donation_receipt, work_expense_receipt, self_education, vehicle_logbook, home_office, notice_of_assessment, tax_return_copy, bas_statement, id_document, superannuation_statement, foreign_income, capital_gains_record, other |
| fileName | String | required | Original filename |
| fileUrl | String | required | S3 URL: vault/{userId}/{financialYear}/{uuid}-{filename} |
| fileSize | Number | required | Size in bytes |
| mimeType | String | required | Validated MIME type |
| description | String | — | User notes |
| uploadedBy | Enum | required | client, staff, system |
| uploadedByUserId | ObjectId ref User | — | Specific uploader |
| version | Number | default: 1 | Document version |
| previousVersionId | ObjectId ref VaultDocument | — | Previous version reference |
| isArchived | Boolean | default: false | Soft-delete flag |
| archivedAt | Date | — | When archived |
| ocrExtracted | Object | — | {employerName, grossIncome, taxWithheld, netIncome, abnNumber, dateRange} — auto-extracted via OCR |
| ocrStatus | Enum | — | pending, completed, failed, not_applicable |
| virusScanStatus | Enum | required | pending, clean, infected, error |
| virusScanAt | Date | — | When scanned |
| tags | Array[String] | — | User-defined tags |
| createdAt / updatedAt | Date | auto | Timestamps |

### 14.2 Tax Year Summary (taxYearSummary.js)

| Field | Type | Description |
|-------|------|-------------|
| userId | ObjectId ref User | required, unique with financialYear |
| financialYear | String | "2024-25" |
| orderId | ObjectId ref Order | Associated order |
| totalIncome | Number | Gross income in cents |
| totalDeductions | Number | Total deductions in cents |
| taxableIncome | Number | Net taxable in cents |
| medicareLevyAmount | Number | Medicare levy in cents |
| hecsRepayment | Number | HECS-HELP repayment in cents |
| totalTaxPayable | Number | Total tax liability in cents |
| taxWithheld | Number | PAYG tax already withheld in cents |
| refundOrOwing | Number | Positive = refund, negative = owing (cents) |
| superannuationReported | Number | Super reported in cents |
| filingDate | Date | When return was lodged |
| assessmentDate | Date | ATO assessment date |
| noaReceived | Boolean | Notice of Assessment received |
| atoRefundStatus | Enum | not_filed, filed, processing, assessed, refund_issued, payment_due |
| atoRefundIssuedDate | Date | When refund was issued |
| servicesUsed | Array[String] | Services from Sales catalogue |
| totalPaidToQegos | Number | Amount paid to QEGOS in cents |
| createdAt / updatedAt | Date | auto |

### 14.3 Client Portal APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/vault/upload | POST | Client (own) / Staff (assigned) | Upload document. Virus scan → S3 storage → metadata. |
| POST /api/v1/vault/bulk-upload | POST | Client (own) / Staff (assigned) | Upload multiple files at once. |
| GET /api/v1/vault/documents | GET | Client (own) / Staff (assigned) / Admin | List by year, category, tags. Paginated. |
| GET /api/v1/vault/documents/:id | GET | Client (own) / Staff (assigned) / Admin | Document detail + presigned S3 URL (15min expiry). |
| PUT /api/v1/vault/documents/:id | PUT | Client (own) / Admin | Update metadata (category, tags, description). |
| DELETE /api/v1/vault/documents/:id | DELETE | Client (own) / Admin | Soft-delete (isArchived=true). 30-day grace before hard delete. |
| GET /api/v1/vault/years | GET | Client (own) / Staff (assigned) | List all FYs with document counts. |
| GET /api/v1/vault/prefill/:financialYear | GET | Client (own) / Staff (assigned) | Pull prior-year data for form pre-population. Returns suggested values. |
| GET /api/v1/vault/storage | GET | Client (own) | Storage usage: {used: bytes, quota: bytes, breakdown: [{year, size}]}. |
| POST /api/v1/tax-summaries | POST | System / Admin | Create/update tax year summary after filing. |
| GET /api/v1/tax-summaries | GET | Client (own) | All year summaries for current user. |
| GET /api/v1/tax-summaries/:year/compare | GET | Client (own) | Year-over-year comparison. |
| GET /api/v1/ato-status/:year | GET | Client (own) / Staff (assigned) | ATO refund status for given year. |
| PUT /api/v1/ato-status/:year | PUT | Staff+ / Admin | Update ATO status for client. Triggers push notification. |
| PUT /api/v1/ato-status/bulk | PUT | Admin | Bulk ATO status update (when batch of NOAs arrive). |

### 14.4 Client Portal Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| CPV-INV-01 | Every uploaded file virus-scanned (ClamAV) before S3 storage. Infected files quarantined to separate bucket. Client receives error: "File could not be uploaded. Please scan your device and try again." | ClamAV in upload pipeline |
| CPV-INV-02 | S3 path: vault/{userId}/{financialYear}/{uuid}-{originalFilename}. Per-user isolation. | Upload middleware enforces path structure |
| CPV-INV-03 | Presigned S3 URLs expire in 15 minutes. URLs never cached or stored in database. Generated on-demand per request. | generatePresignedUrl(Expires: 900) |
| CPV-INV-04 | Allowed types: PDF, JPG, JPEG, PNG, HEIC, TIFF. Validated by magic bytes (file-type package), not just extension. Max 20MB per file. | Multer filter + file-type + size limit |
| CPV-INV-05 | Delete = soft-delete (isArchived=true). Hard delete by cron after 30-day grace period. Admin can restore within grace period. | isArchived flag, cron for permanent deletion, restore endpoint |
| CPV-INV-06 | Storage quota checked BEFORE upload. Reject if insufficient: {code: "STORAGE_EXCEEDED", used, quota, fileSize}. | Pre-upload calculation |
| CPV-INV-07 | Re-upload for same category+financialYear creates new version. Previous version preserved with link. | version field, previousVersionId |
| CPV-INV-08 | Staff accessing client vault documents creates AuditLog severity=warning. | Audit in presigned URL generation |
| CPV-INV-09 | Tax year summary financial figures are system-generated from order data. No manual editing of income/deduction/tax amounts. Only ATO status fields are staff-editable. | Separate endpoints: system-only for financials, staff-accessible for ATO status |
| CPV-INV-10 | Prior-year prefill returns suggested values only. Client must confirm/edit before order submission. Prefill data is read-only from vault. | Prefill endpoint returns {suggested: {...}, source: "FY2023-24"} |

---


### 14.5 File Storage Abuse Protection

#### Quota Enforcement (Efficient Counter)

`User.storageUsed` is a running counter updated atomically with MongoDB `$inc` on upload and delete. No full recalculation on the hot path.

**On Upload:** Read user.storageUsed → if storageUsed + newFileSize > storageQuota → reject → else upload to S3 → atomically $inc storageUsed.

**On Hard Delete (30-day cron):** Delete from S3 → atomically $inc storageUsed by -fileSize. S3 delete MUST succeed before counter decrement.

**Monthly Reconciliation:** Cron sums all vaultDocument.fileSize per user, compares to storageUsed. Mismatch > 1MB → auto-correct counter + log discrepancy.

#### Duplicate File Detection

| Field (NEW on vaultDocument) | Type | Description |
|------------------------------|------|-------------|
| contentHash | String | SHA-256 hash of file content |

On upload: calculate SHA-256 hash → check existing {userId, financialYear, contentHash} → if match: return WARNING (not error): "This file appears identical to [filename] uploaded on [date]. Upload anyway?" → advisory only, not blocking.

#### Upload Rate Limits

| Limit | Value | Enforcement |
|-------|-------|-------------|
| Files per user | 20 per 10 minutes | express-rate-limit keyed on userId + path |
| Bandwidth per user | 100MB per 10 minutes | Custom middleware tracking upload size |
| Concurrent uploads | 5 simultaneous per user | Redis semaphore counter |

#### Storage Alerts

| Alert | Trigger | Action |
|-------|---------|--------|
| High storage | User at 80% quota | Push: "You're using 80% of your storage." |
| Quota reached | User at 100% | Block uploads. Clear error with breakdown. |
| Platform-wide | Total S3 > configured threshold | Slack alert to admin with per-user breakdown. |
| Orphaned files | S3 objects without matching DB record | Weekly cron: detect and report for admin review. |

#### Storage Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| STR-INV-01 | storageUsed updated atomically with $inc. Monthly reconciliation corrects drift > 1MB. | Atomic ops + reconciliation cron |
| STR-INV-02 | Duplicate detection is advisory (warning), not blocking. Staff/client can override. | Response: {duplicateWarning, existingFile, allowOverride: true} |
| STR-INV-03 | Upload rate limits per userId, not per IP (clients on shared networks). | JWT-keyed rate limiter |
| STR-INV-04 | Hard delete: S3 first, then counter decrement. S3 fail = retry, never decrement without confirmed S3 deletion. | Transactional order |
| STR-INV-05 | Monthly reconciliation: sum fileSize vs storageUsed. Mismatch > 1MB = auto-correct + log. | Reconciliation cron |


---

## 15. IN-APP CHAT & COMMUNICATION HUB

### 15.1 Chat Conversation (chatConversation.js)

| Field | Type | Description |
|-------|------|-------------|
| userId | ObjectId ref User | Client in conversation |
| staffId | ObjectId ref User | Assigned staff (auto from order assignment) |
| orderId | ObjectId ref Order | Related order (optional) |
| status | Enum | active, resolved, archived |
| lastMessageAt | Date | For sorting |
| lastMessagePreview | String | First 100 chars of last message |
| unreadCountUser / unreadCountStaff | Number | Unread badge counts |
| subject | String | Auto-set from order or manual |
| createdAt / updatedAt | Date | auto |

### 15.2 Chat Message (chatMessage.js)

| Field | Type | Description |
|-------|------|-------------|
| conversationId | ObjectId ref ChatConversation | required, index |
| senderId | ObjectId ref User | Message author |
| senderType | Enum | client, staff, system |
| type | Enum | text, file, canned_response, system_event |
| content | String | Message text (TFN patterns auto-redacted in storage) |
| contentOriginal | String (encrypted) | Original content before redaction (accessible only to assigned staff + admin) |
| fileUrl / fileName / fileSize / mimeType | String / Number | Attachment details (S3) |
| isRead | Boolean | Read receipt |
| readAt | Date | When read |
| createdAt | Date | auto, index |

### 15.3 Canned Response (cannedResponse.js)

| Field | Type | Description |
|-------|------|-------------|
| title | String (required) | Short label: "Documents Needed" |
| content | String (required) | Full response text with merge tags |
| category | Enum | general, documents, payment, status, deadline, tax_info |
| createdBy | ObjectId ref User | Creator |
| isGlobal | Boolean | Available to all staff vs personal |
| usageCount | Number | Times used |

### 15.4 Chat APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| GET /api/v1/chat/conversations | GET | Authenticated | Staff: all assigned. Client: own. Admin: all. Paginated. |
| POST /api/v1/chat/conversations | POST | Authenticated | Find or create conversation for user+staff pair. |
| GET /api/v1/chat/conversations/:id/messages | GET | Authenticated (participant or admin) | Paginated message history. |
| POST /api/v1/chat/messages | POST | Authenticated (participant) | Send message (text or file). Emits Socket.io event. |
| PATCH /api/v1/chat/messages/:id/read | PATCH | Authenticated (recipient) | Mark as read. |
| PATCH /api/v1/chat/conversations/:id/resolve | PATCH | Staff+ | Mark conversation resolved. |
| PATCH /api/v1/chat/conversations/:id/transfer | PATCH | Admin+ | Transfer conversation to different staff. AuditLog. |
| GET /api/v1/chat/unread-count | GET | Authenticated | Total unread across all conversations. |
| GET /api/v1/chat/canned-responses | GET | Staff+ | List by category. |
| POST /api/v1/chat/canned-responses | POST | Staff+ | Create canned response. |
| POST /api/v1/chat/search | POST | Admin+ | Full-text search across messages. |

### 15.5 Socket.io Events

| Event | Direction | Description |
|-------|-----------|-------------|
| new_message | Server → Client | New message in conversation. Payload: {conversationId, message}. |
| message_read | Server → Client | Message marked as read. Payload: {conversationId, messageId, readAt}. |
| typing_indicator | Client → Server → Client | User is typing. 3-second debounce, 10-second auto-expire. |
| conversation_resolved | Server → Client | Conversation marked resolved. |
| staff_presence | Server → Client | Staff online/offline status. |

**Socket.io Architecture:** Redis adapter for horizontal scaling. JWT auth on connection. Rooms: conversation_{id}. Offline users receive Firebase push notification as fallback.

### 15.6 Chat Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| CHT-INV-01 | Messages containing TFN patterns (XXX XXX XXX or XXXXXXXXX) auto-redacted in stored content field. Original preserved in encrypted contentOriginal field. | Regex detection + encryption in pre-save hook |
| CHT-INV-02 | Files shared in chat go through same virus scan as vault uploads. | Shared upload pipeline with ClamAV |
| CHT-INV-03 | One active conversation per client at a time. New messages go to existing active conversation. | findOrCreate with {userId, status: "active"} |
| CHT-INV-04 | If client has no assigned staff, chat routes to admin pool (round-robin among online admins). | Fallback assignment in conversation creation |
| CHT-INV-05 | Chat messages auto-archive after 2 years. Archived chats are read-only. | Cron-based archival |
| CHT-INV-06 | Socket.io connections require valid JWT. Token refresh before socket reconnect. Expired token = forced disconnect. | Socket.io auth middleware |
| CHT-INV-07 | Conversation transfer (staff A → staff B) preserves full message history. Both staff see all messages. Client is notified: "You're now speaking with [new staff name]." | Transfer handler + system message |

---

## 16. WHATSAPP BUSINESS INTEGRATION

### 16.1 WhatsApp Config (whatsappConfig.js)

| Field | Type | Description |
|-------|------|-------------|
| metaBusinessAccountId | String | Meta Business Account ID |
| phoneNumberId | String | WhatsApp Business phone number ID |
| accessToken | String (encrypted) | System User access token |
| webhookVerifyToken | String | Webhook verification token |
| isConnected | Boolean | Connection status |
| dailyMessageQuota | Number | Current quota from Meta |
| qualityRating | Enum | green, yellow, red — Meta quality rating |

### 16.2 WhatsApp Message Log (whatsappMessage.js)

| Field | Type | Description |
|-------|------|-------------|
| direction | Enum | inbound, outbound |
| contactId | ObjectId | Lead or User ID |
| contactType | Enum | lead, user, unknown |
| contactMobile | String | E.164 format (without + for Meta API) |
| waMessageId | String | Meta message ID |
| messageType | Enum | template, text, image, document, audio, video, reaction |
| templateName | String | For outbound template messages |
| templateParams | Array[String] | Template parameter values |
| content | String | Message text content |
| mediaUrl | String | S3 URL for downloaded media |
| mediaOriginalUrl | String | Meta CDN URL (expires) |
| mediaMimeType | String | Media MIME type |
| status | Enum | sent, delivered, read, failed |
| failureReason | String | Error details |
| leadActivityId | ObjectId ref LeadActivity | Auto-created activity link |
| vaultDocumentId | ObjectId ref VaultDocument | If inbound media saved to vault |
| sentAt / deliveredAt / readAt | Date | Lifecycle timestamps |
| conversationWindowExpiresAt | Date | 24hr freeform window expiry |
| createdAt | Date | auto |

### 16.3 WhatsApp APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| GET /api/v1/whatsapp/config | GET | Admin+ | Current WhatsApp configuration |
| PUT /api/v1/whatsapp/config | PUT | Admin+ | Update Meta credentials. AuditLog. |
| POST /api/v1/whatsapp/send | POST | Staff+ | Send template message to lead/client. Body: {contactId, contactType, templateName, params[]}. |
| POST /api/v1/whatsapp/send-freeform | POST | Staff+ | Send freeform message. Only within 24hr of client's last inbound. Returns 400 if window expired. |
| POST /api/v1/webhooks/whatsapp | POST | Public (verify token) | Meta webhook: inbound messages, delivery receipts, read receipts. GET for verification challenge. |
| GET /api/v1/whatsapp/templates | GET | Admin+ | List approved templates from Meta API. |
| GET /api/v1/whatsapp/media/:messageId | GET | Staff+ | Download media from inbound message. |
| GET /api/v1/whatsapp/status | GET | Admin+ | Connection health, quality rating, daily quota. |
| GET /api/v1/whatsapp/conversations/:contactId | GET | Staff (assigned) / Admin | Message history with a contact. |

### 16.4 WhatsApp Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| WHA-INV-01 | Inbound media MUST be downloaded from Meta CDN within 30 minutes of webhook receipt. URLs expire. BullMQ job processes immediately. | Immediate download job on webhook receipt |
| WHA-INV-02 | Outbound business-initiated messages MUST use pre-approved template. Freeform text rejected unless within 24hr client-initiated window. | API validation: templateName required for outbound. Window check for freeform. |
| WHA-INV-03 | Freeform window tracked per contact: conversationWindowExpiresAt = lastInboundAt + 24hr. If expired, return {code: "WINDOW_EXPIRED", message: "Use a template message. Client's last message was over 24 hours ago."}. | Window check on /whatsapp/send-freeform |
| WHA-INV-04 | Phone numbers formatted as 61XXXXXXXXX (no + prefix) for Meta Cloud API. Stored as +61XXXXXXXXX (E.164) internally. | Format transformer at API call boundary |
| WHA-INV-05 | Every inbound message auto-creates LeadActivity (if contact is a lead) with type=whatsapp_received. Every outbound creates type=whatsapp_sent. | Post-send/receive activity creation |
| WHA-INV-06 | Inbound media (images, PDFs) offered for save to Document Vault. Staff can one-click save. | UI action + vault upload integration |
| WHA-INV-07 | DND/opt-out check before every outbound message (integrated with Broadcast DND list, channel=whatsapp). | Pre-send DND check |
| WHA-INV-08 | Webhook handler: GET = Meta verification challenge (return hub.challenge). POST = message processing. Signature verification on POST. | Separate handlers, X-Hub-Signature-256 verification |

---


---

## 17. TAX DEADLINE & COMPLIANCE CALENDAR

### 17.1 Tax Deadline (taxDeadline.js)

| Field | Type | Description |
|-------|------|-------------|
| title | String (required) | "Individual Tax Return Deadline" |
| description | String | Details and requirements |
| deadlineDate | Date | Actual deadline date |
| type | Enum | individual_filing, bas_quarterly, bas_monthly, payg_instalment, super_guarantee, fringe_benefits, company_return, trust_return, smsf_return, rrsp_equivalent, custom |
| applicableTo | Enum | all_clients, individual, self_employed, business, company, trust, smsf, custom_segment |
| reminderSchedule | Array[Object] | [{daysBefore: 30, channel: "email"}, {daysBefore: 7, channel: "push"}, {daysBefore: 1, channel: "sms_push"}] |
| financialYear | String | "2024-25" |
| isRecurring | Boolean | Repeats annually |
| isActive | Boolean | Admin toggle |
| notificationsSent | Number | Counter |

### 17.2 Australian Tax Calendar (Default Seed Data)

| Deadline | Date | Applicable To | Reminders |
|----------|------|--------------|-----------|
| Individual Tax Return (self-lodge) | 31 October | individual | 30d, 14d, 7d, 1d |
| BAS Q1 (Jul-Sep) | 28 October | business | 14d, 7d, 1d |
| BAS Q2 (Oct-Dec) | 28 February | business | 14d, 7d, 1d |
| BAS Q3 (Jan-Mar) | 28 April | business | 14d, 7d, 1d |
| BAS Q4 (Apr-Jun) | 28 July | business | 14d, 7d, 1d |
| Super Guarantee Q1 | 28 October | business | 14d, 1d |
| Super Guarantee Q2 | 28 January | business | 14d, 1d |
| Super Guarantee Q3 | 28 April | business | 14d, 1d |
| Super Guarantee Q4 | 28 July | business | 14d, 1d |
| PAYG Instalment Q1 | 28 October | self_employed | 14d, 1d |
| Fringe Benefits Tax Return | 21 May | business | 30d, 7d |
| Tax Agent Lodgement Program varies | Various | all_clients | 30d, 14d, 7d |

### 17.3 Calendar APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| GET /api/v1/calendar/deadlines | GET | Authenticated | Upcoming deadlines filtered by user profile. Client sees personal deadlines. Admin sees all. |
| POST /api/v1/calendar/deadlines | POST | Admin+ | Create custom deadline. |
| PUT /api/v1/calendar/deadlines/:id | PUT | Admin+ | Edit deadline. |
| POST /api/v1/calendar/seed | POST | Admin+ | Seed standard ATO deadlines for a financial year. |
| POST /api/v1/calendar/process-reminders | POST | System (cron) | Process due reminders and send notifications. |
| GET /api/v1/calendar/upcoming | GET | Client (own) | Next 3 deadlines with countdown. For dashboard widget. |

### 17.4 Calendar Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| CAL-INV-01 | Deadline reminders NEVER sent to clients who have already filed for that financial year. | Pre-send check: Order.status >= Lodged for this FY |
| CAL-INV-02 | Deadlines falling on weekends or Australian public holidays automatically shift to next business day. | Australian public holiday calendar (federal + state). State determined from user's address. |
| CAL-INV-03 | Reminder deduplication: max 1 reminder per {userId, deadlineId, daysBefore tier}. | Unique constraint |
| CAL-INV-04 | Reminders use Notification Engine (Section 5) with preference checking. | NotificationService.send() |

---


---

## 18. REVIEWS & REPUTATION MANAGEMENT

### 18.1 Review (review.js)

| Field | Type | Description |
|-------|------|-------------|
| userId | ObjectId ref User | Reviewer |
| orderId | ObjectId ref Order | unique with userId — one review per order per client |
| staffId | ObjectId ref User | Staff who handled the order |
| rating | Number (1-5) | Star rating |
| npsScore | Number (0-10) | Net Promoter Score (separate prompt) |
| comment | String | Free-text feedback |
| tags | Array[Enum] | quick_filing, friendly_staff, good_communication, thorough_review, too_slow, pricing_concern, missing_documents, great_refund |
| googleReviewPrompted | Boolean | Was Google Review prompt shown |
| googleReviewClicked | Boolean | Did they click to Google |
| isPublic | Boolean | Show on QEGOS website testimonials |
| adminResponse | String | Admin/staff reply |
| adminRespondedBy | ObjectId ref User | Who responded |
| adminRespondedAt | Date | When responded |
| status | Enum | requested, submitted, flagged, responded |
| requestSentAt | Date | When review request was sent |
| createdAt / updatedAt | Date | auto |

### 18.2 Review APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/reviews/request/:orderId | POST | System (event) / Admin | Trigger review request (24hr delay after completion). |
| POST /api/v1/reviews/submit | POST | Client (own) | Submit review. Body: {orderId, rating, npsScore?, comment?, tags[]}. |
| GET /api/v1/reviews | GET | Admin+ | List reviews. Filters: rating, staffId, dateRange, status. Paginated. |
| PUT /api/v1/reviews/:id/respond | PUT | Admin+ | Admin responds to review. |
| GET /api/v1/reviews/stats | GET | Admin+ | Avg rating, NPS, by staff, by month, rating distribution. |
| POST /api/v1/reviews/:id/google-prompt | POST | Client | Log Google Review click-through. |
| GET /api/v1/reviews/public | GET | Public | Approved testimonials for website. |

### 18.3 Review Automation

| Trigger | Action |
|---------|--------|
| Order status → Completed (6) or Lodged (7) | BullMQ job: send review request after 24hr delay via push notification |
| Review submitted (ANY rating) | Show Google Review prompt with deep link. NOT conditional on rating. |
| Rating 1-2 | ADDITIONALLY: Slack alert for immediate service recovery |
| Rating 3 | ADDITIONALLY: Flag for admin follow-up within 48 hours |
| No review after 7 days of request | Single reminder push notification |
| No review after 14 days | No further reminders |

### 18.4 Review Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| REV-INV-01 | Google Review prompt is shown to ALL reviewers regardless of rating. NEVER conditional on rating (Google ToS prohibits "review gating"). | Same prompt for all star ratings |
| REV-INV-02 | One review per order per client. Unique index on {orderId, userId}. Duplicate submit returns existing review. | Unique compound index |
| REV-INV-03 | NPS score is collected on a separate screen/step from star rating. Never on the same form. | Separate API flow: rating first, then optional NPS |
| REV-INV-04 | Reviews cannot be deleted by anyone. Admin can only flag or respond. | No DELETE endpoint |
| REV-INV-05 | Review request only sent if order has at least one payment with status=succeeded. | Pre-request payment check |

---


---

## 19. REFERRAL PROGRAM ENGINE

### 19.1 Referral (referral.js)

| Field | Type | Description |
|-------|------|-------------|
| referralCode | String (unique) | From referrer's User.referralCode: QGS-REF-XXXX |
| referrerId | ObjectId ref User | Client who refers |
| refereeId | ObjectId ref User | New client who was referred |
| refereeLeadId | ObjectId ref Lead | Lead created from referral |
| status | Enum | pending, signed_up, order_created, completed, rewarded, expired |
| rewardType | Enum | discount_percent, flat_discount, credit_balance |
| referrerRewardAmount | Number | Reward for referrer (cents or percent) |
| refereeRewardAmount | Number | Reward for referee (cents or percent) |
| referrerRewarded | Boolean | Referrer reward applied |
| refereeRewarded | Boolean | Referee reward applied |
| referrerOrderId | ObjectId ref Order | Order where referrer reward applied |
| refereeOrderId | ObjectId ref Order | Referee's order |
| channel | Enum | sms, email, social, direct_link, qr_code, in_person |
| expiresAt | Date | Referral link expiry (default: 12 months) |
| createdAt | Date | auto |

### 19.2 Referral Config (referralConfig.js)

| Field | Type | Description |
|-------|------|-------------|
| isEnabled | Boolean | Master toggle |
| rewardType | Enum | discount_percent, flat_discount, credit_balance |
| referrerRewardValue | Number | Amount/percentage for referrer |
| refereeRewardValue | Number | Amount/percentage for referee |
| maxReferralsPerClient | Number | default: 50 per year |
| referralExpiryDays | Number | default: 365 |
| minimumOrderValueForReward | Number | Minimum order value for reward trigger (cents) |

### 19.3 Referral APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| GET /api/v1/referrals/my-code | GET | Client | Get or generate referral code. |
| POST /api/v1/referrals/share | POST | Client | Send invite via SMS/email (uses Broadcast infra). |
| GET /api/v1/referrals/validate/:code | GET | Public | Validate code during signup. Returns {valid, referrerName (first name only)}. |
| POST /api/v1/referrals/apply | POST | System (signup flow) | Apply referral to new user/lead at signup. |
| GET /api/v1/referrals/my-referrals | GET | Client | List all referrals with statuses. |
| POST /api/v1/referrals/process-reward | POST | System (event) | Process reward after referee completes filing + payment. |
| GET /api/v1/referrals/config | GET | Admin+ | Current config. |
| PUT /api/v1/referrals/config | PUT | Admin+ | Update config. AuditLog. |
| GET /api/v1/referrals/dashboard | GET | Admin+ | Stats: total referrals, conversion rate, top referrers, total reward cost. |
| GET /api/v1/referrals/leaderboard | GET | Client | Top referrers (gamification). |

### 19.4 Referral Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| REF-INV-01 | Rewards trigger ONLY when: referee's order status >= Completed AND at least one payment status = succeeded AND order.finalAmount >= config.minimumOrderValueForReward. | Event listener checks all 3 conditions |
| REF-INV-02 | Self-referral prevention: referrer's mobile AND email cannot match referee's. | Pre-apply cross-check |
| REF-INV-03 | A person can only be "referred" once. Unique constraint on refereeId (across all referrals). | Unique index |
| REF-INV-04 | Credit balance rewards expire after 12 months if unused. | expiresAt field + cron to expire |
| REF-INV-05 | Referral codes case-insensitive, stored uppercase. | Pre-save toUpperCase() |
| REF-INV-06 | Referral attribution: when referral code used at signup, Lead.source set to "referral" and Lead.referralCode stored. | Signup handler integration |
| REF-INV-07 | Max referrals per client per year enforced. Beyond limit, sharing still works but reward won't trigger. | Count check in reward processing |

---


---

## 20. REVENUE INTELLIGENCE & ANALYTICS

### 20.1 Dashboard Widgets

| Widget | Data Sources | Description |
|--------|-------------|-------------|
| Revenue Forecast | Lead pipeline + historical conversion | Predicted revenue for month/quarter based on pipeline value × stage conversion probability |
| Client Lifetime Value | Orders + Payments across years | CLV per client: total paid, years retained, referrals made, services/year. Identifies VIP clients. |
| Staff Productivity | Orders + LeadActivities + Reviews | Per-staff: orders completed, avg completion time, lead conversion rate, avg client rating, follow-up compliance % |
| Channel ROI | Broadcasts + Leads + Orders | Cost per acquisition by channel. Which campaigns drive the most revenue. |
| Seasonal Trends | Orders by month/year | Year-over-year filing volume by week. Predicts staffing needs for tax season peaks. |
| Churn Risk | Tax Year Summaries | Clients who filed last year but haven't started this year. Flagged for re-engagement broadcast. |
| Service Mix | Order line items | Which services generate the most revenue. Informs pricing strategy. |
| Collection Rate | Payments + Invoices | % invoices paid on time, avg days to payment, outstanding receivables. |
| Lead Pipeline Health | Leads by status + age | Pipeline value, conversion rate by stage, avg time per stage, bottleneck identification. |

### 20.2 Analytics APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| GET /api/v1/analytics/executive-summary | GET | Admin+ | One-page KPI snapshot. Cached 5 min. |
| GET /api/v1/analytics/revenue-forecast | GET | Admin+ | Predicted revenue with confidence intervals. |
| POST /api/v1/analytics/clv | POST | Admin+ | Client lifetime value scores. Filters: top N, segment, all. |
| GET /api/v1/analytics/staff-benchmark | GET | Admin+ | Staff productivity comparison. |
| POST /api/v1/analytics/channel-roi | POST | Admin+ | Channel performance with date range and campaign filters. |
| GET /api/v1/analytics/seasonal-trends | GET | Admin+ | Filing volume by week/month with YoY comparison. |
| GET /api/v1/analytics/churn-risk | GET | Admin+ | At-risk clients for current FY. |
| GET /api/v1/analytics/service-mix | GET | Admin+ | Revenue by service type. |
| GET /api/v1/analytics/collection-rate | GET | Admin+ | Payment timeliness and receivables. |
| GET /api/v1/analytics/pipeline-health | GET | Admin+ | Lead pipeline metrics by stage. |
| POST /api/v1/analytics/export | POST | Admin+ | Export any analytics view to PDF/Excel. |

### 20.3 Analytics Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| ANA-INV-01 | All analytics queries target MongoDB read replica, NEVER primary. | Separate connection string for analytics |
| ANA-INV-02 | Revenue figures calculated from Payment collection only (status = succeeded or captured). Not from Order.finalAmount. | Filter in aggregation pipelines |
| ANA-INV-03 | CLV uses only captured/succeeded payments. Pending and failed excluded. | Payment status filter |
| ANA-INV-04 | Year 1 forecast uses configurable industry benchmarks (not historical data). Display "Estimated" label until 12 months of data collected. | Config-driven with disclaimer flag |
| ANA-INV-05 | All analytics endpoints support dateRange filter with max 366-day window. | Validation on query params |
| ANA-INV-06 | Dashboard widgets cached for 5 minutes (Redis). Stale-while-revalidate: serve cached, update in background. | Redis cache with TTL + background refresh |
| ANA-INV-07 | Executive summary calculation is a BullMQ job that runs every 5 minutes, not on-demand per request. | Pre-computed, served from cache |

---


---

## 21. SUPPORT TICKETS & SLA ENGINE

### 21.1 Overview

Structured customer support system for a high-stress tax domain. Every client issue gets a ticket with SLA tracking, escalation rules, and resolution lifecycle. Replaces ad-hoc chat/phone complaints with auditable, measurable support.

### 21.2 Support Ticket (supportTicket.js)

| Field | Type | Description |
|-------|------|-------------|
| ticketNumber | String (auto, unique) | QGS-TKT-XXXX |
| userId | ObjectId ref User | Client who raised ticket |
| orderId | ObjectId ref Order | Related order (optional) |
| category | Enum | billing_query, refund_request, return_status, document_issue, staff_complaint, technical_issue, deadline_concern, ato_query, general_enquiry, amendment_request |
| priority | Enum (default: normal) | low, normal, high, urgent |
| status | Enum | open, assigned, in_progress, waiting_on_client, waiting_on_ato, escalated, resolved, closed |
| subject | String (required) | Brief description |
| description | String (required) | Detailed issue |
| assignedTo | ObjectId ref User | Staff handling ticket |
| escalatedTo | ObjectId ref User | Manager/admin if escalated |
| escalatedAt | Date | When escalated |
| escalationReason | String | Why escalated |
| resolution | String | How resolved |
| resolutionCategory | Enum | resolved_as_expected, refund_issued, correction_made, escalated_to_ato, client_error, system_error, no_action_needed |
| clientSatisfaction | Number (1-5) | Post-resolution rating |
| slaDeadline | Date (auto-calc) | Based on priority + business hours |
| slaBreached | Boolean (default: false) | SLA exceeded |
| slaBreachedAt | Date | When breached |
| messages | Array[Object] | [{senderId, senderType (client/staff/system), content, attachments[], createdAt, isInternal (Boolean)}] |
| relatedTicketIds | Array[ObjectId] | Linked tickets |
| source | Enum | chat, whatsapp, phone, email, portal, walk_in, admin_created |
| firstResponseAt | Date | When first staff response sent |
| firstResponseBreached | Boolean (default: false) | First response SLA breached |
| resolvedAt | Date | When resolved |
| closedAt | Date | When closed |
| reopenCount | Number (default: 0) | Times reopened (max 3) |
| createdAt / updatedAt | Date | auto |

### 21.3 SLA Configuration

| Priority | First Response | Resolution Target | Escalation Trigger |
|----------|---------------|-------------------|-------------------|
| Urgent | 1 hour | 4 hours | Auto-escalate if unassigned > 30 min |
| High | 4 hours | 8 business hours | Auto-escalate if no update > 4 hours |
| Normal | 8 hours | 24 business hours | Flag if no update > 12 hours |
| Low | 24 hours | 48 business hours | Flag if no update > 24 hours |

**Business hours:** Mon-Fri 9am-5pm AEST. Tax season (Jul-Oct): Mon-Sat 8am-8pm.

### 21.4 Auto-Escalation Rules

| Rule | Trigger | Action |
|------|---------|--------|
| Unassigned urgent | Urgent ticket unassigned > 30 min | Auto-assign to on-duty admin + Slack alert |
| SLA imminent | 80% of SLA elapsed, still open | Push to assignee + Slack warning |
| SLA breached | SLA deadline passed | slaBreached=true, Slack admin, escalate to office manager |
| Client waiting | waiting_on_client > 7 days, no response | Auto-close with system message |
| Repeat complainant | 3+ tickets from same client in 30 days | Flag on client profile, alert admin |
| Staff complaint | category=staff_complaint | Auto-assign to office manager (NEVER to complained-about staff) |
| First response breach | First response SLA elapsed, no staff reply | firstResponseBreached=true, escalate |

### 21.5 Ticket APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/tickets | POST | Client / Staff+ | Create ticket. Auto-calculates SLA deadline. |
| GET /api/v1/tickets | GET | Staff (assigned) / Admin+ | List. Filters: status, category, priority, assignedTo, slaBreached, dateRange. Paginated. |
| GET /api/v1/tickets/:id | GET | Client (own) / Staff (assigned) / Admin | Detail with messages. |
| PATCH /api/v1/tickets/:id/status | PATCH | Staff+ | Status transition. |
| PUT /api/v1/tickets/:id/assign | PUT | Admin+ / Office Manager | Assign to staff. |
| POST /api/v1/tickets/:id/message | POST | Client / Staff | Add message. isInternal for staff-only notes. |
| POST /api/v1/tickets/:id/escalate | POST | Staff+ | Escalate. Required: escalationReason. |
| PATCH /api/v1/tickets/:id/resolve | PATCH | Staff+ | Resolve. Required: resolution, resolutionCategory. Triggers satisfaction survey. |
| POST /api/v1/tickets/:id/reopen | POST | Client | Reopen resolved ticket (max 3 times). |
| POST /api/v1/tickets/:id/satisfaction | POST | Client | Rate resolution (1-5). |
| GET /api/v1/tickets/stats | GET | Admin+ | Dashboard: open/resolved/breached, avg resolution time, satisfaction, by category, by staff. |
| GET /api/v1/tickets/sla-report | GET | Admin+ | SLA compliance: % met, avg first response, avg resolution, breach trends. |

### 21.6 Ticket Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| TKT-INV-01 | SLA deadline auto-calculated from priority + business hours calendar. No manual staff override. | Business hours engine in pre-save hook |
| TKT-INV-02 | Staff complaint tickets NEVER assigned to complained-about staff. | Assignment validator |
| TKT-INV-03 | Internal messages (isInternal=true) NEVER visible to client in portal or API. | Response filter in GET endpoints |
| TKT-INV-04 | SLA breach triggers automated (BullMQ cron every 5 min). Cannot be silenced. | Cron job |
| TKT-INV-05 | Resolved tickets auto-close after 7 days if no client reopen. System message. | Cron job |
| TKT-INV-06 | Max 3 reopens per ticket. After that, new ticket required. | reopenCount check |
| TKT-INV-07 | Every status change = AuditLog. Escalation = severity warning. SLA breach = severity critical. | Post-save middleware |

### 21.7 Integration Points

| From → To | Mechanism |
|-----------|-----------|
| Chat → Ticket | Staff clicks "Convert to Ticket" — pre-fills from chat context |
| WhatsApp → Ticket | "Create Ticket" button on inbound message |
| Order → Ticket | Client clicks "Report an Issue" on order detail |
| Ticket satisfaction → Reviews | Low satisfaction (1-2) flagged for admin review |
| Ticket volume → Analytics | Feeds into executive dashboard metrics |


---

## 22. STAFF MANAGEMENT & APPOINTMENT SCHEDULING

### 22.1 Staff APIs (Enhanced)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| POST /api/v1/staff | POST | Admin+ | Create staff account. Body: {firstName, lastName, email, password, roleId}. |
| GET /api/v1/staff | GET | Admin+ | List staff. Search, pagination. |
| PUT /api/v1/staff/:id | PUT | Admin+ | Update staff info. |
| PATCH /api/v1/staff/:id/status | PATCH | Admin+ | Toggle active/inactive. |
| POST /api/v1/staff/:id/set-password | POST | Admin+ | Admin resets staff password. |
| GET /api/v1/staff/:id/workload | GET | Admin+ | Current workload: active leads, orders in progress, pending follow-ups. |
| GET /api/v1/staff/availability | GET | Admin+ | Staff availability grid for appointment scheduling. |

### 22.2 Appointment Scheduling (Enhanced)

| Field | Type | Description |
|-------|------|-------------|
| orderId | ObjectId ref Order | or standalone |
| userId | ObjectId ref User | Client |
| staffId | ObjectId ref User | Assigned staff |
| date | Date | Appointment date |
| startTime / endTime | String | HH:mm format |
| type | Enum | in_person, phone, video |
| meetingLink | String | Auto-generated Zoom/Google Meet link for video |
| status | Enum | scheduled, confirmed, completed, no_show, cancelled, rescheduled |
| remindersSent | Array[Object] | [{channel, sentAt, daysBefore}] |
| noShowFollowUp | Boolean | If no-show, has follow-up been sent |
| notes | String | Pre-appointment notes |

### 22.3 Appointment Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| APT-INV-01 | Double-booking prevention: no two appointments for same staff at overlapping time. | Time range overlap check on create/update |
| APT-INV-02 | Appointment reminders: 24hr before (email), 2hr before (push+SMS). | BullMQ scheduled jobs |
| APT-INV-03 | No-show: if appointment not marked "completed" within 30min of end time, auto-mark "no_show". Send re-scheduling prompt to client. | Cron job |
| APT-INV-04 | Timezone handling: appointments stored in UTC. Display in user's timezone (from profile). | Moment-timezone / date-fns-tz conversion |

---


---

## 23. CROSS-MODULE INTEGRATION MATRIX

| From → To | Integration Point | Mechanism |
|-----------|-------------------|-----------|
| Broadcast → Lead Mgmt | Campaign-sourced leads tracked | Lead.source = marketing_campaign, Lead.campaignId |
| Lead Mgmt → Users | Conversion creates User record | POST /leads/:id/convert (MongoDB transaction) |
| Lead Mgmt → Orders | Conversion pre-fills Order | Order.leadId, prefill from lead profile |
| Orders → Tax Engine | Estimate calculator linked to order | POST /tax/estimate with orderId |
| Orders → Review Pipeline | Submit for review before completion | ReviewAssignment created on status → Review (5) |
| Orders → Xero | Auto-invoice on processing | BullMQ event: "order.invoiceable" → XeroSyncWorker |
| Tax Results → Tax Year Summary | Official results populate summary | Post-save hook syncs TaxReturnResult → TaxYearSummary |
| Tax Results → Amendments | Amendment uses original's rule snapshot | Auto-load rulesSnapshotId from originalReturnId |
| Payments → Xero | Payment as Xero Payment | BullMQ event: "payment.succeeded" → XeroPaymentSync |
| Payments → Billing Disputes | Disputed payment linked to ticket | billingDispute.paymentId + ticketId |
| Refunds → Xero | Credit note on refund | BullMQ event: "payment.refunded" → XeroCreditNoteSync |
| Orders → Reviews | Auto-request after completion | BullMQ event: "order.completed" → 24hr delayed review request |
| Reviews → Google | ALL reviews → Google prompt | Google Review deep link (NOT conditional on rating) |
| Referral → Lead Mgmt | Referral code → new lead | Lead.source = referral, Lead.referralCode |
| Referral → Orders | Discount applied on conversion | Order.discountAmount from referral reward |
| WhatsApp → Lead Activity | Inbound messages auto-logged | Webhook → auto-create LeadActivity |
| WhatsApp → Document Vault | Inbound media auto-saveable | Staff one-click save: media → S3 → vaultDocument |
| WhatsApp → Broadcast | Third channel for campaigns | Broadcast.channel includes "whatsapp" |
| Tax Calendar → Notifications | Deadline reminders | Cron → NotificationService.send() |
| Tax Calendar → Broadcast | Bulk deadline alerts | Cron triggers broadcast campaign |
| Document Vault → Orders | Prior-year prefill | GET /vault/prefill/:financialYear → form pre-population |
| Chat → Lead Activity | Staff messages logged | Auto-create LeadActivity on message |
| Chat → Tickets | Convert chat to support ticket | Staff "Convert to Ticket" button |
| Tickets → Analytics | Support metrics | Ticket volume, SLA compliance in dashboard |
| All Modules → Audit Log | Every mutation logged | Mongoose post-save middleware |
| All Modules → Analytics | Unified data aggregation | MongoDB aggregation on read replica |
| All Modules → Notifications | Centralised notification | NotificationService.send() with preference checking |
| RBAC → Permission Audit | Role changes tracked | permissionSnapshot on every role modification |
| Tax Rules → Audit Log | Rule changes = critical audit | Activation, correction, lock = AuditLog critical |


---

## 24. NON-FUNCTIONAL REQUIREMENTS

| ID | Requirement | Details | Priority |
|----|-------------|---------|----------|
| NFR-01 | Database | MongoDB Atlas M30+ cluster, ap-southeast-2, read replica for analytics | P0 |
| NFR-02 | Authentication | JWT: 15-min access + 7-day refresh, rotation on use, blacklist on password change | P0 |
| NFR-03 | Rate Limiting | Auth: 5/15min per IP. API: 100/min per user. Broadcast: 10 SMS/sec, 100 email/sec. Upload: 20 files/10min per user. Redis-backed. | P0 |
| NFR-04 | Encryption at Rest | S3 SSE-S3 for vault. MongoDB field-level AES-256-GCM for TFN, Xero tokens, payment tokens. | P0 |
| NFR-05 | Encryption in Transit | TLS 1.2+ on all endpoints. Certificate pinning on React Native mobile. | P0 |
| NFR-06 | CORS | Whitelist: admin, web, mobile deep link schemes only. No wildcards. | P0 |
| NFR-07 | Input Validation | express-validator on EVERY endpoint. No raw req.body access. | P0 |
| NFR-08 | Error Handling | Standardised: {status, code, message, errors[]}. No stack traces in production. | P0 |
| NFR-09 | Structured Logging | JSON logs (Winston). Correlation ID per request. CloudWatch/Datadog shipping. | P0 |
| NFR-10 | Health Checks | GET /health (shallow), GET /health/deep (all dependencies). | P0 |
| NFR-11 | Caching | Redis cluster: sessions, Socket.io, rate limits, analytics cache, Xero token mutex, notification dedup, permission cache. | P0 |
| NFR-12 | API Versioning | /api/v1/. Breaking changes → /api/v2/ with 6-month deprecation. | P1 |
| NFR-13 | API Documentation | OpenAPI 3.0 auto-generated from validators. Swagger UI at /api/docs (admin only). | P1 |
| NFR-14 | Backup | MongoDB Atlas continuous backup, 7-day PITR. S3 cross-region replication. | P0 |
| NFR-15 | Load Capacity | 500 concurrent users, 50 req/sec sustained, 10K leads, 50K orders. | P1 |
| NFR-16 | Spam Act 2003 | Consent tracking, unsubscribe in every marketing message, sender identification. | P0 |
| NFR-17 | Privacy Act (APPs) | TFN encryption, data minimisation, breach notification plan, access request handling. | P0 |
| NFR-18 | Accessibility | WCAG 2.1 AA for web app and client portal. | P2 |
| NFR-19 | i18n | English primary. Chinese, Hindi, Punjabi, Vietnamese as additions. | P1 |
| NFR-20 | Monitoring | APM (Datadog/New Relic): P50/P95/P99 latencies, error rates, dependency health. | P1 |
| NFR-21 | Alerting | Slack alerts for: payment failures, Xero sync failures, SLA breaches, high error rates, security events, permission escalations. | P0 |
| NFR-22 | CI/CD | GitHub Actions: lint → test → build → deploy for all 4 apps. Staging + production environments. | P1 |
| NFR-23 | Message Queue | BullMQ (Redis-backed): Xero sync, broadcast sends, webhook processing, review scheduling, analytics computation, media downloads, SLA checks. | P0 |
| NFR-24 | Idempotency | All financial POST endpoints accept Idempotency-Key header. Redis storage, 24hr TTL. | P0 |
| NFR-25 | Circuit Breaker | Xero, Stripe, Payzoo, Twilio, SES, Meta API behind circuit breakers. Open after 5 failures. Half-open after 30 sec. | P1 |
| NFR-26 | Soft Delete | All user-facing data uses soft delete (isDeleted flag). Hard delete by cron after grace period. | P0 |
| NFR-27 | Audit Retention | 7 years (ATO requirement). Monthly archive to S3 Glacier for records > 12 months. | P0 |
| NFR-28 | Socket.io Scaling | Redis adapter for horizontal scaling. Sticky sessions via ALB. | P1 |
| NFR-29 | Tax Rule Immutability | Frozen tax rule configs permanently immutable. Corrections create new versions. | P0 |
| NFR-30 | SLA Engine | BullMQ cron every 5 min for SLA deadline monitoring and auto-escalation. | P0 |
| NFR-31 | Permission Audit | Hourly anomaly detection. Permission snapshots on every role change. | P1 |
| NFR-32 | Storage Abuse Protection | Per-user upload rate limits, quota enforcement via atomic counters, monthly reconciliation. | P1 |


---

## 25. IMPLEMENTATION ROADMAP

| Phase | Duration | Team | Scope | Deliverables |
|-------|----------|------|-------|-------------|
| 0: Foundation | 4 weeks | 2 BE | RBAC middleware + permission matrix + permission audit tooling, audit logging on all models, rate limiting (express-rate-limit + Redis), JWT refresh rotation + blacklisting, standardised error handling, health check endpoints, express-validator on all existing endpoints, API versioning prefix, tax rule config model + FY2024-25 seed data | RBAC working, audit trail recording, auth hardened, tax rules seeded |
| 1: Payment Hardening | 5 weeks | 2 BE + 1 FE | Separate Payment collection + migration, idempotency keys, Stripe webhook signature verification, Payzoo Provider, Gateway Abstraction Layer + routing, webhook replay protection, GST rounding engine, billing dispute model, prorated cancellation workflow, write-off workflow, admin gateway config UI, payment transaction log UI | Dual-gateway payments, bulletproof webhooks, billing edge cases handled |
| 2: Xero Integration | 4 weeks | 1 BE + 1 FE | OAuth 2.0 with encrypted tokens, Redis distributed lock for refresh, Contact sync, Invoice auto-creation, Payment sync, Credit note for refunds, invoice adjustment (void + recreate), rate limiter (60/min), sync log with retry, reconciliation report, admin settings UI | Automated accounting sync |
| 3: Lead & Order Core | 6 weeks | 2 BE + 2 FE | Lead CRUD + 8-state status machine + activity logging + dedup + assignment + Kanban + staff mobile companion, Order enhancements (orderType, linkedOrderId), Review/Approval Pipeline (checklist, assignment rules, approval gate), follow-up reminders + push | Lead tracking + review pipeline operational |
| 4: Lead Advanced + Tax Engine | 4 weeks | 2 BE + 1 FE | Lead scoring + automation crons + bulk import/export + merge + conversion, Tax estimate calculator (pure function + APIs + client UI hooks), Tax result import system, Amendment workflow, Tax rules admin UI + test suite, taxEstimateLog storage | Lead management + tax engine complete |
| 5: Broadcast Engine | 5 weeks | 2 BE + 1 FE | Amazon SES integration, Campaign CRUD + wizard, SMS queue (Twilio, 10/sec), Email queue (SES, 100/sec), Template library with merge tags + fallbacks, Audience segmentation, DND/opt-out + Spam Act compliance, Consent record tracking, Campaign analytics, Delivery reports | Multi-channel campaigns live |
| 6: Client Portal & Vault | 6 weeks | 1 BE + 2 FE | Document vault with ClamAV virus scanning + content hash dedup, S3 storage with per-user paths, Document versioning + quota enforcement (atomic counters), Upload rate limiting, Storage abuse protection + reconciliation cron, Tax year summaries (from tax results), YoY comparison, ATO refund status tracking, Prior-year prefill, Mobile + Web vault UI, Tax estimate calculator UI | Year-round client engagement |
| 7: Communication Suite | 6 weeks | 2 BE + 2 FE | In-App Chat: Socket.io + Redis adapter, TFN redaction, file sharing, canned responses, push fallback, conversation transfer, WhatsApp: Meta Cloud API, template messaging, inbound handler, media download + vault save, freeform window, Support Tickets: ticket model, SLA engine, auto-escalation crons, ticket UI in admin + portal | Real-time + WhatsApp + structured support |
| 8: Engagement Modules | 4 weeks | 1 BE + 1 FE | Tax Calendar: ATO deadline seed data, reminder scheduling, cron processing, client calendar UI. Reviews: auto-request, Google prompt (non-gated), Slack alerts, staff scores. Referral Engine: codes, tracking, rewards, admin config, leaderboard. | Client retention & growth tools |
| 9: Revenue Intelligence | 4 weeks | 1 BE + 1 FE | Analytics aggregation on read replica, Executive dashboard, Revenue forecast (industry benchmarks year 1), CLV scoring, Staff benchmarking, Channel ROI, Seasonal trends, Churn risk, Collection rate, Ticket SLA metrics, Export to PDF/Excel, 5-min Redis cache | Data-driven decisions |
| 10: Polish & Hardening | 3 weeks | Full team | Integration testing (all cross-module flows), Load testing (500 concurrent, 50 req/sec), Security audit (OWASP Top 10), i18n foundation (i18next), Monitoring setup (Datadog/CloudWatch), CI/CD pipelines, OpenAPI documentation, Notification preference centre, Circuit breaker implementation, Permission anomaly detection activation | Production-ready |

**Total: 51-55 weeks with 3 BE + 2 FE + 1 QA = 6 people.**

**Recommended MVP (Phases 0-3): 19 weeks** — Foundation + Payments + Xero + Lead/Order Core with Review Pipeline. Validate with real users, then expand.

**With 2-3 developers: 16-20 months minimum.**


---

## 26. APPENDIX: COMPLETE ENDPOINT REGISTRY

Total API endpoints across all modules: ~210

| Module | Endpoint Count |
|--------|---------------|
| Auth & Security | 12 |
| RBAC & Audit | 8 |
| Permission Audit | 8 |
| User Management | 11 |
| Orders + Review Pipeline | 21 |
| Tax Engine + Estimates + Results + Amendments | 24 |
| Payments + Billing Disputes + Write-offs | 14 |
| Xero + Invoice Adjustment | 18 |
| Documents | 7 |
| Lead Management | 32 |
| Broadcast | 17 |
| Client Portal / Vault + Storage | 14 |
| Chat | 11 |
| WhatsApp | 9 |
| Tax Calendar | 6 |
| Reviews | 7 |
| Referrals | 11 |
| Analytics | 11 |
| Support Tickets + SLA | 12 |
| Staff / Appointments | 7 |
| Notifications | 6 |
| Health Checks | 2 |
| **TOTAL** | **~210 endpoints** |

---

## 27. DATA MODEL REGISTRY

All MongoDB collections in the platform:

| # | Model | Collection | Section |
|---|-------|-----------|---------|
| 1 | User | users | §6 |
| 2 | Role | roles | §2 |
| 3 | AuditLog | auditlogs | §2 |
| 4 | PermissionSnapshot | permissionsnapshots | §2 |
| 5 | OTP | otps | §3 |
| 6 | Notification | notifications | §5 |
| 7 | NotificationPreference | notificationpreferences | §5 |
| 8 | Order | orders | §7 |
| 9 | Sales | sales | §7 |
| 10 | ReviewAssignment | reviewassignments | §7 |
| 11 | TaxRuleConfig | taxruleconfigs | §8 |
| 12 | TaxEstimateLog | taxestimatelogs | §8 |
| 13 | TaxReturnResult | taxreturnresults | §8 |
| 14 | Payment | payments | §9 |
| 15 | PaymentGatewayConfig | paymentgatewayconfigs | §9 |
| 16 | WebhookEvent | webhookevents | §9 |
| 17 | BillingDispute | billingdisputes | §9 |
| 18 | XeroSyncLog | xerosynclogs | §10 |
| 19 | VaultDocument | vaultdocuments | §14 |
| 20 | TaxYearSummary | taxyearsummaries | §14 |
| 21 | Lead | leads | §12 |
| 22 | LeadActivity | leadactivities | §12 |
| 23 | LeadReminder | leadreminders | §12 |
| 24 | BroadcastCampaign | broadcastcampaigns | §13 |
| 25 | BroadcastTemplate | broadcasttemplates | §13 |
| 26 | BroadcastMessage | broadcastmessages | §13 |
| 27 | BroadcastOptOut | broadcastoptouts | §13 |
| 28 | ConsentRecord | consentrecords | §13 |
| 29 | ChatConversation | chatconversations | §15 |
| 30 | ChatMessage | chatmessages | §15 |
| 31 | CannedResponse | cannedresponses | §15 |
| 32 | WhatsAppConfig | whatsappconfigs | §16 |
| 33 | WhatsAppMessage | whatsappmessages | §16 |
| 34 | TaxDeadline | taxdeadlines | §17 |
| 35 | Review | reviews | §18 |
| 36 | Referral | referrals | §19 |
| 37 | ReferralConfig | referralconfigs | §19 |
| 38 | SupportTicket | supporttickets | §21 |
| **TOTAL** | **38 collections** | |

---

## 28. INVARIANT REGISTRY

All invariants across the platform, grouped by module:

| Module | Prefix | Count | Section |
|--------|--------|-------|---------|
| RBAC | RBAC-INV | 12 | §2 |
| Permission Audit | PRM-INV | 6 | §2 |
| Security | SEC-INV | 15 | §3 |
| Notification | NTF-INV | 5 | §5 |
| Orders | ORD-INV | 10 | §7 |
| Review Pipeline | RVW-INV | 7 | §7 |
| Tax Calculation | TAX-INV | 12 | §8 |
| Tax Versioning | VER-INV | 14 | §8 |
| Tax Results | TXR-INV | 5 | §8 |
| Payments | PAY-INV | 13 | §9 |
| Billing | BIL-INV | 7 | §9 |
| Xero | XRO-INV | 11 | §10 |
| Documents | DOC-INV | 6 | §11 |
| Leads | LM-INV | 12 | §12 |
| Broadcast | BRC-INV | 10 | §13 |
| Client Portal | CPV-INV | 10 | §14 |
| Storage | STR-INV | 5 | §14 |
| Chat | CHT-INV | 7 | §15 |
| WhatsApp | WHA-INV | 8 | §16 |
| Calendar | CAL-INV | 4 | §17 |
| Reviews | REV-INV | 5 | §18 |
| Referrals | REF-INV | 7 | §19 |
| Analytics | ANA-INV | 7 | §20 |
| Tickets | TKT-INV | 7 | §21 |
| Appointments | APT-INV | 4 | §22 |
| **TOTAL** | | **~163 invariants** | |

---

*End of Document*
*QEGOS Final Production PRD v4.0 — Australia Market*
*Consolidated April 2026 — All supplements merged*
*Confidential — Engineering Reference*
*THIS IS THE SINGLE SOURCE OF TRUTH*
