# Billing FE Flow Test Matrix

This matrix is aligned with `D:\Warptalk\credit-billing-master-plan.md` and the current FE/API surface. Backend runtime smoke was verified directly against BillingService on `http://127.0.0.1:5107`; full gateway/browser/Stripe-CLI E2E is still blocked by the local Docker/gateway runtime.

| Actor | Flow | Route/Page | Primary API | Expected result | Actual result | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Visitor/Lead | View pricing calculator | `/` pricing section | `GET /plans` | Enterprise baseline is shown as reference only; landing estimate is not a final contract price. | FE build, route smoke, and billing-flow contract pass. | Pass |
| Visitor/Lead | Select volume, features, languages | `/` pricing section | none | Landing can show active plans from BillingService. It must not claim a final contract calculator if no submitted intent is wired on the page. | Static source contract confirms landing loads plans from `billingService.getPlans`; submitted landing inquiry wiring is not present in current source. | Partial Pass |
| Visitor/Lead | Submit Request pricing | `/` contact form | `POST /sales-inquiries` | Creates a real sales inquiry with consent, structured estimate, features, languages, company, and email. | Backend/API smoke evidence exists, but the current landing page source does not wire a public submit form to `billingService.createSalesInquiry`. | Blocked |
| Visitor/Lead | Preserve intent for signup | `/` | `sessionStorage warptalk:sales-package-intent` | Workspace create can prefill from the latest pricing/sales intent; DB remains admin source of truth. | Workspace create reads `warptalk:sales-package-intent`; landing/register source does not currently prove this handoff. | Partial Pass |
| Registering User | Register from pricing intent | `/register` | auth register APIs | Registration should preserve navigation into workspace creation; pricing intent handling belongs to workspace create in current source. | Register route handles auth only; no pricing intent read is present in current source. | Partial Pass |
| Registering User | Create workspace after pricing intent | `/workspace/create` | workspace create API, `POST /subscriptions/trial` | Workspace creation attempts Enterprise trial with owner email from sales intent or account email. | FE integration exists; workspace/trial API not runtime-verified because backend ports are closed. | Blocked |
| Workspace Owner/Admin | Open workspace billing dashboard | `/{workspaceSlug}/billing` | `GET /subscriptions/workspace/{id}`, `GET /credits/workspace/{id}`, `GET /usages/workspace/{id}/report`, `GET /invoices/workspace/{id}` | Shows trial/contract state, service state, credits, usage, and recent invoices. | Route exists for authenticated user in route smoke; data loading not runtime-verified because gateway timeout. | Blocked |
| Workspace Owner/Admin | Start Enterprise trial | `/{workspaceSlug}/billing` | `POST /subscriptions/trial` | Trial starts only for eligible workspace and refreshes subscription, balance, invoices. Trial duration/credits are backend policy, not a hardcoded FE claim. | FE action and backend tests for trial entity pass; runtime API not verified. | Blocked |
| Workspace Owner/Admin | Pay online open invoice | `/{workspaceSlug}/billing` | `POST /invoices/{id}/checkout` | Open invoice redirects to Stripe checkout URL. | Direct BillingService mock checkout returned `200` with `/workspace/payment/success?session_id=mock_session_...` after widening local provider id storage. Real Stripe checkout still requires `sk_test_...` + Stripe CLI + gateway. | Partial Pass |
| Workspace Owner/Admin | Verify payment success | `/workspace/payment/success?session_id=...` | `GET /payments/checkout-session/{sessionId}` | Page verifies checkout session; if verification is pending it displays pending state instead of assuming paid. | Direct BillingService mock session verification returned `200`; invoice/payment became `paid`; second verify stayed idempotent with one payment row. Real `cs_test_...` path still blocked by Stripe CLI/gateway. | Partial Pass |
| Workspace Owner/Admin | Cancel payment | `/payment-cancelled` | none | User returns to billing or contacts billing; invoice remains unpaid. | Public route smoke pass. | Pass |
| Workspace Member | Billing admin restriction | `/{workspaceSlug}/billing` | workspace/session APIs | Non Owner/Admin sees restricted billing message and no admin billing actions. | FE restriction state exists; actor-specific runtime role check not verified because auth/backend unavailable. | Blocked |
| Workspace Member | Read-only credit summary | `/{workspaceSlug}/dashboard` | `GET /credits/workspace/{id}` | Dashboard can show credit summary without exposing billing management actions. | FE read-only credit summary wiring exists; data runtime blocked. | Blocked |
| System Admin | Global billing overview | `/billing` | `GET /usages/metrics/global`, `GET /credits/history/global`, `GET /subscriptions/global`, `GET /invoices/global` | Admin sees global metrics/history/subscriptions/invoices and can drill into workspace contracts. | Route exists; direct invoice workspace list passed after DB alignment. Full global dashboard browser/API sweep remains blocked by gateway runtime. | Partial Pass |
| System Admin | Sales inquiries list | `/billing` Sales inquiries tab | `GET /sales-inquiries` | Admin sees landing pricing demand with company, contact, volume, languages, features, estimate, notes. | Direct BillingService admin JWT smoke returned `200` and listed the inserted inquiry; no token returned `401`. | Pass |
| System Admin | Sales inquiry status | `/billing` Sales inquiries tab | `PATCH /sales-inquiries/{id}/status` | Admin can mark `quoted`, `closed`, or another supported status. | Direct BillingService smoke marked inquiry `quoted` with `200`. | Pass |
| System Admin | Link inquiry to workspace | `/billing` Sales inquiries tab | `PATCH /sales-inquiries/{id}/workspace` | Inquiry attaches to an existing workspace without changing contract terms. | Direct BillingService smoke linked the inquiry to workspace UUID with `200`. | Pass |
| System Admin | Convert inquiry to contract | `/billing` Sales inquiries tab | `POST /sales-inquiries/{id}/convert-to-contract` | Creates or updates Enterprise workspace subscription with negotiated terms and billing contact. | Direct BillingService smoke converted inquiry and created subscription with 700000 credits, 1,900,000 VND contract, 105000 overage cap, billing contact email, `healthy` service state. | Pass |
| System Admin | Edit Enterprise baseline | `/billing/plans` | `PUT /plans/{id}` | Updates Enterprise template only; workspace-specific contract overrides stay on subscriptions. | FE action exists and route smoke pass; API runtime blocked. | Blocked |
| System Admin | Edit pricing config | `/billing/plans`, `/billing/workspace/{id}` | `GET/PUT /usages/pricing-config` | `fx_rate_usd_vnd` and `credit_value_vnd` load from and save to DB. | Direct BillingService admin JWT smoke returned DB values `26300` and `4` plus formula/resolver key. PUT not mutated in smoke. | Partial Pass |
| System Admin | Edit service rate card | `/billing/plans`, `/billing/workspace/{id}` | `GET/PUT /usages/rate-card` | Admin changes provider cost, markup, active state; identity keys stay fixed to registered backend billing events. | Direct BillingService admin JWT smoke returned 13 active rate-card rows; FE contract and backend identity tests pass. PUT not mutated in smoke. | Partial Pass |
| System Admin | Save workspace contract terms | `/billing/workspace/{id}` | `PUT /subscriptions/workspace/{id}/contract-terms` | Saves credits/cycle, contract price, overage cap/price, invoice terms, billing contact on subscription. | Verified through convert inquiry to contract: terms persisted on `subscription.subscriptions`. Dedicated PUT endpoint not separately mutated. | Partial Pass |
| System Admin | Manual credit adjustment | `/billing/workspace/{id}` | `POST /credits/adjust` | Admin records adjustment with reason and refreshes balance/history. | FE action/API client exist; API runtime blocked. | Blocked |
| System Admin | Resume subscription | `/billing` Contracts tab | `POST /subscriptions/workspace/{id}/resume` | Service state resumes after admin reason/payment resolution. | FE action exists in contracts tab; backend route exists; API runtime blocked. | Blocked |
| System Admin | Admin/manual cycle close | `/billing/workspace/{id}` | `POST /subscriptions/workspace/{id}/simulate-cycle-close` | Creates open NET invoice for demo and finance reconciliation; do not present this button as fully automatic billing. Does not run trial invoices. | Direct BillingService smoke returned `200` and created an `open` invoice with subtotal 1,900,000 VND, tax 190,000 VND, due date +15 days. Required DB migration alignment for legacy invoice columns. | Pass |
| System Admin | Mark invoice paid | `/billing/workspace/{id}` | `POST /invoices/{id}/mark-paid` | Records payment only after finance confirms settlement. | Direct BillingService smoke returned `200`; invoice and payment moved to `paid`. | Pass |

