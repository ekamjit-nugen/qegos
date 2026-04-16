# QEGOS — Project Rules & Current Reality

## Project Overview
QEGOS is a tax preparation, filing, and client management platform for the Australian market.
PRD: `QEGOS-FINAL-PRD-v4.md` (reference document, not all of it is implemented).

This file describes the codebase **as it actually is today**, not as we wish it were. When a rule is aspirational, it is labeled as such. If you add a rule here, enforce it in code (lint, CI, type check) or don't add it.

---

## Language & Framework (Enforced)

**All code is TypeScript.** No `.js` files should be introduced in `apps/` or `packages/` source trees.

| Layer | Stack |
|-------|-------|
| Backend API | Node.js + Express + TypeScript (`apps/api`) |
| Admin dashboard | Next.js + TypeScript + Ant Design (`apps/admin`) |
| Client web | Next.js + TypeScript (`apps/web`) |
| Mobile | React Native + TypeScript (`apps/mobile`) |
| Shared packages | TypeScript (`packages/*`) |

### TypeScript rules (enforced by `tsc --noEmit`)
- `strict: true` across the repo.
- Functions and parameters typed explicitly.
- Mongoose models paired with `IFooDocument` interfaces.
- `any` is forbidden; use `unknown` + narrowing, or proper types.
- **`as never` / `as unknown as X` casts are a code smell.** They are currently used in `apps/api/src/server.ts` to paper over Mongoose `Model<T>` generic mismatches at the DI boundary. Treat any new one as tech debt to justify in review.

### Monorepo build
- Project references via `tsconfig.json` at the root.
- Each package compiles to `dist/` with `declaration: true`.
- `npm run build` walks the dependency graph.
- After editing a shared package, the consuming app sees the change only after that package's `dist/` is rebuilt. If you edit a package type and the app still shows the old error, run `cd packages/<pkg> && npx tsc --build --force`.

---

## Modular Architecture

The architecture target is **Nugen Shared Module Architecture**: Tier 1 packages are product-agnostic and reusable across Nugen products (Nexora, SyncVault, SchemeIQ, AuditLens); Tier 2 modules are QEGOS-specific and consume Tier 1.

### Tier 1 — Shared packages (`packages/*`)

| Package | Status |
|---------|--------|
| `@nugen/error-handler` | Implemented |
| `@nugen/validator` | Implemented |
| `@nugen/rate-limiter` | Implemented |
| `@nugen/auth` | Implemented (JWT, refresh, OTP; MFA APIs partial) |
| `@nugen/rbac` | Implemented (RBAC + `CheckPermissionFn` canonical type) |
| `@nugen/audit-log` | Implemented (`AuditLogDI` canonical type) |
| `@nugen/notification-engine` | Implemented (push/SMS/email/in-app) |
| `@nugen/payment-gateway` | Implemented (Stripe — used on web Pay Now + mobile Collect Payment) |
| `@nugen/file-storage` | Implemented (S3 + virus scan + vault document model) |
| `@nugen/broadcast-engine` | Implemented — depth of campaign lifecycle is shallow |
| `@nugen/chat-engine` | Skeleton — socket handlers + schemas exist; conversation UX is thin |
| `@nugen/support-tickets` | Skeleton — ticket model + SLA stubs; escalation logic minimal |
| `@nugen/analytics-engine` | Implemented (aggregation jobs via BullMQ) |
| `@nugen/xero-connector` | Implemented (OAuth, sync routes, webhook handler) |
| `@nugen/whatsapp-connector` | Skeleton — Meta Cloud API glue present; template/window tracking shallow |
| `@nugen/data-lifecycle` | Implemented (privacy exports/erasure) |

### Tier 2 — Domain modules (`apps/api/src/modules/*`)

| Module | Status |
|--------|--------|
| `order-management` | Solid (order CRUD, payment capture, status machine, appointment) |
| `lead-management` | Solid (lifecycle, scoring, activities, conversion, automation) |
| `client-portal` | Solid (vault, tax summaries, ATO status, YoY compare, prefill) |
| `tax-engine` | Solid for the read paths used by orders and prefill |
| `review-pipeline` | Implemented (assignments, checklist, change requests) |
| `appointment-scheduling` | Implemented |
| `form-mapping` / `consent-form` / `document-management` | Implemented |
| `tax-calendar` | Shallow — deadlines + reminders, no compliance UI |
| `reputation-mgmt` | Shallow — reviews + NPS, no Google Review prompt flow |
| `referral-engine` | Shallow — codes + tracking, no leaderboard |
| `staff-workload` | Implemented (smart assignment) |

