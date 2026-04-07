# QEGOS Use Case Documentation

**Product:** QEGOS — Tax Preparation, Filing & Client Management Platform
**Market:** Australia
**Date:** 2026-04-07
**Source:** QEGOS Final Production PRD v4.0

---

## Use Case Index

| Module | UC-IDs | Count |
|--------|--------|-------|
| RBAC & Permissions | RBAC-UC-01 to RBAC-UC-05 | 5 |
| Tax Calculation & Rules | TAX-UC-01 to TAX-UC-07 | 7 |
| Payments & Billing | PAY-UC-01 to PAY-UC-06, BIL-UC-01 to BIL-UC-03 | 9 |
| Lead Management | LM-UC-01 to LM-UC-08 | 8 |
| Order Management | ORD-UC-01 to ORD-UC-06 | 6 |
| Review Pipeline | RVW-UC-01 to RVW-UC-04 | 4 |
| Broadcast Engine | BRC-UC-01 to BRC-UC-04 | 4 |
| Client Portal & Vault | CPV-UC-01 to CPV-UC-05 | 5 |
| Communication (Chat/WA) | COM-UC-01 to COM-UC-05 | 5 |
| Xero Integration | XRO-UC-01 to XRO-UC-04 | 4 |
| Support Tickets | TKT-UC-01 to TKT-UC-04 | 4 |
| Engagement (Calendar/Reviews/Referrals) | ENG-UC-01 to ENG-UC-05 | 5 |
| **Total** | | **62** |

---

## 1. RBAC & Permissions Use Cases

### RBAC-UC-01: Staff Scoped Lead Access

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | role=staff, scope=assigned on leads |
| **Flow** | 1. Staff calls GET /api/v1/leads 2. checkPermission("leads", "read") passes 3. Middleware injects scopeFilter {assignedTo: staffId} 4. Only assigned leads returned |
| **Postcondition** | Staff sees 12 of 200 total leads (their assignments only) |
| **Invariants** | RBAC-INV-02 |

### RBAC-UC-02: Client Cross-Order Prevention

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | role=client, scope=own on orders |
| **Flow** | 1. Client calls GET /api/v1/orders/:foreignOrderId 2. Middleware injects {userId: clientId} 3. No match (foreign order belongs to different user) 4. Return 403 |
| **Postcondition** | Client gets 403 {status: 403, code: "FORBIDDEN", message: "Insufficient permissions"}. No data leakage about whether order exists. |
| **Invariants** | RBAC-INV-03, RBAC-INV-08 |

### RBAC-UC-03: Admin Audit Trail Review

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | AuditLog exists for payment |
| **Flow** | 1. Admin opens order detail 2. Clicks "Audit History" tab 3. POST /api/v1/audit-logs {resource: "payment", resourceId: paymentId} 4. Chronological list returned |
| **Postcondition** | Full change history: who, when, what changed, from what to what |
| **Invariants** | RBAC-INV-06, RBAC-INV-07 |

### RBAC-UC-04: Office Manager Delete Denied

| Field | Value |
|-------|-------|
| **Actor** | Office Manager |
| **Precondition** | staff_mgmt permissions: RU (no delete) |
| **Flow** | 1. DELETE /api/v1/staff/:id 2. checkPermission("staff_mgmt", "delete") 3. "delete" not in actions array 4. Return 403 |
| **Postcondition** | Staff account unchanged. AuditLog: "Permission denied: office_manager attempted delete on staff_mgmt" |
| **Invariants** | RBAC-INV-08 |

### RBAC-UC-05: Super Admin Creates Custom Role

| Field | Value |
|-------|-------|
| **Actor** | Super Admin |
| **Precondition** | Logged in as super_admin |
| **Flow** | 1. POST /api/v1/roles {name: "intern", permissions: [{resource: "orders", actions: ["read"], scope: "assigned"}]} 2. Role created with isSystem=false 3. Can be assigned to users |
| **Postcondition** | New "intern" role available. Only allows reading assigned orders. |
| **Invariants** | RBAC-INV-05 (system roles protected) |

---

## 2. Tax Calculation & Rules Use Cases

### TAX-UC-01: Client Checks Estimate from Portal

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Authenticated, active taxRuleConfig for FY |
| **Flow** | 1. Opens "Estimate Calculator" 2. Enters: employment $75K, $2K deductions, has HECS 3. POST /api/v1/tax/estimate 4. Server loads active rules, runs pure function 5. Returns: taxable $73K, tax ~$12.4K, HECS ~$2.2K, withheld $16K, est. refund ~$1.4K 6. Disclaimer shown. CTA: "Start FY2024-25 Return" |
| **Postcondition** | Estimate stored in taxEstimateLog. usageCount incremented on rules. |
| **Invariants** | TAX-INV-02, TAX-INV-03, TAX-INV-05, TAX-INV-09 |

