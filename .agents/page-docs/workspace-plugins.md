# Plugins — the personal page and the workspace owner page

## Purpose

WarpTalk's plugin marketplace has three tiers, decided by the owner on 2026-09-17:

1. A **system admin** curates what exists, at `/admin/plugins`.
2. A **workspace Owner** decides which of those the workspace has, and can add a **private MCP
   server** only this workspace sees. That is `/[workspaceSlug]/settings/plugins`
   (`src/components/assistant/plugins/workspace-plugins-page.tsx`).
3. A **member** connects what the workspace has, with their own account, and asks the Owner for
   anything else. That is `/settings/plugins`
   (`src/components/assistant/plugins/plugins-page.tsx`).

The two pages share a vocabulary on purpose — same header shape, same hairline section heads, same
two-column rows, same centred dialog — so they read as two views of one catalog.

## How the pages currently work

### Who may see and who may act

Owner **and** Admin can open the workspace page; only the Owner can change it. The server answers
both from the workspace service, and `canManage` on the overview response is its answer.
`canManageWorkspacePlugins(overview, role)` (`src/lib/assistant/plugin-availability.ts`) is the one
place that reads it: the server's boolean wins whenever it is sent, and an older response with no
`canManage` falls back to the role, where only `owner` reads as yes.

An Admin therefore gets the same page with every action removed — no Add menu, no Approve/Decline,
`View` instead of `Manage` — **and no sidebar badge**. `pendingRequestBadge(overview, canAct)` is
gated on the same helper, because a count an Admin cannot clear is a notification that never goes
away.

### The member's row

`memberPluginAction(plugin, workspaceName, t)` decides one of four actions from the catalog row:

- `connect` — the workspace has it, or the member already installed it. An installed row the
  workspace has *not* added stays `connect` on purpose: its dialog is where Disconnect and Remove
  live, and a member holding a live OAuth grant must be able to revoke it whatever the workspace
  decided.
- `add` — the Owner's version of `request`. Asking yourself for a plugin files a request nobody is
  told about. It needs the server to say so, via `canAdd` on the catalog row.
- `requested` / `request` — everyone else.

### Chat only offers what the workspace has

`isOfferedInWorkspaceChat(plugin)` filters the WarpBot plugin menu and, through it, the @mention
list (`src/components/layout/global-chatbot.tsx`). A plugin the workspace has not added cannot run
there — the server refuses its tools — so its switch would do nothing and its mention would go
nowhere. Past messages still resolve their chips against the whole catalog.

### Failures say what the server said

`pluginErrorMessage(error, fallback)` (`src/lib/assistant/plugin-errors.ts`) reads the plain-text
body first and only then falls back to `getErrorMessage`. This matters because several plugin
endpoints answer `Conflict("…")` and friends as `text/plain`, which `getErrorMessage` does not
read — a 409 showed the caller's generic sentence and a 503 showed "Too many requests", the
opposite of what the server said. Both pages report through it.

## Backend contract (warptalk-backend PR #436, fixed)

The pages read exactly these names; renaming one here without the server is a silent breakage,
because every field is optional in the DTO and an absent one simply reads as "older server".

| Where | Field |
| --- | --- |
| catalog row (`GET /assistant/plugins`) | `canAdd` |
| workspace overview | `canManage` |
| workspace plugin item | `authMode`, `addedByName` |
| private plugin create / update body | `authMode` |

Three refusals are worded by the server and shown verbatim through `pluginErrorMessage`, so there
is deliberately **no client-side copy** for them:

- `plugin_request_by_owner` — the Owner filed a request instead of adding.
- `workspace_plugin_list_changed` (409) — the list moved under the page since it loaded.
- `workspace_plugin_policy_unavailable` (503) — the workspace's policy could not be read just now.

## Important UI behaviour

- **The transition note.** A workspace that never touched this list is still judged by its old
  "Allow personal plugins" switch: on, every marketplace plugin reads as added; off, none does.
  `workspacePluginsTransitionNote` picks which sentence is true from the rows themselves. Claiming
  "every marketplace plugin is available" for a workspace whose switch was *off* told the Owner the
  opposite of what members saw, so that wording is contract-tested against being hardcoded.
- **The empty page still lists the Marketplace.** The empty state's menu is one way in; a list of
  what can be added is the other. Hiding it left an Owner with nothing added nothing to look at.
- **The Manage dialog counts usage, never connections.** A connection is personal and the server
  has no per-workspace count, so "N of M connected" would be a number the page invented.
  `workspacePluginFacts` renders `membersUsedCount` plus who added it, and the contract test fails
  on any "… members connected" phrasing.
- **Names resolve past the first hundred members.** `useWorkspaceMemberNames` pages through the
  member list until every id is found (`collectMemberNames`). The page used to read one page of
  100, so every request from member 101 on read "A member asked for…".
- **`authMode` on edit is sent only when it changed** (`privatePluginUpdateRequest`). Switching how
  members connect can leave their existing connections unusable, so renaming a plugin must never do
  it by accident.