## Runtime Cases To Fill

| Case | Required setup | Expected result | Status |
| --- | --- | --- | --- |
| Stripe happy path | `sk_test_...`, Stripe CLI `whsec_...`, frontend `localhost:3000`, gateway `localhost:5200` | Checkout with `4242 4242 4242 4242` returns success, invoice becomes paid, one payment row exists for `cs_test_...`. | Blocked for real Stripe: Docker/gateway unhealthy and no Stripe CLI listener. Mock fallback direct to BillingService passed with `mock_session_...`. |
| Stripe cancel | Same as above | Cancel returns `/payment-cancelled`; invoice remains open/pending. | Browser route smoke passed; real Stripe cancel blocked by gateway/Stripe CLI. |
| Duplicate webhook | Stripe CLI replay or backend test | Duplicate event does not create duplicate payment or invoice settlement. | Mock checkout-session verification repeated with one payment row; real webhook replay blocked by Stripe CLI/gateway. |
| Invalid webhook secret | Stripe CLI or direct signed request test | Webhook rejects invalid signature; invoice is not marked paid by webhook. | Gateway webhook path fixed to `/api/v1/payments/webhook/stripe`; real runtime signature test blocked by gateway/Stripe CLI. |
| Realtime speaker billing | Live meeting audio with real speaker | Accumulator charges STT once and translation/TTS per target language; full verification needs actual media events. | Manual-only |