### TAX-UC-02: Lead Conversion Quick Estimate

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | On phone with potential client |
| **Flow** | 1. Staff opens quick estimate 2. Enters "$95K income, rental losing $8K" 3. POST /api/v1/tax/estimate 4. Estimated tax saving from negative gearing: ~$2,400 5. "We could save you around $2,400. Come in for full assessment?" 6. Lead status -> Qualified |
| **Postcondition** | Estimate logged. Lead score updated. |
| **Invariants** | TAX-INV-12 (positioned as estimate, not certified) |

### TAX-UC-03: Budget Updates Tax Brackets

| Field | Value |
|-------|-------|
| **Actor** | Admin + Super Admin |
| **Precondition** | Federal budget announces new brackets for FY2025-26 |
| **Flow** | 1. Admin: POST /api/v1/tax/rules (draft) with new brackets 2. Reviews vs ATO published tables 3. POST /api/v1/tax/rules/:id/validate -> runs 12 test cases -> all pass 4. Super Admin: PATCH /api/v1/tax/rules/:id/activate 5. Previous active rules -> superseded (preserved forever) |
| **Postcondition** | New rules active for FY2025-26. Old calculations unchanged. AuditLog: severity=critical. |
| **Invariants** | VER-INV-01, VER-INV-04, VER-INV-13, TAX-INV-11 |

### TAX-UC-04: Admin Corrects Rule Typo After Returns Lodged

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Discovers HECS tier wrong in v1 (snapshotId: abc-123, usageCount: 347) |
| **Flow** | 1. POST /api/v1/tax/rules/abc-123/correct {corrections, changeReason: "HECS tier 3 rate was 0.04, should be 0.045"} 2. New v2 created (snapshotId: def-456, parentSnapshotId: abc-123) 3. v1 STAYS FROZEN -- 347 existing returns unchanged 4. New calculations use v2 |
| **Postcondition** | Corrected rules available. Original immutable. Audit trail complete. |
| **Invariants** | VER-INV-01, VER-INV-07, VER-INV-11 |

### TAX-UC-05: Client Disputes Estimate

| Field | Value |
|-------|-------|
| **Actor** | Client + Staff |
| **Precondition** | Client claims estimate promised specific refund |
| **Flow** | 1. Client: "You said I'd get $3,200!" 2. Staff: GET /api/v1/tax-results/:orderId/estimates 3. Shows: QGS-EST-0847, 15 Aug, by Jane, est. refund $3,187 4. Compares with actual: actual includes bank interest not in estimate 5. "The estimate didn't include $2,400 interest income you disclosed later" |
| **Postcondition** | Dispute resolved with evidence. Estimate log is immutable proof. |
| **Invariants** | TAX-INV-09 (estimates stored), TAX-INV-05 (disclaimer on every estimate) |

### TAX-UC-06: Amendment to Prior Year

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | Client forgot $3K deductions from FY2023-24 |
| **Flow** | 1. Create amendment order: orderType="amendment", linkedOrderId=original, financialYear="2023-24" 2. System loads original's rulesSnapshotId (xyz-789 = FY2023-24 rules) 3. Prepare amended return in external software using FY2023-24 brackets 4. POST /api/v1/tax-results/amendment 5. System auto-diffs: additional $900 refund 6. Lodge amendment with ATO |
| **Postcondition** | Amendment linked to original. Correct FY rules used. Auto-diff calculated. |
| **Invariants** | VER-INV-05, VER-INV-12 |

### TAX-UC-07: Reproduce 2-Year-Old Calculation for ATO Audit

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | ATO queries FY2022-23 return |
| **Flow** | 1. Load TaxReturnResult for the order 2. Read rulesSnapshotId: old-001 3. POST /api/v1/tax/recalculate with stored input + old-001 rules 4. Output matches stored result exactly (integer arithmetic = deterministic) 5. Export as PDF for ATO |
| **Postcondition** | Exact reproduction of original calculation. Frozen rules + stored input = guaranteed. |
| **Invariants** | VER-INV-01, VER-INV-02, TAX-INV-02, TAX-INV-03 |

---

## 3. Payment & Billing Use Cases

### PAY-UC-01: Happy Path Stripe Payment

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Order exists, payment not yet made |
| **Flow** | 1. Client: POST /payments/intent {orderId, idempotencyKey: uuid()} 2. PaymentRouter: primary=stripe -> creates Stripe PaymentIntent 3. Payment stored (status=pending, gateway=stripe) 4. Returns {clientSecret, gateway: "stripe", publishableKey} 5. Client confirms via Stripe SDK 6. Webhook: payment_intent.succeeded 7. WebhookEvent stored, Payment.status->succeeded 8. BullMQ: sync to Xero 9. Push: "Payment of $165.00 received for Order #QGS-O-0042" |
| **Postcondition** | Payment captured, Xero sync queued, client notified |
| **Invariants** | PAY-INV-01 to PAY-INV-04, PAY-INV-11, PAY-INV-12 |

