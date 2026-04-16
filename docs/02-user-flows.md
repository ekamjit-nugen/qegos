# QEGOS User Flow Documentation

**Product:** QEGOS — Tax Preparation, Filing & Client Management Platform
**Market:** Australia
**Date:** 2026-04-07
**Source:** QEGOS Final Production PRD v4.0

---

## Role Hierarchy

```
Super Admin (Type 0) — Platform owner/operator
├── Admin (Type 1) — System administrator
│   ├── Office Manager (Type 5) — Branch/office manager
│   │   ├── Senior Staff (Type 6) — Senior tax professional / reviewer
│   │   │   └── Staff (Type 3) — Tax preparation professional
│   │   └── Student (Type 4) — Discounted educational user
│   └── Client (Type 2) — Individual taxpayer / customer
```

## Access Surface Matrix

| Role | Admin Dashboard | Mobile App | Web App | Client Portal |
|------|:-:|:-:|:-:|:-:|
| Super Admin | Full | - | - | - |
| Admin | Full | - | - | - |
| Office Manager | Operational | - | - | - |
| Senior Staff | Limited + Review Pipeline | Lead Companion | - | - |
| Staff | Limited | Lead Companion | - | - |
| Client | - | Yes | Yes | Yes |
| Student | - | Yes | Yes | Yes |

---

## 1. Client Flows

### 1.1 Signup & Authentication

```
Client opens Mobile App or Web App
  |
  v
POST /api/v1/auth/check-user {mobile: "+61XXXXXXXXX"}
  |
  +-- User exists --> Sign In flow
  |
  +-- New user --> Signup flow
        |
        v
      POST /api/v1/auth/send-otp {mobile}
      Rate limit: 3 per mobile per 15 min
        |
        v
      Client receives SMS via Twilio
        |
        v
      POST /api/v1/auth/verify-otp {mobile, otp}
      Rate limit: 5 attempts per OTP
      OTP expires: 5 minutes, single use (SEC-INV-08)
        |
        v
      POST /api/v1/auth/signup {firstName, lastName, mobile, email, referralCode?}
        |
        +-- If referralCode provided:
        |     GET /api/v1/referrals/validate/:code
        |     POST /api/v1/referrals/apply (system)
        |     Lead.source = "referral"
        |
        v
      Tokens returned:
        - Access Token (15 min, memory only)
        - Refresh Token (7 days, httpOnly cookie / secure storage)
        |
        v
      Client lands on Dashboard
```

**RBAC:** Client role auto-assigned. Scope: `own` on all resources.

### 1.2 Order Creation (Tax Return)

```
Client navigates to "Start Tax Return"
  |
  v
Select Financial Year (e.g., "2024-25" = 1 Jul 2024 - 30 Jun 2025)
  |
  v
Step 1: Personal Details
  - firstName, lastName, DOB, gender
  - TFN (encrypted AES-256-GCM, only last 3 stored plain) (SEC-INV-09)
  - ABN (if self-employed)
  - Address (street, suburb, state [NSW/VIC/QLD/SA/WA/TAS/NT/ACT], postcode)
  - Marital status, spouse details, dependants
  |
  v
Step 2: Income Sources (checkboxes)
  - Employment, Business, Rental, Investment, Foreign, Capital Gains,
    Government Payments, Superannuation
  |
  v
Step 3: Deductions (checkboxes)
  - Work-related, Self-education, Vehicle, Home Office, Donations,
    PHI, Income Protection
  |
  v
Step 4: Questions (dynamic Q&A)
  |
  v
Step 5: Select Services from Sales Catalogue
  - GET /api/v1/sales (active services)
  - E.g., "Individual Tax Return (standard)" $165.00 incl GST
  - lineItems[] built with priceAtCreation snapshot (ORD-INV-02)
  |
  v
Step 6: Review & Submit
  - totalAmount, discountPercent, discountAmount, finalAmount
  - All amounts calculated server-side in cents (ORD-INV-03, ORD-INV-04)
  |
  v
POST /api/v1/orders {personalDetails, financialYear, lineItems, ...}
  - Order created with status: 1 (Pending)
  - orderNumber: QGS-O-XXXX (auto-increment)
  - userId immutable after creation (ORD-INV-06)
  |
  v
Order Confirmation Screen
```

