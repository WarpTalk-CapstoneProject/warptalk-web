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
| `src/lib/assistant/warpbot-tools-catalog.ts` | Presentation copy keyed by tool name (`WARPBOT_TOOL_COPY`), category ids/order, `builtInToolsFromManifest`, filter helpers. NOT the list of what exists. |
| `src/hooks/use-assistant.ts` | `useWarpBotTools(workspaceId)` (key `ASSISTANT_KEYS.warpBotTools`, under the plugins root so plugin writes invalidate it). |
| `src/services/assistant.service.ts` | `getWarpBotTools(workspaceId)` → `API.assistant.tools`. |
| `src/types/assistant.ts` | `WarpBotToolsDto` and its parts (the wave-3 contract). |
| `src/lib/assistant/__tests__/warpbot-tools-catalog.test.ts` | `npm run test:warpbot-tools-catalog`. |
| `messages/{en,vi,ja}/warpbotTools.json` | Page chrome strings (namespace registered in `src/i18n/request.ts`). |
| `messages/{en,vi,ja}/common.json` | `chatbot.exploreTools`, `chatbot.browseAllTools` (widget links). |

## Data source

One read: `GET /api/v1/assistant/tools?workspaceId=` (AssistantService; any workspace member, 403
otherwise). The AI worker publishes its real tool registry to Redis (`assistant:tools:manifest`,
refreshed every 10 min, 30 min TTL); AssistantService serves it and adds web search state and the
plugin tools the orchestrator would offer WarpBot right now.

```
{ manifestAvailable, manifestGeneratedAt, builtIn: [{ name, category, effect, audience, description }],
  webSearch: { state: "on" | "off" | "unavailable" | "unknown" },
  plugins: [{ pluginKey, label, tools: [{ name, label, description, effect, policy, workspacePolicy }] }] }
```

The server decides visibility: `platform_staff` tools are only in `builtIn` for platform staff,
and blocked plugin tools / unconnected plugins are never in `plugins`. The page has **no**
client-side staff check and no client-side plugin filtering.

States: loading = skeletons in all three sections; error = message + Retry (built-in and plugins
sections); `manifestAvailable: false` = a small "Tool list unavailable right now" notice in Built in
(never the static copy as if it were the list) and web search shows the neutral note.

## How the page works

Page chrome from `src/components/workspace/page-chrome.tsx`: `WorkspaceToolbar` (title + subtitle on
the left, search on the right), `WorkspaceBody`, three `WorkspaceSection` cards. App tokens only
(`text-ink*`, `bg-surface-*`, `border-border`, `text-warning`), so light and dark both work. No tabs.

The search box filters all three sections (case- and Vietnamese-diacritic-insensitive).

### 1. Built in

- Rows = `builtIn`, in the server's order, dressed by `builtInToolsFromManifest`: display name,
  one-line description, details and sample prompts from `WARPBOT_TOOL_COPY` keyed by `name`. A tool
  without copy is still listed: humanised name + the manifest description, no prompts. Unknown
  category ids show under **Other**.
- Category chips: All, then only categories that have a listed tool (Meetings, Knowledge, Documents,
  Glossary, Translation, Workspace, Conversation, Platform, Other) — so Platform appears only when
  the server sent a platform tool.
- Row = icon, human name (e.g. "Create meeting room"), code id in small mono muted text, one-line
  description. The 5 write tools (`create_meeting`, `create_action_item`, `create_glossary`,
  `add_glossary_term`, `share_meeting_minutes`) carry a **Changes data** badge.
- The row header is a `<button aria-expanded aria-controls>`; expanding shows the longer
  description, a "Meeting host only" note for `share_meeting_minutes`, and sample prompts each with
  **Try in WarpBot** (`useAssistantWidgetStore().askWarpBot(prompt)`, which opens the widget with
  the prompt loaded).
- `get_platform_analytics` (`audience: platform_staff`) appears only when the server includes it;
  its expanded row says "Visible to WarpTalk platform staff only".

### 2. Web search

`webSearch.state`: **On** (worker has a provider key and its deploy switch on, AND platform flag
`flags.warpbot_web_search` on) — badge + a Try prompt; **Off** (a setting turns it off);
**Unavailable** (the worker has no web search configured); `unknown` (no manifest or the read
failed) — no badge, the neutral note "Available when your workspace allows it".

### 3. From your plugins

Rendered from `plugins`: exactly the plugin tools WarpBot is offered right now for this member in
this workspace (the backend reuses McpToolOrchestrator's list path: connected installations with
scopes, effective-blocked tools excluded), grouped by plugin. Write tools get the Changes data badge;
a tool whose effective policy (stricter of the member's `policy` and the workspace's
`workspacePolicy`) is "approval" shows "Asks you first". `useAssistantPlugins` is still read, only
for each plugin's `avatarUrl` (icon). The provider account email is deliberately not shown.

Empty state links to `/settings/plugins` (the member's My connections). Owner/Admin also get
**Manage plugins →** to `/{slug}/settings/plugins`. Loading = skeletons; error = message + Retry.

## Known limitations

- Copy (names/descriptions/prompts) is English (as `assistant-tool-labels.ts`); only chrome is
  translated. A new worker tool shows humanised until copy is added to `WARPBOT_TOOL_COPY`.
- If the worker has been down for 30+ minutes the manifest expires and Built in shows the
  "unavailable" notice; WarpBot itself is down then too.
- `continue_in_widget` (meeting-chat handoff) is excluded from the manifest by the worker.

## Testing checklist

- `npm run -s test:warpbot-tools-catalog` — copy covers the worker's 18 tools; manifest rows listed
  as sent (order, dedupe, unknown tool humanised and never hidden, unknown category → other,
  audience/effect fallback); chips only for present categories; filters.
- `npm run -s test:i18n-catalog`, `test:english-ui`, `test:page-ground`, `test:page-placeholders`,
  `test:warpbot-widget`, `test:plugin-surfaces`, `test:warpbot-parity`.
- Manual: member sees 17 tools and no Platform chip; platform staff sees 18 + Platform (server
  filtered); stop the AI worker and wait for the key to expire (or delete `assistant:tools:manifest`)
  → "Tool list unavailable right now" and web search neutral; web search badge follows
  `flags.warpbot_web_search`; expand a row with keyboard (Tab, Enter/Space), Try opens the widget
  with the prompt; connect a plugin and block one of its tools — it disappears from the page; light
  and dark theme.