### PAY-UC-02: Stripe Timeout with Payzoo Fallback

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Stripe experiencing connectivity issues |
| **Flow** | 1. POST /payments/intent 2. PaymentRouter tries Stripe 3. ETIMEDOUT after 10s 4. isRetryable=true -> Router creates Payzoo intent 5. Returns {clientSecret: payzooSecret, gateway: "payzoo"} 6. Client SDK detects gateway=payzoo, loads Payzoo UI |
| **Postcondition** | Payment proceeds via fallback. AuditLog: "Gateway fallback: stripe->payzoo, reason: ETIMEDOUT" |
| **Invariants** | PAY-INV-08 |

### PAY-UC-03: Card Declined (No Fallback)

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Client's card has insufficient funds |
| **Flow** | 1. POST /payments/intent -> Stripe PaymentIntent created 2. Client confirms -> Stripe returns card_declined 3. isRetryable=false -> NO fallback to Payzoo 4. Error: "Card declined. Please try a different card." |
| **Postcondition** | No payment created in secondary gateway. Client must retry with different card. |
| **Invariants** | PAY-INV-08 (business errors never trigger fallback) |

### PAY-UC-04: Duplicate Network Request

| Field | Value |
|-------|-------|
| **Actor** | Client (flaky network) |
| **Precondition** | First request in flight |
| **Flow** | 1. Client sends twice with same idempotencyKey 2. Second request finds existing Payment 3. Returns original response (same clientSecret, same paymentId) 4. Only one PaymentIntent exists in Stripe |
| **Postcondition** | No duplicate charge. Idempotency guaranteed. |
| **Invariants** | PAY-INV-01 |

### PAY-UC-05: Partial Refund

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Order paid $165.00, client overcharged $50 |
| **Flow** | 1. POST /payments/refund {paymentId, amount: 5000, reason: "Overcharge", idempotencyKey} 2. Validate: 0 (existing) + 5000 <= 16500 (captured) 3. gateway.refund(5000) 4. Payment.refundedAmount=5000, status=partially_refunded 5. BullMQ: create Xero credit note for $50.00 6. Push: "Refund of $50.00 processed" |
| **Postcondition** | Partial refund processed, Xero synced, client notified |
| **Invariants** | PAY-INV-06, BIL-INV-04 (>$500 needs admin, >$2000 needs super_admin) |

### PAY-UC-06: Webhook Replay Attack

| Field | Value |
|-------|-------|
| **Actor** | Attacker |
| **Precondition** | Captured valid webhook payload |
| **Flow** | 1. Replay captured webhook 2. Signature verification PASSES (same body, valid sig) 3. WebhookEvent: eventId already exists, status=processed 4. Return 200 OK, no reprocessing 5. Log: "Duplicate webhook ignored: evt_xxx" |
| **Postcondition** | No double-processing. System protected. |
| **Invariants** | PAY-INV-03 |

### BIL-UC-01: Prorated Cancellation

| Field | Value |
|-------|-------|
| **Actor** | Staff + Admin |
| **Precondition** | Client wants to cancel partially-completed order |
| **Flow** | 1. Client requests cancellation 2. Staff reviews each line item: completed (full), in_progress (prorated amount), not_started ($0) 3. System recalculates finalAmount 4. If already paid: refund difference 5. Xero: void old invoice, create adjusted invoice + credit note |
| **Postcondition** | Fair billing for work done. Xero reconciled. |
| **Invariants** | BIL-INV-02, BIL-INV-03 |

### BIL-UC-02: GST Rounding

| Field | Value |
|-------|-------|
| **Actor** | System |
| **Precondition** | Order with multiple line items |
| **Flow** | 1. Service $99.00: GST = Math.round(9900/11) = 900 cents ($9.00) 2. Service $165.00: GST = Math.round(16500/11) = 1500 cents ($15.00) 3. Total GST = 900 + 1500 = 2400 cents ($24.00) 4. NEVER calculate GST on total |
| **Postcondition** | ATO-compliant GST calculation. Per-line-item rounding. |
| **Invariants** | BIL-INV-01 |

### BIL-UC-03: Write-Off Bad Debt

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Invoice outstanding > 90 days, 2+ contact attempts documented |
| **Flow** | 1. POST /api/v1/payments/write-off {paymentId, reason} 2. Validate: >90 days, 2+ contacts 3. Admin approval 4. Void Xero invoice 5. Create bad debt entry |
| **Postcondition** | Invoice written off. Xero adjusted. AuditLog critical. |
| **Invariants** | BIL-INV-05 |

---

## 4. Lead Management Use Cases

### LM-UC-01: Create Lead with Duplicate Detection

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | Staff received phone inquiry |
| **Flow** | 1. POST /api/v1/leads {source: "phone_inbound", firstName: "Sarah", mobile: "+61412345678"} 2. System checks mobile AND email for duplicates (LM-INV-01) 3. Match found on mobile -> returns {lead, isDuplicate: true, duplicateMatches: [...]} 4. Staff reviews: different person -> proceeds. Same person -> updates existing. |
| **Postcondition** | Lead created (or existing updated). Mobile normalized to E.164. Score calculated. |
| **Invariants** | LM-INV-01, LM-INV-09 |

