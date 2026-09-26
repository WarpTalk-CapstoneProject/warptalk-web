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
  ⬜ Create Google Meet meeting           ← the plugin's mark, then the action, in mono
  Do you want to proceed?
  [ Yes ] [ Always allow ] [ No ]                            ⏎ to allow · Esc to decline
```

Only two things change between prompts: the action being asked about and the answers. Nothing
describes what will be created — that is in the reply, where the meeting card shows what was.

## The three states

The form does not end at the press. Creating a Google Meet meeting takes seconds, and a form that
vanishes on the press leaves an empty composer and no way to tell whether the write started,
finished, or was dropped — pressing again was the obvious guess.

| State | What is on screen | Ends when |
| --- | --- | --- |
| `asking` | the action, the question, the answers, the keyboard hint | an answer goes out |
| `running` | the product's loading mark + `Running…`, the action demoted to the muted second line, no buttons, flat `surface-1` | the turn ends |
| `done` | `✓ Done`, plus `WarpBot won't ask again for this action.` when the answer chosen was Always allow | ~4s later, by itself |

- `running` is held by the component; the surface only reports **when a turn ended**
  (`turnEndedAt`), and nulls it as a send opens the next one. So "a turn is open" answers "is the
  write still running" without either side comparing clocks.
- A **new** prompt replaces whatever is showing, answered or not, in the same render: the state is
  keyed on the ask's own contents (its confirmation token included), so nothing carries over.
- Typing and sending an ordinary message while `running` works as always — and that send, being a
  new turn, ends the form. Only the answer's own send keeps it.
- A turn that **fails** also ends it: the receipt says the form's question is over, and the failed
  reply below it is the account of what happened.

## The answer labels

The buttons carry the short word; the worker's sentence becomes the tooltip and the accessible
name. **The message each answer sends is unchanged** — still the worker's own `option.value`,
because the model parses it.

| Button | `title` + `aria-label` | Recognised by |
| --- | --- | --- |
| `Yes` | Run this action once | `Confirm the <tool> plugin action` |
| `Always allow` | Run it now and stop asking for this tool | `alwaysAllow: true` |
| `No` | Don't run it — tell WarpBot what to do instead | `Do not run …` |
| `Connect` / `Not now` / `Dismiss` | — | unchanged |

Classified by the **machine line**, not by position: the worker decides how many answers to offer,
and "the last one" has meant Cancel and Always allow in different versions of it. The labels are a
second, weaker signal, and an answer that matches neither keeps the worker's own label — long, but
never wrong.

## How it works

1. The AI worker publishes every ask on the existing `AssistantQuestion` event under one key:
   `{"permission": {kind, action, …, options}}` (`ai_assistant_worker/mcp_tools.py`). `kind` is
   `tool`, `connect` or `blocked`.
2. `parsePermissionPrompt` reads it; `AssistantPermissionPrompt` draws it. An answer is an ordinary
   chat message whose first line is the choice ("Yes") and whose second paragraph is the machine
   line the model acts on — the bubble shows the first and hides the second
   (`lib/assistant/confirmation-answer.ts`).
3. Connect answers do not send a message: they call the same `usePluginConnectUrl` flow the old
   card used, with `workspaceId` and the client tag. They have no `running` state for the same
   reason: nothing is being written, a browser is being opened.
4. All three surfaces hand the form the workspace-scoped plugin catalog from `useAssistantPlugins`,
   which is where the plugin's mark comes from. `/ai-chat` and the meeting panel passed
   `plugins={[]}`, so one ask carried Google Meet's mark in the widget and a bare line of mono in
   the other two.
5. The answer's own send must NOT clear the slot — that is what makes the states possible:
   - the widget and `/ai-chat` take `keepPermissionPrompt` on their send and skip the card clear;
   - the meeting panel's answer goes through `beginAssistantTurn`, which clears the card slots
     wholesale, so the prompt is put straight back (`answeredPermissionRef`), and a module-level
     `answeredPermissions` map remembers it across the tab switch that unmounts the panel — without
     it, Transcript and back would offer the buttons again over a write already running.

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
  when the next turn starts, never when the current turn's answer lands. The lifecycle script also
  pins the exception: the answer's own send keeps the prompt, the turn's end is reported to the form
  rather than used to clear it, and the receipt expires by itself.
- `scripts/check-warpbot-surface-parity.mjs` — the three surfaces hand the form the same things (a
  real plugin catalog, the turn's end), and the form keeps its short labels, the long meanings in
  `title`/`aria-label`, the focus ring and the narrow-composer rule.

## UI behaviour

- Esc takes the last answer (Cancel / Not now / Dismiss) from anywhere, while the form is still
  asking. Once an answer is on its way there is nothing to decline, and Esc falls through.
- Enter takes the first answer **only while the composer is empty**, and only once: after an answer
  has gone out, Enter on an empty box sends nothing rather than confirming the same write twice.
  Anything typed wins, because a write must not be approved by a stray keystroke.
- The answers show a `focus-visible` ring in the app's own token. The form never takes focus off the
  composer when it appears: it gates a write, and it must be reachable by keyboard without stealing
  the thing the user is typing into.
- In a composer narrower than 360px (a container query — the widget is 460px wide whatever the
  window is) the keyboard hint hides rather than pushing the answers onto a second row.
- `Always allow` also turns the tool's policy to allow; the backend reports that with
  `AppliedToolPolicy`, WarpBot says so in its reply, and the receipt says it too.
- `ask_user` — WarpBot asking for a title or a language — stays in the thread: it is a question in
  the conversation, answerable in prose, not a gate on an action.

## Known limitations

- The bridge WarpBot popup is deliberately carved out of the Connect flow (a browser consent cannot
  hand back to an always-on-top popup yet), so it shows no prompt there.
- The form has no per-tool detail. If a tool's label is vague ("Run action"), the prompt is vague
  too; the fix belongs in the tool's catalog label.
- `✓ Done` means the turn the answer opened is over, not that the tool succeeded. What the tool did
  is in the reply underneath; a failed turn shows the receipt too.
- In a meeting, an answer sent while WarpBot is still finishing another question waits in the WT-580
  queue, and the form keeps saying `Running…` until the queue has drained — which is honest, but it
  cannot distinguish its own turn from the one ahead of it.

## Testing checklist

- `npm run test:plugin-connection-action`, `npm run test:plugin-card-lifecycle`,
  `npm run test:plugin-confirmation`, `npm run test:warpbot-parity`.
- Ask WarpBot to create a Google Meet meeting: the form appears above the input, Enter approves,
  the answers give way to `Running…` and then to `✓ Done`, and the meeting card lands in the thread.
- Press `Always allow`: the receipt carries the second line about not being asked again.
- Type while `Running…` and send: the message goes out and the form gives way to the new turn.
- Mention a plugin that is not connected: the same form offers Connect, with the plugin's mark, on
  all three surfaces.