### Module design rules (enforced)

1. **Dependency direction.** Tier 2 imports Tier 1. Tier 1 never imports Tier 2 or `apps/`. Tier 1 packages avoid importing each other; `@nugen/audit-log` has a tactical inline duplicate of a narrow `CheckPermissionFn` subset to avoid depending on `@nugen/rbac` at the package level.
2. **Configuration over code.** Tier 1 packages take a config object at `init(...)`. QEGOS-specific behavior (phone regex, business hours, etc.) is passed in, not baked in.
3. **DI at the service boundary.** `apps/api/src/server.ts` wires Mongoose models, auth, rbac, audit, and per-module services into each route factory. The canonical DI types live in the packages:
   - `CheckPermissionFn` from `@nugen/rbac`
   - `AuditLogDI` from `@nugen/audit-log`
   Every `*RouteDeps` consumes these instead of redeclaring inline.
4. **Synchronous DI today; events are aspirational.** Modules currently integrate via direct function calls passed through DI (e.g., `notificationSend` injected into `appointment-scheduling`). BullMQ is used for scheduled jobs (reminders, automation, analytics, DLQ), not for inter-module pub/sub. A future event-bus pattern is not in scope and not enforced.
5. **Database isolation.** Packages define schemas and expect a Mongoose `connection` passed in at `init(...)`. The app owns the connection.
6. **Public API.** Each package exports its surface via `src/index.ts` compiled to `dist/index.{js,d.ts}`.

### Aspirational (NOT currently true)

- **Mongoose plugin composition for User model.** The old rule described `authPlugin` / `rbacPlugin` composed onto a User schema. Today, `@nugen/auth` exposes services and middleware, not plugins; the User model lives in `apps/api/src/modules/user/user.model.ts` and is injected into packages as a `Model<any>`. If we want the plugin pattern, it's a deliberate refactor, not the current state.
- **Event-driven inter-module integration.** See rule 4 above.
- **Per-package test suites.** Most packages do not ship test files; `apps/api/tests/` does not exist. Treat "has tests" as a property to add, not a property to assume.

---

## Directory Structure (actual)

```
qegos/
├── CLAUDE.md
├── QEGOS-FINAL-PRD-v4.md
├── packages/
│   ├── auth/ rbac/ audit-log/ error-handler/ validator/ rate-limiter/
│   ├── notification-engine/ payment-gateway/ file-storage/
│   ├── broadcast-engine/ chat-engine/ support-tickets/ analytics-engine/
│   ├── xero-connector/ whatsapp-connector/ data-lifecycle/
│   └── (each: src/, dist/, package.json, tsconfig.json)
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── server.ts            # 1600+ line DI assembly — split candidate
│   │       ├── modules/             # Tier 2 domain modules
│   │       ├── config/ database/
│   └── admin/ web/ mobile/
└── (no tests/ directory at repo root)
```

---

## Coding standards (enforced by code review)

- **Money:** integer cents. No floats. Validated with `Number.isInteger`.
- **Dates:** UTC at rest. Timezone conversion in the display layer only.
- **Phone:** E.164 (`^\+61\d{9}$` in the QEGOS config).
- **IDs:** Mongoose `ObjectId`. Human-readable IDs (e.g. `QGS-O-0001`) are secondary and generated via `@nugen/counter`-style atomic sequence.
- **Secrets:** AES-256-GCM encryption at rest for secret values; never logged.
- **Inputs:** validated with `express-validator` wrappers from `@nugen/validator` before any handler logic.
- **Errors:** `{ status, code, message, errors[] }` via `@nugen/error-handler`. No stack traces in production responses.
- **Mutations:** audit-logged via `@nugen/audit-log`. The DI shape is `AuditLogDI` (`log` + `logFromRequest`).
- **Soft delete:** default; `data-lifecycle` cron hard-deletes after grace period.

---

## Current State (honest)