### 1.3 Document Upload

```
Client opens Order Detail or Document Vault
  |
  v
POST /api/v1/vault/upload  OR  POST /api/v1/documents/upload
  |
  v
Upload Pipeline:
  1. Check storage quota (storageUsed + fileSize <= storageQuota) (CPV-INV-06)
  2. Validate MIME type by magic bytes (PDF, JPG, JPEG, PNG, HEIC, TIFF) (CPV-INV-04)
  3. Check file size <= 20MB (CPV-INV-04)
  4. Check rate limit: 20 files/10min, 100MB/10min bandwidth (STR-INV-03)
  5. ClamAV virus scan (CPV-INV-01)
     +-- Infected --> quarantine bucket, error to client
     +-- Clean --> continue
  6. Calculate SHA-256 content hash
     +-- Duplicate detected --> WARNING (advisory only, not blocking) (STR-INV-02)
  7. Upload to S3: vault/{userId}/{financialYear}/{uuid}-{filename}
  8. Atomic $inc on User.storageUsed (STR-INV-01)
  9. Create VaultDocument record (version tracking)
  |
  v
Document appears in vault, categorized by FY + type
```

### 1.4 Payment

```
Client navigates to Order -> Pay
  |
  v
POST /api/v1/payments/intent
  {orderId, idempotencyKey: uuid()}
  |
  v
PaymentRouter:
  1. Check maintenanceMode (PAY-INV-10) --> 503 if true
  2. Check paymentGatewayConfig.routingRule
     - primary_only: use primaryGateway
     - fallback: try primary, fallback on ETIMEDOUT/5xx (PAY-INV-08)
     - round_robin: alternate
     - amount_based: below threshold=primary, above=secondary
  3. Create gateway PaymentIntent
  4. Store Payment record (status: pending, gateway, idempotencyKey)
  |
  v
Return {clientSecret, gateway, publishableKey, paymentId}
  |
  v
Client confirms payment via Stripe SDK / Payroo SDK
  |
  v
Gateway processes --> Webhook fires
  POST /api/v1/webhooks/stripe (signature verified) (PAY-INV-04)
  OR
  POST /api/v1/webhooks/payroo (HMAC verified) (PAY-INV-05)
  |
  v
Webhook Processing:
  1. Check WebhookEvent.eventId uniqueness (PAY-INV-03)
     +-- Duplicate --> return 200 OK, no reprocessing
  2. Update Payment.status -> succeeded
  3. AuditLog: severity=critical (PAY-INV-11)
  4. BullMQ: Xero payment sync job (PAY-INV-12)
  5. Push notification: "Payment of $X received for Order #QGS-O-XXXX"
  6. In-app notification
  |
  v
Client sees payment confirmed
```

### 1.5 Track Order Status

```
GET /api/v1/orders (scope: own)
  |
  v
Order List: status, financialYear, progress %, assigned staff
  |
  v
GET /api/v1/orders/:id (scope: own)
  |
  v
Order Detail:
  - Status badge with colour (Pending=Blue, In Progress=Purple, etc.)
  - Completion percentage (0-100)
  - Assigned staff name
  - Documents list
  - Payment status
  - Scheduled appointment (if any)
  - eFile status (not_filed -> pending -> submitted -> accepted -> assessed)
  - NOA status
  - Estimated refund/owing
```

### 1.6 Tax Estimate Calculator