### LM-UC-02: Lead Status Transition with Validation

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | Lead in "Contacted" (2) status |
| **Flow** | 1. PATCH /api/v1/leads/:id/status {status: 7 (Lost)} 2. System checks: lostReason not provided 3. Return 400 {currentStatus: 2, message: "lostReason required for Lost status"} 4. Staff retries with {status: 7, lostReason: "chose_competitor", lostReasonNote: "Went with H&R Block"} 5. Status updated, activity logged |
| **Postcondition** | Lead marked as Lost with reason. Score recalculated. |
| **Invariants** | LM-INV-02, LM-INV-03 |

### LM-UC-03: Lead Conversion (Atomic)

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | Lead qualified, ready to become client |
| **Flow** | 1. POST /api/v1/leads/:id/convert 2. MongoDB transaction begins 3. isConverted=true 4. User created from lead data (if new mobile) 5. Order created, pre-filled from lead profile 6. lead.convertedOrderId + lead.convertedUserId linked 7. Transaction commits |
| **Postcondition** | Lead, User, and Order atomically created. Cannot convert again (409). |
| **Invariants** | LM-INV-04, LM-INV-05 |

### LM-UC-04: Bulk Import from Excel

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Excel file with 500 leads from marketing campaign |
| **Flow** | 1. POST /api/v1/leads/import (file upload) 2. Pass 1: validate ALL 500 rows (mobile format, required fields, duplicates) 3. Row 47: invalid mobile "041234" -> fails 4. Row 212: missing firstName -> fails 5. NOTHING imported (any failure = entire batch fails) 6. Return {imported: 0, errors: [{row: 47, field: "mobile", error: "Invalid format"}, {row: 212, field: "firstName", error: "Required"}]} |
| **Postcondition** | Zero records created. Admin fixes file, retries. |
| **Invariants** | LM-INV-08 (two-pass validation) |

### LM-UC-05: Lead Merge

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Two leads found for same person (different mobile numbers) |
| **Flow** | 1. POST /api/v1/leads/merge {primaryLeadId, secondaryLeadId, fieldSelections: {name: "primary", email: "secondary", mobile: "secondary"}} 2. All activities from secondary transferred to primary 3. All reminders transferred 4. Secondary soft-deleted 5. AuditLog with both IDs |
| **Postcondition** | Single consolidated lead with full activity history from both. |
| **Invariants** | LM-INV-06 |

### LM-UC-06: Auto-Assignment Round Robin

| Field | Value |
|-------|-------|
| **Actor** | System |
| **Precondition** | New lead created without assignedTo |
| **Flow** | 1. Query active staff 2. Skip: status=false (inactive) 3. Skip: currentLeadCount >= 50 (at capacity) 4. Select next in round-robin 5. Assign lead, send push notification |
| **Postcondition** | Lead assigned. Balanced distribution. |
| **Invariants** | LM-INV-07 |

### LM-UC-07: Score-Triggered Priority Change

| Field | Value |
|-------|-------|
| **Actor** | System |
| **Precondition** | Lead at score 58 (warm), then responds positively |
| **Flow** | 1. Staff logs activity: outcome=interested (+15 points) 2. Score recalculates: 58 + 15 = 73 3. Threshold crossed: 61+ = hot 4. Priority auto-updates: warm -> hot 5. Push notification to assigned staff: "Lead Sarah is now HOT" |
| **Postcondition** | Lead priority escalated. Staff alerted. |
| **Invariants** | LM-INV-11 |

### LM-UC-08: Stale Lead Alert

| Field | Value |
|-------|-------|
| **Actor** | System (cron) |
| **Precondition** | Lead in "New" (1) status for > 24 hours, no activity |
| **Flow** | 1. BullMQ cron detects stale lead 2. Push notification to assignee 3. Slack alert to admin with lead details |
| **Postcondition** | Staff and admin alerted. Lead needs attention. |

---

## 5. Order Management Use Cases

### ORD-UC-01: Order Creation with Price Snapshot

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Client selected services from catalogue |
| **Flow** | 1. POST /api/v1/orders {personalDetails, financialYear: "2024-25", lineItems: [{salesId, quantity: 1}]} 2. Server fetches Sales prices, sets priceAtCreation on each lineItem 3. totalAmount calculated server-side (sum of lineItems in cents) 4. discountAmount calculated if applicable 5. finalAmount = totalAmount - discountAmount 6. Order created: status=1 (Pending), orderNumber: QGS-O-XXXX |
| **Postcondition** | Order exists with frozen prices. TFN encrypted. userId immutable. |
| **Invariants** | ORD-INV-02, ORD-INV-03, ORD-INV-04, ORD-INV-05, ORD-INV-06 |

### ORD-UC-02: Staff Assignment

| Field | Value |
|-------|-------|
| **Actor** | Admin / Office Manager |
| **Precondition** | Order in Pending or Documents Received |
| **Flow** | 1. PUT /api/v1/orders/:id/assign {processingBy: staffId} 2. Order status -> Assigned (3) 3. AuditLog created 4. Push notification to assigned staff |
| **Postcondition** | Staff can now see and work on this order. |
| **Invariants** | ORD-INV-07 |

