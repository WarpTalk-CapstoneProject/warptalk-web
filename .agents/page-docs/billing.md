# Billing

Billing pages show workspace and admin credit balances, usage, invoices, and transaction history. The export actions generate `.xlsx` reports from the currently loaded transaction data.

## Current Behavior

- Workspace billing exports a wallet statement from the workspace transaction history.
- Admin billing exports a global billing report with a summary sheet and audit trail.
- Admin workspace billing exports wallet transactions for the selected workspace.
- Export UI, dialog flow, generated workbook styles, and file names are unchanged.

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