```
Client opens "Estimate Calculator"
  |
  v
Input form:
  - Financial year, residency status
  - Income: employment, business, rental, interest, dividends, capital gains, etc.
  - Deductions: work-related, self-education, vehicle, home office, etc.
  - PHI status, HECS debt, senior status, spouse/dependants
  - Tax withheld, payment summaries
  |
  v
POST /api/v1/tax/estimate
  |
  v
Server:
  1. Load active taxRuleConfig for FY (or use specified snapshotId)
  2. Run calculateTaxEstimate(input, rules) -- PURE FUNCTION (TAX-INV-02)
  3. All arithmetic in cents (TAX-INV-03)
  4. Store in taxEstimateLog (TAX-INV-09)
  5. Increment usageCount on rules (auto-freeze if first use)
  |
  v
Response includes:
  - grossIncome, totalDeductions, taxableIncome
  - baseTax, medicareLevyAmount, medicareLevySurcharge
  - litoOffset, saptoOffset, hecsRepayment
  - estimatedRefundOrOwing (positive = refund)
  - effectiveTaxRate, marginalTaxRate
  - breakdown[] (labelled line items)
  - warnings[] (e.g., "MLS of 1% applies -- consider PHI")
  - DISCLAIMER: "This is an estimate only..." (ALWAYS present) (TAX-INV-05)
  - rulesSnapshotId, rulesVersion, calculatedAt
  |
  v
CTA: "Start FY2024-25 Return"
```

### 1.7 Review & Document Signing

```
Order reaches status 6 (Completed) = return approved by reviewer
  |
  v
Staff sends document for signing:
  POST /api/v1/documents/send-for-sign
  |
  v
Zoho Sign / DocuSign creates signing request
  |
  v
Client receives notification + embedded signing URL
  POST /api/v1/documents/generate-uri
  |
  v
Client signs electronically
  |
  v
Webhook: POST /api/v1/webhooks/zoho
  - Receives signed PDF
  - Emits SIGN_COMPLETE event
  - Document status -> signed
```

### 1.8 Year-over-Year Comparison

```
GET /api/v1/tax-summaries (scope: own)
  |
  v
List of FY summaries:
  - FY2024-25: Income $75,000, Deductions $4,200, Refund $2,850
  - FY2023-24: Income $68,000, Deductions $3,800, Refund $2,100
  |
  v
GET /api/v1/tax-summaries/:year/compare
  |
  v
Side-by-side comparison with delta highlighting
```

### 1.9 Referral Program

```
GET /api/v1/referrals/my-code
  |
  v
Referral code: QGS-REF-XXXX
  |
  v
POST /api/v1/referrals/share {channel: "sms"|"email"|"social"|...}
  - Uses broadcast infra to send invite
  |
  v
Referee uses code at signup:
  GET /api/v1/referrals/validate/:code
  POST /api/v1/referrals/apply (system)
  |
  v
Referral lifecycle:
  pending -> signed_up -> order_created -> completed -> rewarded
  |
  v
Reward triggers when (REF-INV-01):
  1. Referee's order status >= Completed (6)
  2. At least one payment status = succeeded
  3. Order.finalAmount >= config.minimumOrderValueForReward
  |
  v
GET /api/v1/referrals/my-referrals (track statuses)
GET /api/v1/referrals/leaderboard (gamification)
```

### 1.10 Support Ticket

```
Client clicks "Report an Issue" on order or portal
  |
  v
POST /api/v1/tickets
  {orderId?, category, priority, subject, description}
  |
  v
SLA auto-calculated based on priority + business hours:
  - Urgent: 1hr first response, 4hr resolution
  - High: 4hr first response, 8 business hr resolution
  - Normal: 8hr first response, 24 business hr resolution
  - Low: 24hr first response, 48 business hr resolution
  Business hours: Mon-Fri 9am-5pm AEST (Tax season: Mon-Sat 8am-8pm)
  |
  v
Client can:
  - POST /api/v1/tickets/:id/message (add messages)
  - POST /api/v1/tickets/:id/reopen (max 3 times)
  - POST /api/v1/tickets/:id/satisfaction (rate 1-5 after resolution)
  |
  v
Internal messages (isInternal=true) NEVER visible to client (TKT-INV-03)
```

### 1.11 Review Submission

```
Order completed (status 6) or lodged (status 7)
  |
  v
BullMQ: 24hr delay -> send review request push notification
  (Only if order has payment.status=succeeded) (REV-INV-05)
  |
  v
POST /api/v1/reviews/submit
  {orderId, rating (1-5), npsScore? (0-10), comment?, tags[]}
  NPS collected on SEPARATE screen from rating (REV-INV-03)
  |
  v
Google Review prompt shown to ALL reviewers (REV-INV-01)
  NOT conditional on rating (Google ToS: no review gating)
  POST /api/v1/reviews/:id/google-prompt (log click-through)
  |
  v
No review after 7 days -> single reminder
No review after 14 days -> no further reminders
```

