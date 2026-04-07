# QEGOS — Project Rules & Modular Architecture

## Project Overview
QEGOS is a tax preparation, filing, and client management platform for the Australian market.
PRD: `QEGOS-FINAL-PRD-v4.md` (single source of truth)

## Language & Framework Requirements (MANDATORY)

**ALL code MUST be TypeScript. No plain JavaScript files (.js) anywhere in the codebase.**

| Layer | Stack | Requirements |
|-------|-------|-------------|
| Backend API | Node.js + Express + TypeScript | `.ts` files, `tsconfig.json`, strict mode, compiled to `dist/` |
| Frontend Admin | Next.js + TypeScript | App Router, server components, Ant Design |
| Frontend Web | Next.js + TypeScript | App Router, client portal |
| Mobile | React Native + TypeScript | `.tsx` files |
| Packages | TypeScript | Each package exports types via `index.ts`, has own `tsconfig.json` |

### TypeScript Rules
- `strict: true` in all tsconfig.json
- All functions must have explicit return types
- All parameters must have explicit types
- Interfaces for all models, services, configs, request/response types
- No `any` type — use `unknown` and narrow, or define proper types
- Mongoose schemas with TypeScript interfaces (`IUser`, `IOrder`, etc.)
- Express routes with typed `Request<Params, ResBody, ReqBody, Query>`
- Root `tsconfig.json` with project references for monorepo
- Each package has own `tsconfig.json` extending root

### Monorepo Build
- Root `tsconfig.json` with `composite: true` and project references
- Each package: `tsconfig.json` with `outDir: "./dist"`, `declaration: true`, `declarationMap: true`
- Package.json `main` points to `dist/index.js`, `types` points to `dist/index.d.ts`
- `npm run build` compiles all packages in dependency order

## Modular Architecture Strategy (MANDATORY)

Every module built for QEGOS MUST follow the **Nugen Shared Module Architecture**. Modules are designed to be **reusable across Nugen's product portfolio** (Nexora, SyncVault, SchemeIQ, AuditLens, and future products).

### Core Principle
> Build once, configure per-product. Every module is a self-contained package with zero product-specific logic in its core.

### Module Classification

#### Tier 1 — Shared Core (Product-Agnostic)
These modules MUST be built as standalone packages under `packages/` with zero QEGOS-specific logic:

| Package | Purpose | Reusable By |
|---------|---------|-------------|
| `@nugen/auth` | JWT, refresh rotation, OTP, MFA, session management | All products |
| `@nugen/rbac` | Role, permission, scope filtering, audit middleware | All products |
| `@nugen/audit-log` | Append-only audit logging, archival, export | All products |
| `@nugen/notification-engine` | Push, SMS, email, in-app, preference management, quiet hours | All products |
| `@nugen/payment-gateway` | Gateway abstraction (Stripe, Payzoo, etc.), idempotency, webhooks | QEGOS, Nexora, SyncVault |
| `@nugen/file-storage` | S3 upload, virus scan (ClamAV), quota, presigned URLs, dedup | All products |
| `@nugen/broadcast-engine` | Campaign, template, queue, DND/opt-out, consent, compliance | QEGOS, Nexora |
| `@nugen/chat-engine` | Socket.io conversations, messages, canned responses, file sharing | QEGOS, Nexora |
| `@nugen/support-tickets` | Ticket lifecycle, SLA engine, auto-escalation | All products |
| `@nugen/analytics-engine` | Dashboard widgets, caching, read-replica routing, export | All products |
| `@nugen/xero-connector` | OAuth 2.0, contact/invoice/payment sync, rate limiting, reconciliation | QEGOS, SyncVault |
| `@nugen/whatsapp-connector` | Meta Cloud API, template messaging, media handling, window tracking | QEGOS, Nexora |
| `@nugen/rate-limiter` | Redis-backed rate limiting, per-user/per-IP/per-endpoint | All products |
| `@nugen/error-handler` | Standardized error responses, error codes, global handler | All products |
| `@nugen/validator` | express-validator wrappers, common validators (E.164, ABN, TFN, email) | All products |

#### Tier 2 — Domain Modules (QEGOS-Specific, but Extensible)
These live under `src/modules/` and consume Tier 1 packages:

| Module | Purpose |
|--------|---------|
| `tax-engine` | Tax calculation, rule versioning, estimate logging, result import |
| `order-management` | Order lifecycle, status machine, line items, appointments |
| `lead-management` | Lead lifecycle, scoring, activity logging, conversion, reminders |
| `review-pipeline` | Preparation review, checklist, approval gates |
| `client-portal` | Document vault, tax year summary, ATO status, prefill |
| `referral-engine` | Referral codes, tracking, rewards, leaderboard |
| `tax-calendar` | Deadline management, reminder scheduling, compliance calendar |
| `reputation-mgmt` | Reviews, NPS, Google Review prompts |

### Directory Structure (Monorepo)