### ORD-UC-03: Backward Status Transition

| Field | Value |
|-------|-------|
| **Actor** | Senior Staff |
| **Precondition** | Order in "In Progress" (4), needs more documents |
| **Flow** | 1. PATCH /api/v1/orders/:id/status {status: 2, note: "Missing rental income statements"} 2. Role check: senior_staff can do backward transitions 3. Status: 4 -> 2 (Documents Received) 4. AuditLog |
| **Postcondition** | Order moved back for document collection. |
| **Invariants** | ORD-INV-01 |

### ORD-UC-04: Order Cancellation with Cascading Effects

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Order in progress, has Xero invoice and pending payment |
| **Flow** | 1. PATCH /api/v1/orders/:id/status {status: 9, note: "Client relocated overseas"} 2. Role check: admin or office_manager 3. reason field required 4. Cascade: void Xero invoice, cancel pending payments 5. AuditLog: severity=critical |
| **Postcondition** | Order cancelled. Financial records cleaned up. |
| **Invariants** | ORD-INV-08 |

### ORD-UC-05: Appointment Scheduling

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Order exists, staff assigned |
| **Flow** | 1. POST /api/v1/orders/:id/appointment {date, timeSlot, type: "video", staffId} 2. Double-booking check (APT-INV-01) 3. Appointment created 4. Reminders scheduled: 24hr before (email), 2hr before (push+SMS) |
| **Postcondition** | Appointment confirmed. Auto-reminders queued. |
| **Invariants** | APT-INV-01, APT-INV-02, APT-INV-04 (timezone handling) |

### ORD-UC-06: Bulk Assignment

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Multiple unassigned orders |
| **Flow** | 1. PUT /api/v1/orders/:id/bulk-assign {orderIds: [...], processingBy: staffId} 2. Permission checked per item (RBAC-INV-09) 3. Each order assigned, AuditLog per order 4. Push notification to staff |
| **Postcondition** | All specified orders assigned. Per-item audit trail. |
| **Invariants** | RBAC-INV-09 |

---

## 6. Review Pipeline Use Cases

### RVW-UC-01: Submit for Review

| Field | Value |
|-------|-------|
| **Actor** | Staff (preparer) |
| **Precondition** | Order in "In Progress" (4), preparation complete |
| **Flow** | 1. POST /api/v1/order-reviews/submit {orderId} 2. Order status: 4 -> 5 (Review) 3. ReviewAssignment created (status: pending_review) 4. Reviewer assigned per rules (self-review blocked) 5. Push notification to reviewer |
| **Postcondition** | Order in review queue. Reviewer notified. |
| **Invariants** | RVW-INV-02 |

### RVW-UC-02: Approve Return

| Field | Value |
|-------|-------|
| **Actor** | Reviewer (Senior Staff / Admin) |
| **Precondition** | ReviewAssignment in "in_review", all 12 checklist items reviewed |
| **Flow** | 1. PATCH /api/v1/order-reviews/:orderId/approve 2. Validate: ALL checklist items checked 3. status: approved, approvedAt = now 4. timeToReview calculated 5. AuditLog: "Return approved by [reviewer]" |
| **Postcondition** | Order unlocked for lodgement. Review metrics updated. |
| **Invariants** | RVW-INV-01, RVW-INV-03, RVW-INV-04 |

### RVW-UC-03: Request Changes (Multiple Rounds)

| Field | Value |
|-------|-------|
| **Actor** | Reviewer |
| **Precondition** | Issues found during review |
| **Flow** | 1. PATCH /api/v1/order-reviews/:orderId/request-changes {changesRequested: [{field: "deductions.vehicle", issue: "No logbook in vault", instruction: "Upload logbook or remove deduction"}], reviewNotes: "Overall good, one issue"} 2. Status: changes_requested 3. Order status: Review (5) -> In Progress (4) 4. Push to preparer 5. Preparer fixes, resubmits 6. reviewRound = 2 7. If reviewRound > 3: auto-escalate to admin |
| **Postcondition** | Preparer notified of issues. Review cycle tracked. |
| **Invariants** | RVW-INV-05 |

### RVW-UC-04: Reject Return

| Field | Value |
|-------|-------|
| **Actor** | Reviewer / Admin |
| **Precondition** | Fundamental issues with return |
| **Flow** | 1. PATCH /api/v1/order-reviews/:orderId/reject {rejectedReason: "Client identity cannot be verified -- TFN does not match ATO records"} 2. Status: rejected (terminal) 3. AuditLog: severity=warning |
| **Postcondition** | Return rejected. Requires new approach (not just changes). |

---

## 7. Broadcast Engine Use Cases

