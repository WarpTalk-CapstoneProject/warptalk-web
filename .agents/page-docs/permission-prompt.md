# WarpBot's permission prompt — one form, above the composer

## What changed

WarpBot used to ask for permission in three different shapes, all in the middle of the chat thread:

- a **confirmation card** for a write, carrying rows built from the tool call's own arguments
  (Title, When, Calendar),
- a **Connect card** for a plugin the user had not connected, and
- an **operator-setup card** for a provider only an administrator can register.

Three shapes for one question — "may I?" — and the rows were the worst part: they were as often the
server's defaults as the user's words, so a card saying `Title: Google Meet meeting` described a
decision nobody had made. In the thread the card also scrolled away behind the answer that followed
it, and it was gone when the conversation was reopened, leaving WarpBot talking about a card the
reader could not see.

Now there is **one form**, and it sits **inside the composer box, above the input**:

```
  Create Google Meet meeting              ← the action, in mono
  Do you want to proceed?
  [ Yes ] [ Yes, and don't ask again for this tool ] [ No, and tell WarpBot… ]   ⏎ / Esc
```

Only two things change between prompts: the action being asked about and the answers. Nothing
describes what will be created — that is in the reply, where the meeting card shows what was.

## How it works

1. The AI worker publishes every ask on the existing `AssistantQuestion` event under one key:
   `{"permission": {kind, action, …, options}}` (`ai_assistant_worker/mcp_tools.py`). `kind` is
   `tool`, `connect` or `blocked`.
2. `parsePermissionPrompt` reads it; `AssistantPermissionPrompt` draws it. An answer is an ordinary
   chat message whose first line is the choice ("Yes") and whose second paragraph is the machine
   line the model acts on — the bubble shows the first and hides the second
   (`lib/assistant/confirmation-answer.ts`).
3. Connect answers do not send a message: they call the same `usePluginConnectUrl` flow the old
   card used, with `workspaceId` and the client tag.

## Files affected

- `src/components/assistant/permission-prompt.tsx` (new) — the form and its parser.
- Deleted: `src/components/layout/plugin-connection-action-card.tsx`,
  `src/components/layout/plugin-operator-setup-card.tsx`.
- `src/components/layout/global-chatbot.tsx`, `src/app/(app)/[workspaceSlug]/ai-chat/page.tsx`,
  `src/components/rooms/live/chat-panel.tsx` — one `pendingPermission` slot, rendered in the
  composer; `src/components/rooms/live/persistent-meeting-session.tsx` routes the payload.
- `src/stores/translationRoom-store.ts` — `assistantPluginConnectionJson` and
  `assistantPluginSetupJson` collapse into `assistantPermissionJson`.
- `scripts/check-plugin-connection-action-contract.mjs`,
  `scripts/check-plugin-card-lifecycle.mjs` — every surface must draw the form, and it must clear
  when the next turn starts, never when the current turn's answer lands.

## UI behaviour

- Esc takes the last answer (Cancel / Not now / Dismiss) from anywhere.
- Enter takes the first answer **only while the composer is empty**. Anything typed wins, because a
  write must not be approved by a stray keystroke.
- "Yes, and don't ask again for this tool" also turns the tool's policy to allow; the backend
  reports that with `AppliedToolPolicy`, and WarpBot says so in its reply.
- `ask_user` — WarpBot asking for a title or a language — stays in the thread: it is a question in
  the conversation, answerable in prose, not a gate on an action.

## Known limitations

- The bridge WarpBot popup is deliberately carved out of the Connect flow (a browser consent cannot
  hand back to an always-on-top popup yet), so it shows no prompt there.
- The form has no per-tool detail. If a tool's label is vague ("Run action"), the prompt is vague
  too; the fix belongs in the tool's catalog label.

## Testing checklist

- `npm run test:plugin-connection-action`, `npm run test:plugin-card-lifecycle`,
  `npm run test:plugin-confirmation`, `npm run test:warpbot-parity`.
- Ask WarpBot to create a Google Meet meeting: the form appears above the input, Enter approves,
  the meeting card lands in the thread.
- Mention a plugin that is not connected: the same form offers Connect.