## Localization (WT-607)

Both pages are fully on `next-intl`.

- The member page reads the `pluginsPage` namespace.
- The workspace owner page reads **`workspacePlugins`**, added to `NAMESPACES` in
  `src/i18n/request.ts` with catalogs at `messages/{en,vi,ja}/workspacePlugins.json`.

Helpers in `src/lib/assistant/plugin-availability.ts` cannot call `useTranslations` — the file is
exercised by plain `node --test` and its imports are type-only and relative by contract. They take
the **optional-translator parameter** the repo already uses elsewhere, defaulted to the English
they returned before i18n: `memberPluginAction`, `workspacePluginsTransitionNote`,
`describeMembersUsed`, `workspacePluginFacts`, `workspacePluginSubtitle` and
`validatePrivatePluginDraft`. Callers pass a translator already scoped to a group — the owner page
hands `workspacePluginFacts` a function that prefixes every key with `facts.` before calling `t`.
This keeps the node tests asserting real wording instead of key paths.

Two spots needed more than a string swap:

- `AUTH_CHOICES` used to be a module-scope constant holding English titles. A constant evaluated at
  import time cannot follow a locale switch, so it now holds key names and the wording is read at
  render.
- "3 hours ago" on a request row formats through `dateFnsCalendarLocale`
  (`src/lib/meeting/calendar-locale.ts`), the same mapping the schedule pages use. It was pinned to
  English before, regardless of the reader's locale.

`scripts/check-plugin-marketplace-contract.mjs` used to assert the approved mock's wording against
the page *source*. Once the wording moved into the catalog those assertions could no longer fail,
so each is split in two — the page still names the key, and `messages/en/workspacePlugins.json`
still carries the original English at it. That is the general repair pattern; see
`.agents/page-docs/i18n-localization.md`.

## Known limitations

- **No in-browser verification.** `src/proxy.ts` gates every `(app)/[workspaceSlug]/*` route behind
  an `HttpOnly` access-token cookie that cannot be set from a script, and the local gateway was not
  running. Nothing on either page has been seen rendered in `vi`/`ja`.
- **CJK layout is unchecked on this page.** The Japanese strings for the auth-mode cards and the
  transition note are noticeably longer than the English they replaced, and those live in a
  two-column grid and a one-line note. Worth a look the first time a backend is available.
- `membersUsedCount` is usage, not adoption — a plugin nobody has used yet reads "Not used by any
  member yet" even when every member connected it.
- The three server-worded error codes are shown verbatim, so they arrive in whatever language the
  backend speaks, not the reader's UI locale.

## Testing checklist

- [x] `npx tsc --noEmit -p .` — clean, 0 errors.
- [x] `npm run test:plugin-marketplace`, `test:plugin-availability` (34 subtests),
      `test:plugin-activity`, `test:plugin-connection`, `test:plugin-tool-policy`,
      `test:plugin-confirmation`, `test:plugin-connection-action`, `test:plugin-mention`,
      `test:plugin-card-lifecycle`, `test:plugin-governance-settings`,
      `test:admin-plugin-catalog` — all pass.
- [x] `npm run test:warpbot-widget`, `test:warpbot-parity`, `test:warpbot-handoff` — pass.
- [x] `npm run test:i18n-catalog` (94 subtests, including the new `workspacePlugins` namespace in
      vi and ja), `test:english-ui`, `test:scripts-wired` — pass.
- [ ] Manual, needs a running backend: the Owner page in `vi` and `ja`; the Add-plugin menu, the
      With MCP dialog's auth-mode cards, and the Manage dialog's confirm sentence.
- [ ] Manual: an Admin opening the page sees no actions and no sidebar badge.
- [ ] Manual: a 409 `workspace_plugin_list_changed` surfaces the server's own sentence, not the
      "Could not add {label}." fallback.

## Notes for future maintainers

- Adding a string to the owner page means adding it to **all three** catalogs;
  `npm run test:i18n-catalog` fails loudly otherwise.
- Before changing wording the contract script pins, change it in `messages/en/workspacePlugins.json`
  and in the script together — the script asserts the English, deliberately.
- Do not give `plugin-availability.ts` a value import or a hook. Its `node --test` contract depends
  on the file being resolvable without a bundler.

## Files Affected

- `src/components/assistant/plugins/workspace-plugins-page.tsx`
- `src/components/assistant/plugins/plugins-page.tsx`
- `src/lib/assistant/plugin-availability.ts`, `src/lib/assistant/plugin-errors.ts`
- `src/hooks/use-workspace-plugins.ts`
- `src/components/layout/linear-sidebar.tsx`, `src/components/layout/global-chatbot.tsx`
- `src/types/assistant.ts`
- `src/i18n/request.ts`, `messages/{en,vi,ja}/workspacePlugins.json`,
  `messages/{en,vi,ja}/pluginsPage.json`
- `scripts/check-plugin-marketplace-contract.mjs`