### BRC-UC-01: Create and Send SMS Campaign

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Tax deadline approaching, want to notify unfiledclients |
| **Flow** | 1. POST /api/v1/broadcasts/campaigns {name: "FY2025 Deadline Reminder", channel: "sms", audienceType: "filtered_users", audienceFilters: {userType: [2], financialYear: "2024-25"}, smsBody: "Hi {{firstName}}, your tax return deadline is {{deadlineDate}}..."} 2. POST /audience-count -> 3,200 recipients, cost $240 3. POST /send 4. Queue processes at 10 msg/sec with DND checks |
| **Postcondition** | Campaign sent. Per-message tracking. STOP replies auto-processed. |
| **Invariants** | BRC-INV-01 to BRC-INV-04 |

### BRC-UC-02: A/B Test Email Campaign

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Want to test subject line effectiveness |
| **Flow** | 1. Create campaign with abTest.enabled=true 2. Variant A: "Your tax refund is waiting" (50%) 3. Variant B: "Don't miss your $2,400 refund" (50%) 4. Winner metric: open_rate 5. Send -> track opens per variant 6. Winner auto-selected |
| **Postcondition** | Better subject line identified. Data-driven decisions. |

### BRC-UC-03: Handle Spam Complaint

| Field | Value |
|-------|-------|
| **Actor** | System |
| **Precondition** | Recipient marks email as spam in their email client |
| **Flow** | 1. SES sends complaint notification via SNS 2. System processes: immediate DND for ALL channels 3. Contact added to broadcastOptOut (reason: spam_complaint) 4. All future sends blocked |
| **Postcondition** | Recipient never contacted again. Spam Act compliance maintained. |
| **Invariants** | BRC-INV-04 |

### BRC-UC-04: Schedule WhatsApp Template Campaign

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Pre-approved WhatsApp template exists in Meta |
| **Flow** | 1. Create campaign: channel=whatsapp, whatsappTemplateName="tax_reminder" 2. Schedule for Monday 9am AEST 3. Cron triggers at scheduledAt 4. Audience recalculated at execution time (BRC-INV-06) 5. DND + consent checked per recipient at send time (BRC-INV-01, BRC-INV-07) 6. Template messages sent (business-initiated, no window required) |
| **Postcondition** | WhatsApp messages delivered with delivery+read receipts from Meta. |

---

## 8. Client Portal & Vault Use Cases

### CPV-UC-01: Upload Document with Virus Scan

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Has PAYG Payment Summary to upload |
| **Flow** | 1. POST /api/v1/vault/upload {financialYear: "2024-25", category: "payg_summary", file} 2. Check quota: used + size <= 500MB 3. Validate: PDF magic bytes -> pass 4. ClamAV scan -> clean 5. SHA-256 hash -> no duplicate 6. Upload to S3: vault/{userId}/2024-25/{uuid}-payg.pdf 7. $inc storageUsed 8. VaultDocument created (version: 1) |
| **Postcondition** | Document stored securely. Categorized by FY. |
| **Invariants** | CPV-INV-01 to CPV-INV-07 |

### CPV-UC-02: Detect Duplicate Upload

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Same file already uploaded |
| **Flow** | 1. Upload attempt 2. SHA-256 hash matches existing {userId, financialYear, contentHash} 3. Return WARNING: "This file appears identical to payg_summary.pdf uploaded on 15 Mar 2026. Upload anyway?" 4. Client confirms -> upload proceeds (advisory only) |
| **Postcondition** | Client informed. Not blocked. |
| **Invariants** | STR-INV-02 |

### CPV-UC-03: Prior-Year Prefill

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Filed FY2023-24, starting FY2024-25 |
| **Flow** | 1. GET /api/v1/vault/prefill/2024-25 2. System pulls FY2023-24 data from vault + summaries 3. Returns {suggested: {employer: "Acme Corp", grossIncome: 6800000, ...}, source: "FY2023-24"} 4. Client reviews, confirms/edits before submission |
| **Postcondition** | Form pre-populated. Client saves time. Data is read-only suggestion. |
| **Invariants** | CPV-INV-10 |

### CPV-UC-04: Storage Quota Exceeded

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | At 495MB of 500MB quota |
| **Flow** | 1. Upload 10MB file 2. Pre-upload check: 495MB + 10MB > 500MB 3. Return 400 {code: "STORAGE_EXCEEDED", used: 519045120, quota: 524288000, fileSize: 10485760} 4. Client deletes old files or contacts admin for quota increase |
| **Postcondition** | Upload blocked. Clear error with breakdown. |
| **Invariants** | CPV-INV-06 |

### CPV-UC-05: Staff Accesses Client Vault (Audit)

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | Staff assigned to client's order, needs to view uploaded documents |
| **Flow** | 1. GET /api/v1/vault/documents/:id 2. Presigned URL generated (15 min expiry) 3. AuditLog created: severity=warning ("Staff [name] accessed client [name] vault document [filename]") |
| **Postcondition** | Staff gets temporary access. Audit trail created. |
| **Invariants** | CPV-INV-03, CPV-INV-08 |

---

## 9. Communication Use Cases