```
qegos/
├── CLAUDE.md                    # THIS FILE — project rules
├── QEGOS-FINAL-PRD-v4.md       # PRD (source of truth)
├── docs/                        # Generated documentation
├── packages/                    # Tier 1 — Shared reusable packages
│   ├── auth/
│   │   ├── src/
│   │   │   ├── middleware/      # JWT verify, refresh, session
│   │   │   ├── services/        # OTP, MFA, password, token rotation
│   │   │   ├── models/          # User auth fields (mixin/plugin pattern)
│   │   │   ├── routes/          # Auth API routes
│   │   │   ├── validators/      # Input validation
│   │   │   └── index.js         # Public API export
│   │   ├── package.json
│   │   └── README.md
│   ├── rbac/
│   ├── audit-log/
│   ├── notification-engine/
│   ├── payment-gateway/
│   ├── file-storage/
│   ├── broadcast-engine/
│   ├── chat-engine/
│   ├── support-tickets/
│   ├── analytics-engine/
│   ├── xero-connector/
│   ├── whatsapp-connector/
│   ├── rate-limiter/
│   ├── error-handler/
│   └── validator/
├── apps/                        # Application surfaces
│   ├── api/                     # Backend API (Express)
│   │   ├── src/
│   │   │   ├── modules/         # Tier 2 — Domain modules
│   │   │   │   ├── tax-engine/
│   │   │   │   ├── order-management/
│   │   │   │   ├── lead-management/
│   │   │   │   ├── review-pipeline/
│   │   │   │   ├── client-portal/
│   │   │   │   ├── referral-engine/
│   │   │   │   ├── tax-calendar/
│   │   │   │   └── reputation-mgmt/
│   │   │   ├── config/          # App config, env validation
│   │   │   ├── database/        # MongoDB connection, seeds
│   │   │   └── app.js           # Express app assembly
│   │   └── package.json
│   ├── admin/                   # Admin Dashboard (React)
│   ├── web/                     # Client Web App (React)
│   └── mobile/                  # Mobile App (React Native)
└── tools/                       # Build scripts, generators
```

### Module Design Rules (ENFORCED ON EVERY BUILD)

1. **Dependency Direction:** Tier 2 modules import Tier 1 packages. Tier 1 packages NEVER import from Tier 2 or from `apps/`. Tier 1 packages NEVER import from each other (except `error-handler` and `validator` which are foundational).

2. **Configuration Over Code:** Every Tier 1 package accepts a config object at initialization. Product-specific behavior is configured, not coded.
   ```js
   // Example: @nugen/auth configured for QEGOS
   const auth = require('@nugen/auth');
   auth.init({
     otpProvider: 'twilio',
     otpLength: 6,
     otpExpiry: 300,
     jwtAccessExpiry: '15m',
     jwtRefreshExpiry: '7d',
     maxSessions: 5,
     passwordPolicy: { minLength: 8, requireUppercase: true, requireNumber: true },
     phoneFormat: /^\+61\d{9}$/,  // Australian
     mfaEnabled: true,
   });
   ```

3. **Mongoose Plugin Pattern:** Shared models use Mongoose plugins/mixins, NOT full model definitions. Each product composes its User model from plugins:
   ```js
   // @nugen/auth exports a plugin
   const authPlugin = require('@nugen/auth/plugins/userAuth');
   // @nugen/rbac exports a plugin
   const rbacPlugin = require('@nugen/rbac/plugins/userRbac');

   // QEGOS User model composes them
   const userSchema = new Schema({ /* QEGOS-specific fields */ });
   userSchema.plugin(authPlugin);
   userSchema.plugin(rbacPlugin);
   ```

4. **Event-Driven Integration:** Modules communicate via events (EventEmitter or BullMQ), NOT direct function calls across module boundaries.
   ```js
   // Order module emits
   eventBus.emit('order.completed', { orderId, userId });

   // Notification engine listens (configured per product)
   // Review module listens
   // Xero connector listens
   ```

5. **Each Module Has:** `src/`, `index.js` (public API), `package.json`, `README.md`. Internal implementation is private — only the exported API is the contract.

6. **No Circular Dependencies:** If module A needs module B and B needs A, extract the shared concern into a new package or use events.

7. **Database Isolation:** Each Tier 1 package defines its own models but does NOT connect to the database. The consuming app provides the Mongoose connection.

8. **Test Isolation:** Each package has its own test suite runnable independently. Integration tests live in `apps/api/tests/`.

### Coding Standards

- **All monetary values:** Integer cents. No floating point. `Number.isInteger()` validation.
- **All dates:** UTC storage. Timezone conversion at display layer only.
- **All phone numbers:** E.164 format. Normalized on input.
- **All IDs:** MongoDB ObjectId. Human-readable IDs (QGS-O-XXXX) are secondary.
- **All secrets:** AES-256-GCM encryption at rest. Never logged.
- **All inputs:** Validated with express-validator. No raw `req.body` access.
- **All errors:** Standardized `{status, code, message, errors[]}`. No stack traces in production.
- **All mutations:** Audit logged via `@nugen/audit-log`.
- **Soft delete:** Default for all user-facing data. Hard delete by cron after grace period.

### Phase 0 Foundation Checklist
Before any domain module is built, these Tier 1 packages MUST exist:
1. `@nugen/error-handler`
2. `@nugen/validator`
3. `@nugen/rate-limiter`
4. `@nugen/auth`
5. `@nugen/rbac`
6. `@nugen/audit-log`

### Gap Analysis Findings (from Goku)
Critical items to address in Phase 0:
- Add MFA enrollment/verification APIs (GAP-C07)
- Add `mongo-sanitize` middleware globally (GAP-C14)
- Privacy Act 1988 compliance: data anonymization/erasure workflow (GAP-C01, GAP-C02)
- Saga pattern for async flows with compensating transactions (GAP-C03)
