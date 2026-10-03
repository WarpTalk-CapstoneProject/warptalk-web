# Workspace Member Roles

Route: `/[workspaceSlug]/settings/member-roles`.

Only the active Workspace Owner can promote/demote active Internal `Admin|Member` targets. The page is a focused member-role surface: it does not show `CanCreateMeetings`, does not show broad governance-summary copy, and requires exact email/full-name confirmation before apply. Promotions use a server-backed preview plus a 60-second cooling-off period and final confirmation; demotions apply after review confirmation for the next request/session. Preview expiry/staleness requires reload; optimistic updates are not used. External members, Owner/self targets, and bulk changes are unsupported. Role state is written directly to `WorkspaceMember.RoleId`; the UI shows the latest operation receipt, while durable role history is outside this schema-free scope.

## WarpBot starters (2026-10-03)

The page registers WarpBot page context `workspace_member_roles`
(`memberRolesAssistantSnapshot`) for the Owner once the member list has loaded: how many owners,
admins, internal and external members there are, and how many could change role. Counts only —
nobody on the list is named to WarpBot, which is why all three starters ask "How many…". The page
reads the first 100 members; when the server's total is larger the snapshot says its counts are a
floor. It is a page context, not a tool. See `workspace-insights.md` ("WarpBot answers from the page") for the shared rules; the builders and their tests are `lib/workspace/settings-assistant-snapshots.ts` and `lib/workspace/__tests__/settings-assistant-snapshots.test.ts`.