### COM-UC-01: In-App Chat with TFN Redaction

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Active conversation with assigned staff |
| **Flow** | 1. Client sends: "My TFN is 123 456 789" 2. Pre-save hook detects TFN pattern 3. content stored as: "My TFN is *** *** ***" 4. contentOriginal stored encrypted (accessible to assigned staff + admin) 5. Socket.io emits new_message to conversation room 6. Staff receives redacted version in UI (original accessible on demand) |
| **Postcondition** | TFN protected in storage. Communication preserved. |
| **Invariants** | CHT-INV-01 |

### COM-UC-02: Conversation Transfer

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Staff A leaving, need to transfer conversations |
| **Flow** | 1. PATCH /api/v1/chat/conversations/:id/transfer {newStaffId} 2. Full message history preserved 3. Both staff see all messages 4. System message: "You're now speaking with [new staff name]" 5. AuditLog |
| **Postcondition** | Seamless handoff. Client informed. History intact. |
| **Invariants** | CHT-INV-07 |

### COM-UC-03: WhatsApp Template Message

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | Lead's WhatsApp window expired (>24hr since last inbound) |
| **Flow** | 1. POST /api/v1/whatsapp/send {contactId, templateName: "tax_followup", params: ["Sarah", "FY2024-25"]} 2. Check DND (WHA-INV-07) 3. Format phone: +61412345678 -> 61412345678 (WHA-INV-04) 4. Send via Meta Cloud API 5. Auto-create LeadActivity type=whatsapp_sent (WHA-INV-05) |
| **Postcondition** | Template message sent. Activity logged. |
| **Invariants** | WHA-INV-02, WHA-INV-04, WHA-INV-05, WHA-INV-07 |

### COM-UC-04: WhatsApp Inbound Media to Vault

| Field | Value |
|-------|-------|
| **Actor** | Client (via WhatsApp) + Staff |
| **Precondition** | Client sends photo of PAYG summary via WhatsApp |
| **Flow** | 1. Meta webhook fires with image message 2. BullMQ: download from Meta CDN within 30 min (URLs expire) 3. Store to S3 as WhatsApp message media 4. Staff sees image in conversation 5. Staff clicks "Save to Vault" 6. Image saved as vaultDocument with ClamAV scan |
| **Postcondition** | Client's document captured from WhatsApp into secure vault. |
| **Invariants** | WHA-INV-01, WHA-INV-06 |

### COM-UC-05: Chat to Support Ticket Conversion

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | Client reporting billing issue in chat |
| **Flow** | 1. Staff clicks "Convert to Ticket" 2. Ticket created pre-filled from chat context 3. SLA auto-calculated based on detected priority 4. Chat continues, ticket tracked separately |
| **Postcondition** | Structured ticket with SLA tracking. No information lost. |

---

## 10. Xero Integration Use Cases

### XRO-UC-01: Initial OAuth Connection

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Xero account exists, QEGOS not connected |
| **Flow** | 1. GET /api/v1/xero/connect -> redirect to Xero OAuth 2. Admin authorizes QEGOS in Xero 3. GET /api/v1/xero/callback with auth code 4. Exchange for access + refresh tokens 5. Tokens encrypted AES-256-GCM before storage 6. xeroConnected=true, tenantId stored |
| **Postcondition** | Xero connected. Auto-sync begins. |
| **Invariants** | XRO-INV-01 |

### XRO-UC-02: Auto-Invoice on Order Processing

| Field | Value |
|-------|-------|
| **Actor** | System |
| **Precondition** | Order moves to In Progress, Xero connected |
| **Flow** | 1. Event: "order.invoiceable" 2. XeroSyncWorker: check idempotency (xeroInvoiceId exists? Xero search by orderNumber?) 3. Ensure contact exists (match by email, then mobile) 4. Build invoice: lineItems with priceAtCreation, GST per-item 5. POST to Xero as AUTHORISED 6. Store xeroInvoiceId on Order |
| **Postcondition** | Invoice in Xero matches QEGOS order exactly. |
| **Invariants** | XRO-INV-04, XRO-INV-06, XRO-INV-07, XRO-INV-11 |

### XRO-UC-03: Reconciliation Mismatch Detection

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | Monthly reconciliation time |
| **Flow** | 1. POST /api/v1/xero/reconciliation 2. Compare all QEGOS payments (succeeded) vs Xero payments 3. Flag mismatches > $0.01 4. Report: 3 mismatches found (manual Xero entry, failed sync, etc.) |
| **Postcondition** | Discrepancies identified for resolution. |
| **Invariants** | XRO-INV-09 |

### XRO-UC-04: Xero Disconnection Resilience

| Field | Value |
|-------|-------|
| **Actor** | System |
| **Precondition** | Xero token expired, refresh fails |
| **Flow** | 1. All operations continue normally 2. Sync jobs queue with status=queued 3. When admin reconnects (new OAuth flow) 4. POST /api/v1/xero/bulk-sync-invoices clears queue |
| **Postcondition** | No data loss. Queued syncs process on reconnection. |
| **Invariants** | XRO-INV-10 |

---

## 11. Support Ticket Use Cases

