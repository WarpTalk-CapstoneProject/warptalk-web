# WarpBot tools — `/{workspaceSlug}/tools`

## Purpose

One page that answers "what can WarpBot do here, and how do I ask?" for every workspace member.
Sidebar label is **Tools** (the sidebar row ships in a separate PR); the page title is
**WarpBot tools**. The WarpBot widget's Tools menu links here ("Explore" and, when the page you are
on has no slash commands, "Browse WarpBot tools").

Redesigned 2026-10-01 from the approved artifact "Trang WarpBot Tools". The version from #614 was a
copy of Claude's "Customize" screen — Skills/Connectors/Plugins tabs, Yours/Discover/Admin Only
pills that filtered nothing real, an "Add" button that only linked away, a copy button per prompt,
~42 hard-coded hex colours (always dark), and a catalog of 14 tools that missed four of the five
write tools. All of that is gone.

## Files

| File | Role |
| --- | --- |
| `src/app/(app)/[workspaceSlug]/tools/page.tsx` | Thin route; renders `WarpBotToolsPage`. |
| `src/components/assistant/tools/warpbot-tools-page.tsx` | The page. |
| `src/lib/assistant/warpbot-tools-catalog.ts` | Static built-in catalog (18 tools) + filter helpers. |
| `src/lib/assistant/warpbot-plugin-tools.ts` | `pluginToolsOfferedToWarpBot(plugins)` — which plugin tools WarpBot is offered. |
| `src/lib/assistant/__tests__/warpbot-tools-catalog.test.ts` | `npm run test:warpbot-tools-catalog`. |
| `messages/{en,vi,ja}/warpbotTools.json` | Page chrome strings (namespace registered in `src/i18n/request.ts`). |
| `messages/{en,vi,ja}/common.json` | `chatbot.exploreTools`, `chatbot.browseAllTools` (widget links). |

## How the page works

Page chrome from `src/components/workspace/page-chrome.tsx`: `WorkspaceToolbar` (title + subtitle on
the left, search on the right), `WorkspaceBody`, three `WorkspaceSection` cards. App tokens only
(`text-ink*`, `bg-surface-*`, `border-border`, `text-warning`), so light and dark both work. No tabs.

The search box filters all three sections (case- and Vietnamese-diacritic-insensitive).

### 1. Built in

- Category chips: All, Meetings, Knowledge, Documents, Glossary, Translation, Workspace,
  Conversation — plus **Platform** for platform staff only.
- Row = icon, human name (e.g. "Create meeting room"), code id in small mono muted text, one-line
  description. The 5 write tools (`create_meeting`, `create_action_item`, `create_glossary`,
  `add_glossary_term`, `share_meeting_minutes`) carry a **Changes data** badge.
- The row header is a `<button aria-expanded aria-controls>`; expanding shows the longer
  description, a "Meeting host only" note for `share_meeting_minutes`, and sample prompts each with
  **Try in WarpBot** (`useAssistantWidgetStore().askWarpBot(prompt)`, which opens the widget with
  the prompt loaded).
- `get_platform_analytics` is shown **only** to platform staff, decided exactly as the `/admin`
  portal's layout decides it: `useIsSystemAdmin()` (`auth.roles` contains `admin`, the token hint
  the tool itself requires) **and** `useStaffAccess().access.isStaff` (`GET /auth/staff-access`,
  G10). While that answer is loading the tool and the Platform chip stay hidden, so they never
  flash for a non-staff viewer. Everyone else does not see them at all.

### 2. Web search

OpenAI's hosted `web_search` is offered only when the deploy switch
`ASSISTANT_CHAT_WEB_SEARCH_ENABLED` **and** the platform flag `flags.warpbot_web_search` (per
workspace) are both on — read by the AI worker per turn (`chat_worker.py::_web_search_enabled`).
The web app has **no** way to read either for a workspace member (the only public platform endpoint,
`usePlatformStatus`, carries maintenance/support/google-sign-in only; the flags API is staff-only and
still would not know the deploy switch). So the row never claims On or Off: it shows the neutral
note "Available when your workspace allows it", and no Try button.

When a backend field for this exists, add an On/Off badge (and the reason when Off) and show Try
only when On.

### 3. From your plugins

`useAssistantPlugins(activeWorkspaceId)` → `pluginToolsOfferedToWarpBot`. A plugin is listed only
when it is installed, connected with all required scopes granted, offered in this workspace
(`isOfferedInWorkspaceChat`, i.e. not `not_added`/`platform_disabled`) and not refused by
`workspacePolicyBlockReason`. Tools the member set to **Blocked** (WT-687, `toolPolicyOf`) are left
out; a plugin with no remaining tool is left out. Write tools get the Changes data badge; tools on
"approval" show "Asks you first". The provider account email is deliberately not shown.

Empty state links to `/settings/plugins` (the member's My connections). Owner/Admin also get
**Manage plugins →** to `/{slug}/settings/plugins`. Loading = skeletons; error = message + Retry.

## Known limitations

- Built-in catalog is static and hand-mirrored from warptalk-ai `ai_assistant_worker/chat_tools.py`
  `TOOLS`. It will be replaced by `GET /api/v1/assistant/tools` (worker manifest → Redis →
  AssistantService); the row shape `{ name, displayName, category, effect, audience, description,
  details, samplePrompts }` already matches that plan. The test pins the 18 names.
- Tool names/descriptions/prompts are English (as `assistant-tool-labels.ts`); only chrome is
  translated.
- Web search state is unknown on the client (see above).
- `continue_in_widget` (meeting-chat handoff) is not listed: it is an internal handoff tool offered
  only from meeting chat.

## Testing checklist

- `npm run -s test:warpbot-tools-catalog` — 18 names exactly, 5 write tools, audiences, platform
  visibility, filters, plugin offering rules (blocked / not connected / missing scope / not added /
  platform-disabled / policy-blocked).
- `npm run -s test:i18n-catalog`, `test:english-ui`, `test:page-ground`, `test:page-placeholders`,
  `test:warpbot-widget`, `test:plugin-surfaces`, `test:warpbot-parity`.
- Manual: member sees 17 tools and no Platform chip; platform staff (admin role + staff access) sees 18 + Platform; expand a row
  with keyboard (Tab, Enter/Space), Try opens the widget with the prompt; connect a plugin and block
  one of its tools — it disappears from the page; light and dark theme.
