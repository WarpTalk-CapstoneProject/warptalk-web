# Workspace Member Roles

Route: `/[workspaceSlug]/settings/member-roles`.

Only the active Workspace Owner can promote/demote active Internal `Admin|Member` targets. The page is a focused member-role surface: it does not show `CanCreateMeetings`, does not show broad governance-summary copy, and requires exact email/full-name confirmation before apply. Promotions use a server-backed preview plus a 60-second cooling-off period and final confirmation; demotions apply after review confirmation for the next request/session. Preview expiry/staleness requires reload; optimistic updates are not used. External members, Owner/self targets, and bulk changes are unsupported. Role state is written directly to `WorkspaceMember.RoleId`; the UI shows the latest operation receipt, while durable role history is outside this schema-free scope.