---

## 2. Staff Flows

### 2.1 Staff Login

```
Staff opens Admin Dashboard
  |
  v
POST /api/v1/auth/signin {email, password}
  Rate limit: 5 per email per 15 min (SEC-INV-01)
  |
  v
Checks:
  1. Account locked? (accountLockedUntil check) (SEC-INV-02)
  2. Password valid? (bcrypt compare, cost 12) (SEC-INV-07)
  3. failedLoginAttempts check (10 = lock 30 min)
  |
  v
Return tokens:
  - Access Token (15 min, memory)
  - Refresh Token (7 days, httpOnly cookie)
  |
  v
RBAC loads:
  - roleId -> fetch from Redis (5min TTL) or MongoDB
  - Permissions determine visible menu items / features
  |
  v
Staff Dashboard: assigned orders, pending follow-ups, today's tasks
```

### 2.2 Lead Management

```
Staff opens Lead module (Admin Dashboard or Mobile Companion)
  |
  v
GET /api/v1/leads (scope: assigned for staff, all for admin+)
  Tabs: All | New | Active Pipeline | Won | Lost | Dormant | My Leads
  Filters: status, priority, source, assignedTo, dateRange, state, tags
  |
  v
Create Lead:
  POST /api/v1/leads {source, firstName, mobile(+61...), ...}
  - Mobile auto-normalized to E.164 (LM-INV-09)
  - Duplicate check: mobile AND/OR email (LM-INV-01)
    +-- Match found -> return WARNING with matches (non-blocking)
  - Auto-assign via round-robin if no assignedTo (LM-INV-07)
  - Score auto-calculated (0-100) from profile factors
  |
  v
Lead Detail View:
  Left: contact info, priority/score badges, status dropdown, tax profile
  Right: activity timeline, inline add-note/log-call forms
  Quick actions: Log Call, Send SMS, Send WhatsApp, Schedule Follow-up, Convert
  |
  v
Log Activity:
  POST /api/v1/leads/activities
  {leadId, type, description, outcome, callDuration?, nextAction?, ...}
  Types: phone_call_outbound, sms_sent, whatsapp_sent, walk_in_meeting, note, etc.
  Outcomes: interested, callback_requested, not_interested, no_answer, etc.
  -> Updates Lead.lastContactedAt and Lead.score
  |
  v
Follow-up Reminders:
  POST /api/v1/leads/reminders {leadId, reminderDate, reminderTime, title}
  GET /api/v1/leads/reminders/today (my pending)
  GET /api/v1/leads/reminders/overdue (past due)
  PATCH /api/v1/leads/reminders/:id/complete
  PATCH /api/v1/leads/reminders/:id/snooze
  |
  v
Pipeline Kanban (/leads/pipeline):
  Drag-and-drop: New -> Contacted -> Qualified -> Quote Sent -> Negotiation -> Won
  Cards: name, mobile, priority dot, estimated value, next action date, staff avatar
```

### 2.3 Lead Conversion

```
Staff clicks "Convert" on qualified lead
  |
  v
POST /api/v1/leads/:id/convert
  |
  v
Atomic MongoDB transaction (LM-INV-04):
  1. Set lead.isConverted = true
  2. Create User (if new) from lead data
  3. Create Order pre-filled from lead profile
  4. Link: lead.convertedOrderId, lead.convertedUserId
  5. AuditLog
  |
  v
A lead can be converted ONCE (LM-INV-05)
Subsequent attempts -> 409 {code: "ALREADY_CONVERTED", convertedOrderId}
```

### 2.4 Order Processing

