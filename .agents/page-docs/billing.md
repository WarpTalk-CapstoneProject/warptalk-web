# Billing

Billing pages show workspace and admin credit balances, usage, invoices, and transaction history. The export actions generate `.xlsx` reports from the currently loaded transaction data.

## Current Behavior

- Workspace billing exports a wallet statement from the workspace transaction history.
- Admin billing exports a global billing report with a summary sheet and audit trail.
- Admin workspace billing exports wallet transactions for the selected workspace.
- Export UI, dialog flow, generated workbook styles, and file names are unchanged.
- Usage-type names on screen come from `src/lib/billing/usage-labels.ts` (`usageTypeLabel` short form, `usageTypeDetailLabel` long form). Do not re-copy that mapping into a page: the same server constant was spelled out in three files, so a new usage type meant three edits and typically got one.

## Credit Top-Up (`/[workspaceSlug]/payment/plans`)

- **Buying credit is switched off (`TOP_UP_ENABLED = false`), and the panel says so.** The button posted `paymentType: "CreditTopUp"`, which is not one of the backend's payment types, so no handler matched, the credit grant was skipped in silence, and the request still wrote a payment record and issued an invoice. The customer paid, saw an invoice, and their balance never moved. It stays off until a handler exists.
- The disabled state renders an explicit amber notice, not a spinner or a greyed button — someone who came to buy credit needs to know it will not arrive, rather than guessing they clicked wrong.
- **One rate, no volume discount.** `DOCUMENTED_VND_PER_CREDIT = 4`, from `docs/credit-economics.md` §4.2; the backend agrees (`CreditValueVnd = 4m`). The old UI quoted a 10 / 9 / 8.5 / 8 VND ladder with 0–20% "discounts", overcharging by 2–2.5× against a ladder that does not exist. Do not reintroduce tier cards.
- The 4 VND figure is display-only. It is an admin-editable parameter in `billing_pricing_config`, so once the handler exists this panel must READ the configured value rather than carry its own copy — even a copy that happens to be right today.
- **Known inconsistency:** the minimum-amount hint still reads "1,500 credits, equivalent to the 15,000 VND Stripe transaction limit". At 4 VND/credit, 1,500 credits is 6,000 VND, and 15,000 VND is 3,750 credits. Whichever number is the real constraint needs deciding when top-up is re-enabled.

## Performance Notes

- Excel workbook generation is intentionally lazy-loaded through `createExcelWorkbook()`.
- Keep `exceljs` out of top-level client page imports. It is a large dependency and should only be downloaded when a user confirms an Excel export.

## Files Affected

- `src/app/(app)/[workspaceSlug]/billing/page.tsx`
- `src/app/(internal)/billing/page.tsx`
- `src/app/(internal)/billing/workspace/[id]/page.tsx`
- `src/lib/export/create-excel-workbook.ts`

## Testing Checklist

- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm run build`.
- Confirm export buttons still generate `.xlsx` files with the same report contents.