## Latest Evidence

- `npm run typecheck`: pass.
- `npm run build`: pass.
- `npm run test:contracts`: pass, including `test:billing-flows`.
- `npm run test:routes`: pass on `http://localhost:3000`.
- `dotnet test billing/tests/WarpTalk.BillingService.Tests/WarpTalk.BillingService.Tests.csproj --no-restore`: pass, 127 tests.
- `dotnet test gateway/tests/WarpTalk.Gateway.Tests/WarpTalk.Gateway.Tests.csproj --no-restore`: pass, 48 tests.
- `dotnet build gateway/src/WarpTalk.Gateway/WarpTalk.Gateway.csproj --no-restore`: pass.
- `http://localhost:3000`: HTTP 200.
- `http://127.0.0.1:5107/health`: HTTP 200 direct BillingService.
- Direct BillingService API smoke: sales inquiry create/duplicate/validation, admin inquiry list/status/link/convert, pricing config read, rate card read, admin/manual cycle close, invoice checkout mock, checkout-session verification, repeated verification idempotency.
- `http://localhost:5200/health`: blocked by Docker/gateway runtime.
- Redis `6379`: unavailable locally; BillingService now degrades realtime notification subscriber instead of crashing.

## Automation

Run:

```powershell
npm run test:billing-flows
```

The script checks the FE actor-flow surface, public/admin billing APIs wired in `billingService`, and master-MD alignment guards that forbid legacy direct credit consume/top-up and masked billing API fallbacks.