```
Staff sees assigned orders:
  GET /api/v1/orders (scope: assigned)
  |
  v
Order Status Transitions (staff):
  Pending (1) -> Documents Received (2) -> Assigned (3) -> In Progress (4) -> Review (5)

  Forward: any authorized user
  Backward (e.g., 4->3): requires senior_staff or admin
  Cancel (->9): requires admin or office_manager (AuditLog critical)
  |
  v
Work on order:
  - PUT /api/v1/orders/:id (update details)
  - PATCH /api/v1/orders/:id/progress (update completion %)
  - POST /api/v1/documents/upload (upload client docs)
  - POST /api/v1/tax/estimate (quick estimate for client)
  |
  v
Submit for Review:
  POST /api/v1/order-reviews/submit
  -> Order status: In Progress (4) -> Review (5)
  -> ReviewAssignment created (status: pending_review)
  -> Reviewer auto-assigned (rules below)
  -> Push notification to reviewer
```

### 2.5 Tax Result Entry

```
Staff completes return in external software (Xero Tax, LodgeiT, MYOB Tax, HandiTax)
  |
  v
POST /api/v1/tax-results
  {orderId, source, income{}, deductions{}, taxableIncome, ...all official figures}
  -> Populates TaxYearSummary automatically (VER-INV-14)
  |
  v
POST /api/v1/tax-results/:orderId/verify (by senior staff)
  -> Mark verified by second person
  |
  v
PATCH /api/v1/tax-results/:id/lock
  -> isLocked=true, all financial figures immutable (VER-INV-06)
  -> Only ATO status fields remain editable
```

### 2.6 Chat with Clients

```
Staff opens Chat module
  |
  v
GET /api/v1/chat/conversations (scope: assigned)
  |
  v
GET /api/v1/chat/conversations/:id/messages (paginated history)
  |
  v
POST /api/v1/chat/messages {conversationId, content, type}
  -> Socket.io: new_message event
  -> TFN patterns auto-redacted (CHT-INV-01)
  -> Files go through ClamAV (CHT-INV-02)
  |
  v
Canned responses:
  GET /api/v1/chat/canned-responses (by category)
  Quick-insert pre-built replies with merge tags
  |
  v
Conversation transfer:
  PATCH /api/v1/chat/conversations/:id/transfer (admin+)
  -> Full history preserved, client notified (CHT-INV-07)
```

### 2.7 Mobile Lead Companion (Staff)

```
Staff opens Mobile App -> bottom tab "Leads"
  |
  v
Screens:
  - LeadList: today's follow-ups + recently assigned
  - LeadDetail: contact info + activity timeline + quick actions
  - LogCallScreen: call logging form (duration, outcome, notes, next step)
  - AddLeadScreen: quick capture (phone/walk-in)
  - LeadReminders: today's pending + overdue
```

---

## 3. Senior Staff Flows

### 3.1 Review Pipeline

```
Senior Staff opens Review module
  |
  v
GET /api/v1/order-reviews/pending (my pending reviews)
  |
  v
Select order to review:
  GET /api/v1/order-reviews/:orderId
  |
  v
Start review:
  PATCH /api/v1/order-reviews/:orderId/start
  -> ReviewAssignment status: pending_review -> in_review
  |
  v
Work through checklist (12 default items):
  1. Client identity verified (TFN matches, DOB matches)
  2. All income sources accounted for
  3. Deductions supported by documentation in vault
  4. Medicare levy correctly applied
  5. HECS-HELP correctly assessed
  6. Private health insurance status verified
  7. CGT discount correctly applied (holding period > 12 months)
  8. Negative gearing calculations verified
  9. Prior-year figures consistent
  10. Client engagement letter signed
  11. All required documents uploaded
  12. Estimated refund/owing reasonable
  |
  v
Decision:
  +-- All checks pass:
  |     PATCH /api/v1/order-reviews/:orderId/approve
  |     -> ALL checklist items must be checked (RVW-INV-03)
  |     -> status: approved, approvedAt = now
  |     -> Order unlocked for lodgement
  |     -> AuditLog: "Return approved by [reviewer]" (RVW-INV-04)
  |
  +-- Issues found:
        PATCH /api/v1/order-reviews/:orderId/request-changes
        {changesRequested[], reviewNotes}
        -> status: changes_requested
        -> Order status back to In Progress (4)
        -> Push notification to preparer
        -> reviewRound++ (tracks cycles)
        -> If reviewRound > 3: auto-escalate to admin (RVW-INV-05)
```