### TKT-UC-01: Create Urgent Ticket (Auto-Escalation)

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Client discovers wrong refund amount filed |
| **Flow** | 1. POST /api/v1/tickets {category: "amendment_request", priority: "urgent", subject: "Wrong refund filed"} 2. SLA: 1hr first response, 4hr resolution 3. If unassigned after 30 min: auto-assign on-duty admin + Slack alert 4. If 80% SLA elapsed: push to assignee + Slack warning 5. If SLA breached: escalate to office_manager |
| **Postcondition** | Ticket tracked with full SLA lifecycle. |
| **Invariants** | TKT-INV-01, TKT-INV-04 |

### TKT-UC-02: Staff Complaint Routing

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Client unhappy with staff member |
| **Flow** | 1. POST /api/v1/tickets {category: "staff_complaint", description: "Staff was rude..."} 2. System auto-assigns to office_manager 3. NEVER assigned to complained-about staff |
| **Postcondition** | Complaint properly routed. No conflict of interest. |
| **Invariants** | TKT-INV-02 |

### TKT-UC-03: Internal Notes (Hidden from Client)

| Field | Value |
|-------|-------|
| **Actor** | Staff |
| **Precondition** | Working on ticket, need to note internal findings |
| **Flow** | 1. POST /api/v1/tickets/:id/message {content: "Checked with ATO -- processing delay on their end", isInternal: true} 2. Message visible to staff/admin only 3. Client never sees isInternal messages in portal or API |
| **Postcondition** | Internal collaboration without client visibility. |
| **Invariants** | TKT-INV-03 |

### TKT-UC-04: Ticket Reopen Limit

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Ticket resolved, client disagrees, already reopened 3 times |
| **Flow** | 1. POST /api/v1/tickets/:id/reopen 2. Check reopenCount: 3 >= max(3) 3. Return 400: "Maximum reopens reached. Please create a new ticket." |
| **Postcondition** | Reopen blocked. Client directed to new ticket. |
| **Invariants** | TKT-INV-06 |

---

## 12. Engagement Module Use Cases

### ENG-UC-01: Tax Deadline Reminder (Smart Filtering)

| Field | Value |
|-------|-------|
| **Actor** | System (cron) |
| **Precondition** | Individual tax deadline approaching 31 October |
| **Flow** | 1. Cron: process reminders for deadlines due in 30/14/7/1 days 2. For each client: check if Order.status >= Lodged (7) for this FY 3. Already filed -> SKIP (CAL-INV-01) 4. Not filed -> send reminder via NotificationService (preference-aware) 5. Dedup: max 1 reminder per {userId, deadlineId, daysBefore} |
| **Postcondition** | Only unfiled clients receive reminders. No spam to already-filed. |
| **Invariants** | CAL-INV-01, CAL-INV-03, CAL-INV-04 |

### ENG-UC-02: Review Request (Post-Completion)

| Field | Value |
|-------|-------|
| **Actor** | System |
| **Precondition** | Order just completed (status 6), payment succeeded |
| **Flow** | 1. Event: "order.completed" 2. BullMQ: schedule review request with 24hr delay 3. Check: order has payment.status=succeeded (REV-INV-05) 4. Send push notification 5. If no response after 7 days: single reminder 6. After 14 days: no further reminders |
| **Postcondition** | Review requested appropriately. Not pushy. |
| **Invariants** | REV-INV-05 |

### ENG-UC-03: Google Review (Non-Gated)

| Field | Value |
|-------|-------|
| **Actor** | Client |
| **Precondition** | Client just submitted 2-star review |
| **Flow** | 1. Review submitted with rating=2 2. Google Review prompt shown (same as for 5-star reviews) 3. NOT conditional on rating 4. ADDITIONALLY: Slack alert for immediate service recovery (rating 1-2) |
| **Postcondition** | Google ToS compliance. Low rating triggers internal response. |
| **Invariants** | REV-INV-01 |

### ENG-UC-04: Referral Reward Processing

| Field | Value |
|-------|-------|
| **Actor** | System |
| **Precondition** | Referee completed order and paid |
| **Flow** | 1. Event: order.completed + payment.succeeded 2. Check all 3 conditions: status >= 6, payment succeeded, finalAmount >= minimum 3. Check: referrer not at max referrals/year (50) 4. Apply reward to referrer (credit/discount) 5. Apply reward to referee (credit/discount) 6. Referral status: completed -> rewarded |
| **Postcondition** | Both parties rewarded. Referral tracked. |
| **Invariants** | REF-INV-01, REF-INV-07 |

### ENG-UC-05: Churn Risk Detection

| Field | Value |
|-------|-------|
| **Actor** | Admin |
| **Precondition** | New financial year started |
| **Flow** | 1. GET /api/v1/analytics/churn-risk 2. System identifies: clients who filed FY2023-24 but haven't started FY2024-25 3. Returns list ranked by CLV 4. Admin creates re-engagement broadcast targeting these clients |
| **Postcondition** | At-risk clients identified for proactive outreach. |
| **Invariants** | ANA-INV-03 (CLV uses succeeded payments only) |
