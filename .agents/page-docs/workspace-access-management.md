# Workspace Access Management

Route: `/[workspaceSlug]/settings/access-management`.

Only the active Workspace Owner can promote/demote active Internal `Admin|Member` targets. The page shows a permission-impact preview, preserves `CanCreateMeetings`, requires exact email/full-name confirmation, applies demotions to the next request/session, and applies promotions only after a 60-second cooling-off and final confirmation. Preview expiry/staleness requires reload; optimistic updates are not used. External members, Owner/self targets and bulk changes are unsupported. Role state is written directly to `WorkspaceMember.RoleId`; the UI shows the latest operation receipt, while durable role history is outside this schema-free scope.