**Review Assignment Rules:**

| Rule | Condition | Action |
|------|-----------|--------|
| Self-review block | Always | preparerId !== reviewerId (RVW-INV-02) |
| Seniority gate | Junior staff (< 1 year) | Must be senior_staff or admin |
| Complexity gate | > 3 line items OR rental/CGT/foreign income | Must be senior_staff or admin |
| Manager review | Value > $500 OR VIP client (CLV top 10%) | Auto-assign office_manager |
| Round-robin | No configured pairing | Round-robin among senior_staff and admin |

**Lodgement gate (RVW-INV-07):** Order cannot move to Lodged (7) without BOTH:
1. Approved ReviewAssignment
2. Locked TaxReturnResult

---

## 4. Admin Flows

### 4.1 Admin Dashboard

```
Admin opens Admin Dashboard
  |
  v
GET /api/v1/analytics/executive-summary (cached 5 min)
  |
  v
Dashboard widgets:
  - Revenue forecast (pipeline value x stage conversion probability)
  - Order counts by status, by FY, by staff
  - Lead pipeline health
  - Staff productivity
  - SLA compliance
  - Churn risk flagging
  - Collection rate
```

### 4.2 Analytics & Revenue Intelligence

```
Admin opens Analytics module
  |
  v
Available dashboards:
  - GET /api/v1/analytics/revenue-forecast (predicted revenue + confidence)
  - POST /api/v1/analytics/clv (client lifetime value scores)
  - GET /api/v1/analytics/staff-benchmark (productivity comparison)
  - POST /api/v1/analytics/channel-roi (campaign performance)
  - GET /api/v1/analytics/seasonal-trends (YoY filing volume)
  - GET /api/v1/analytics/churn-risk (at-risk clients for current FY)
  - GET /api/v1/analytics/service-mix (revenue by service)
  - GET /api/v1/analytics/collection-rate (payment timeliness)
  - GET /api/v1/analytics/pipeline-health (lead pipeline by stage)
  |
  v
All queries target MongoDB read replica (ANA-INV-01)
Revenue uses Payment.status=succeeded only (ANA-INV-02)
Max dateRange: 366 days (ANA-INV-05)
Cached 5 min with stale-while-revalidate (ANA-INV-06)
  |
  v
POST /api/v1/analytics/export (PDF/Excel)
```

### 4.3 Broadcast Campaign Management

```
Admin opens Broadcast module
  |
  v
POST /api/v1/broadcasts/campaigns
  {name, channel (sms|email|whatsapp|sms_email|all),
   audienceType, audienceFilters, templateId, scheduledAt?}
  -> Status: draft
  |
  v
Preview & Audience Count:
  POST /api/v1/broadcasts/campaigns/:id/preview (sample merge data)
  POST /api/v1/broadcasts/campaigns/:id/audience-count
  -> Cost estimate displayed (SMS: $0.075, Email: $0.001, WhatsApp: $0.05)
  |
  v
Send:
  POST /api/v1/broadcasts/campaigns/:id/send
  |
  v
Execution (BullMQ):
  1. Audience recalculated at execution time (BRC-INV-06)
  2. Per recipient:
     a. Check DND/opt-out at SEND time (BRC-INV-01)
     b. Check ConsentRecord per channel (BRC-INV-07)
     c. Resolve merge tags (fallback: {{firstName}} -> "Valued Client") (BRC-INV-08)
     d. SMS: auto-append "Reply STOP to unsubscribe" (BRC-INV-02)
     e. Email: auto-append sender ID (ABN) + unsubscribe link (BRC-INV-03)
  3. Track per-message delivery status
  |
  v
Campaign Analytics:
  GET /api/v1/broadcasts/campaigns/:id/stats
  -> Delivery, open, click, opt-out rates
  -> Open rate disclaimer: may be blocked by Apple Mail Privacy (BRC-INV-09)
```

### 4.4 Xero Configuration