**Solid ground:**
- Order read/write path (creation, status machine, payments, appointment linkage).
- Web Pay Now (Stripe Payment Element) and mobile Collect Payment.
- Admin CRM patches (leads, orders, users).
- RBAC seed + route-level permission checks.
- Security baseline: rate limiting, JWT rotation, virus scan on vault upload, mongo-sanitize, encrypted secrets.
- Canonical DI types shipped from `@nugen/rbac` and `@nugen/audit-log`; route factories now import them instead of duplicating shapes.
- `apps/api` passes `tsc --noEmit` with 0 errors.
- Admin "full refund" (`POST /admin/payments/:id/full-refund`, `apps/api/src/modules/order-management/refund.routes.ts`) is saga-wrapped: Stripe `processRefund` runs first as the irreversible step, then a domain saga re-credits the user, revokes the promo usage, and flips `Order.paymentStatus`. v1 only restores credit + promo for FULL refunds; partial refunds only flip the order status. The package-level `POST /payments/:id/refund` still exists for raw-without-domain-rollback callers (legacy tests, integration suites).

**Known gaps:**
- **Money-path integration tests** — Pay Now (web), Collect Payment (staff), and the admin full-refund saga all have e2e suites with rollback coverage; webhook reconciliation is wired for Pay Now / Collect Payment.
- **Partial-Stripe paths in Pay Now and Collect Payment are NOT saga-wrapped.** Only the full-credit (no-gateway) branch is saga-safe. When the order needs a Stripe top-up, the route creates a PaymentIntent, then provisionally deducts credits and applies promo BEFORE persisting the order. If credit/promo/order writes fail mid-flight, or the customer abandons the payment, those provisional deductions are not automatically reversed (the package's webhook reconciler doesn't touch credit/promo — Tier 1 can't depend on Tier 2 services). Real failure mode: customer abandons checkout, credits are gone forever. Fix needs (a) a saga around the partial-path writes with a Stripe-cancel-intent compensation, and (b) a `payment_intent.canceled` / `payment_intent.payment_failed` webhook hook in app-layer code that revokes promo + re-credits.
- **`apps/api/src/server.ts` is 1600+ lines.** It assembles every module's DI by hand. A per-module bootstrap split would shrink it and make onboarding sane.
- **`as never` casts in `server.ts`: 4** (down from ~80). Two are deliberate — `@nugen/auth` narrows to `Model<IAuthDocument>` for password/refreshToken/OTP field access, and widening the package would lose type safety there. The remaining two are a Mongoose `$pull` query-operator cast and a comment. All Tier-1 packages and most Tier-2 modules expose `Model<any>` at the DI boundary with eslint-disable comments documenting Mongoose `Model<T>` invariance.
- **Shallow modules**: chat-engine, whatsapp-connector, support-tickets, referral-engine, reputation-mgmt, tax-calendar, form-mapping, review-pipeline (depth-wise, not wiring-wise).
- **Mobile Stripe flow has not been verified on a real device.**
- **No unit tests in packages, no integration tests in the API.** Add a test harness before claiming coverage.

---

## Phase 0 foundation checklist (track reality)

| Item | Done |
|------|------|
| `@nugen/error-handler`, `@nugen/validator`, `@nugen/rate-limiter` | ✅ |
| `@nugen/auth`, `@nugen/rbac`, `@nugen/audit-log` | ✅ |
| Canonical DI types (`CheckPermissionFn`, `AuditLogDI`) exported and consumed | ✅ |
| `tsc --noEmit` clean in `apps/api` | ✅ |
| CI on push/PR (build + lint + typecheck + test) | ✅ — `.github/workflows/ci.yml`; lint + format are blocking gates |
| Integration tests: Pay Now, Collect Payment, webhook reconciliation | ✅ — `apps/api/__tests__/e2e/{payNow,collectPayment}Webhook.test.ts` |
| MFA enrollment/verification APIs (GAP-C07) | Partial |
| Global `mongo-sanitize` middleware (GAP-C14) | ✅ |
| Privacy Act 1988: data erasure + export workflow (GAP-C01/C02) | ✅ via `@nugen/data-lifecycle` + `privacy` module |
| Saga / compensating transactions for async flows (GAP-C03) | ✅ via `apps/api/src/lib/saga.ts` (Pay Now full-credit, Collect Payment full-credit, and admin full-refund flows wired; partial-Stripe paths still unwrapped — see "Known gaps") |
