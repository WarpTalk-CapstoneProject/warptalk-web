# Workspace Members

The Members page provides a directory to active internal members. Internal Members are read-only and do not receive management actions. Owners/Admins may use operational actions allowed by backend policy; Admins invite only Member. External members remain `Member · External · Fixed` and cannot be promoted or assigned another role. `CanCreateMeetings` is a separate permission and is never changed by a role mutation.

Role governance is linked to the Owner-only Access Management page; no inline role dropdown or bulk role change is rendered.

## Performance Notes

- The members `.xlsx` export keeps the same generated workbook format, but `exceljs` is loaded only when the export action runs.
- Do not add a top-level `import ExcelJS from "exceljs"` to this page; use `createExcelWorkbook()` so the member directory first load stays light.

## Files Affected

- `src/app/(app)/[workspaceSlug]/members/page.tsx`
- `src/lib/export/create-excel-workbook.ts`