```
Admin opens Xero Settings
  |
  v
Connect:
  GET /api/v1/xero/connect -> OAuth 2.0 redirect to Xero
  GET /api/v1/xero/callback -> store encrypted tokens
  |
  v
Configure:
  GET /api/v1/xero/accounts -> Chart of Accounts dropdown
  PUT /api/v1/xero/config {revenueAccountCode, bankAccountId, gstAccountCode}
  |
  v
Monitor:
  GET /api/v1/xero/status -> connection health, token status, last sync
  GET /api/v1/xero/sync-logs -> sync history with filters
  |
  v
Reconciliation:
  POST /api/v1/xero/reconciliation
  -> Compare QEGOS payments vs Xero, flag mismatches > $0.01 (XRO-INV-09)
  |
  v
Retry failures:
  POST /api/v1/xero/retry/:syncLogId
```

### 4.5 Staff Management

```
Admin opens Staff module
  |
  v
POST /api/v1/staff {firstName, lastName, email, password, roleId}
GET /api/v1/staff (search, pagination)
PUT /api/v1/staff/:id (update info)
PATCH /api/v1/staff/:id/status (toggle active/inactive)
POST /api/v1/staff/:id/set-password (admin reset)
GET /api/v1/staff/:id/workload (active leads, orders, pending follow-ups)
GET /api/v1/staff/availability (scheduling grid)
```

### 4.6 RBAC Management

```
Admin opens Role Management (limited to viewing)
Super Admin: full role management
  |
  v
GET /api/v1/roles (list all roles)
  |
  v
Super Admin only:
  POST /api/v1/roles {name, permissions[]}
  PUT /api/v1/roles/:id (cannot reduce system roles below baseline) (RBAC-INV-05)
  DELETE /api/v1/roles/:id (custom only, fails if users assigned)
  |
  v
PUT /api/v1/users/:id/role (admin+, AuditLog: severity=critical) (RBAC-INV-04)
  |
  v
Permission Audit Tools:
  GET /api/v1/permissions/access-report ("who has access to what")
  GET /api/v1/permissions/user/:userId (complete access profile)
  GET /api/v1/permissions/history (change history with diffs)
  GET /api/v1/permissions/anomalies (misconfiguration report)
  POST /api/v1/permissions/simulate ("what if" -- READ-ONLY) (PRM-INV-05)
```

### 4.7 Tax Rules Management

```
Admin opens Tax Rules
  |
  v
GET /api/v1/tax/rules (list all FY rules with status)
  |
  v
Create new rules:
  POST /api/v1/tax/rules -> status: draft
  PUT /api/v1/tax/rules/:id (edit draft only)
  |
  v
Validate:
  POST /api/v1/tax/rules/:id/validate
  -> Runs built-in test suite (12 test cases)
  -> ALL must pass before activation
  |
  v
Activate (Super Admin only):
  PATCH /api/v1/tax/rules/:id/activate
  -> Previous active -> superseded
  -> AuditLog: severity=critical (VER-INV-13)
  -> Only ONE active per FY (VER-INV-04)
  |
  v
Correct frozen rules:
  POST /api/v1/tax/rules/:id/correct {corrections, changeReason}
  -> Creates NEW version with parentSnapshotId
  -> Original stays frozen (VER-INV-01)
  -> changeReason REQUIRED (VER-INV-07)
```

### 4.8 Payment Gateway Configuration

```
Super Admin opens Payment Settings
  |
  v
PUT /api/v1/payments/config
  {primaryGateway, routingRule, amountThreshold,
   stripeEnabled, payrooEnabled, fallbackTimeoutMs,
   maintenanceMode, maintenanceMessage}
  -> AuditLog: severity=critical
  |
  v
POST /api/v1/payments/config/test
  -> Creates $0 auth, immediately voids (connectivity test)
```

### 4.9 Calendar & Deadline Management

```
Admin opens Tax Calendar
  |
  v
POST /api/v1/calendar/seed
  -> Seeds standard ATO deadlines for a financial year
  |
  v
POST /api/v1/calendar/deadlines (create custom)
PUT /api/v1/calendar/deadlines/:id (edit)
  |
  v
Reminders processed by cron:
  - Checks deadlines per user profile
  - Skips clients who already filed (CAL-INV-01)
  - Weekend/holiday shift to next business day (CAL-INV-02)
  - Uses Notification Engine with preferences (CAL-INV-04)
```

### 4.10 Audit Logs

```
Admin opens Audit Logs
  |
  v
POST /api/v1/audit-logs
  Filters: actor, actorType, action, resource, resourceId, severity, dateRange, search
  Paginated results
  |
  v
GET /api/v1/audit-logs/stats
  -> Actions/day, top actors, critical events, failed logins
  |
  v
Super Admin:
  POST /api/v1/audit-logs/export (CSV/Excel)
```

---

## 5. Super Admin Flows

Super Admin has all Admin capabilities plus:

### 5.1 System Configuration

- Full RBAC: create/edit/delete custom roles
- Tax rule activation (PATCH /api/v1/tax/rules/:id/activate)
- Payment gateway config (PUT /api/v1/payments/config)
- WhatsApp config (PUT /api/v1/whatsapp/config)
- Audit log export
- Role deletion (custom roles only, fails if users assigned)
- Refund approval (> $2,000 requires super_admin) (BIL-INV-04)
- Permission escalation approval (PRM-INV-03)

### 5.2 Permission Escalation Approval

```
Permission escalation detected:
  - Adding payment/config/audit_logs access requires super_admin (PRM-INV-03)
  - Cannot be done by regular admin
  |
  v
Super Admin reviews:
  POST /api/v1/permissions/simulate {roleId, proposedPermissions}
  -> READ-ONLY impact analysis: affected users, added/removed access
  |
  v
Super Admin approves:
  PUT /api/v1/roles/:id {permissions: updated}
  -> PermissionSnapshot created (PRM-INV-01)
  -> Reason required (PRM-INV-02)
  -> AuditLog: severity=critical
```

---

## Permission Matrix Summary

| Resource | Super Admin | Admin | Office Mgr | Senior Staff | Staff | Client | Student |
|----------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| users | CRUD/all | CRUD/all | R/all | R/assigned | R/assigned | RU/own | RU/own |
| orders | CRUD/all | CRUD/all | CRUD/all | CRUD/assigned | RU/assigned | CR/own | CR/own |
| payments | CRUD/all | CRUD/all | R/all | R/assigned | R/assigned | R/own | R/own |
| leads | CRUD/all | CRUD/all | CRUD/all | CRUD/all | CRUD/assigned | - | - |
| broadcasts | CRUD/all | CRUD/all | CRU/all | R/all | - | - | - |
| vault_documents | CRUD/all | CRUD/all | RU/all | RU/assigned | R/assigned | CRUD/own | CRUD/own |
| xero_config | CRUD/all | CRUD/all | R/all | - | - | - | - |
| payment_config | CRUD/all | CRUD/all | R/all | - | - | - | - |
| analytics | R/all | R/all | R/all | R/own | R/own | - | - |
| reviews | CRUD/all | CRUD/all | RU/all | R/own | R/own | CRU/own | CRU/own |
| chat | CRUD/all | CRUD/all | R/all | RU/assigned | RU/assigned | RU/own | RU/own |
| referrals | CRUD/all | CRUD/all | R/all | R/all | - | R/own | R/own |
| staff_mgmt | CRUD/all | CRUD/all | RU/all | - | - | - | - |
| system_config | CRUD/all | CRU/all | R/all | - | - | - | - |
| audit_logs | R/all | R/all | - | - | - | - | - |
| calendar | CRUD/all | CRUD/all | CRUD/all | R/all | R/all | R/own | R/own |
| whatsapp_config | CRUD/all | CRUD/all | R/all | - | - | - | - |

---

## Data Scope Rules

| Role | Data Visibility | Data Modification |
|------|----------------|-------------------|
| Super Admin | All data across entire platform | All data |
| Admin | All data | All data |
| Office Manager | All data (read), operational data (write) | Orders, leads, broadcasts, calendar |
| Senior Staff | Assigned records + all leads | Assigned orders, all leads, reviews |
| Staff | Assigned records only | Assigned orders/leads, own activities |
| Client | Own data only | Own profile (limited), own vault, own orders (create) |
| Student | Own data only (same as client) | Same as client |
