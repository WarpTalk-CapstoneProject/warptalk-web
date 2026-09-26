# WarpBot meeting cards — a WarpTalk room or a Google Meet meeting

## What changed

WarpBot can create two different things people both call "a meeting":

- a **WarpTalk room**, hosted here (`create_meeting` in the AI worker), and
- a **Google Meet meeting**, hosted by Google (the Google Meet plugin tool
  `google_calendar_create_meet_event`).

Before this change a user who wrote "tạo 1 cuộc họp bằng @Google Meet" got a sentence pointing at
a card that was not on screen, no join link, no meeting code, and nothing saying which of the two
products had been created. The answer also arrived with its `@Google Meet` chip stranded on a row
of its own, so the sentence read as "tạo 1 cuộc họp bằng".

Now:

- Every meeting WarpBot creates comes back as a **card under the answer**: the join link, the
  meeting code with a Copy button, the time, and (for Google Meet) "Open in Calendar".
- The two kinds are labelled: **Google Meet** with Google's mark, **WarpTalk room** with WarpTalk's,
  and **WarpTalk translation** for the `EXTERNAL_BRIDGE` room that translates a Google Meet call.
- Everything WarpBot has to **ask** before it may act — a write to confirm, a plugin to connect, a
  provider only an administrator can register — is **one form above the composer**, not three cards
  in the thread. See `permission-prompt.md`.
- A user's answer to that form shows as **"Yes"** / "Always allow" / "Cancel"; the confirmation
  token it carries for the model is hidden from the bubble.
- `@mentions` stay **inside the sentence** in the composer and in the sent bubble.

## How it works

1. The AI worker creates the meeting through a tool, then appends a marker to its own answer:
   `<!-- warpbot:meeting {"kind":"google_meet","url":…,"code":…,"start":…,"end":…,"calendarUrl":…} -->`
   (`ai_assistant_worker/meeting_links.py`). Markdown renders nothing for an HTML comment, so the
   marker is invisible; it is stored with the message, so the card survives a reload and a reopened
   conversation without a new database column.
2. `lib/assistant/meeting-links.ts` reads the markers, and **only** the markers: a Meet link in an
   answer about yesterday's meetings is not a meeting WarpBot just created. Every URL is validated
   before it becomes a button — Google Meet on `meet.google.com`, a room as this app's own
   `/rooms/{uuid}` (with or without the workspace slug), a Calendar link on Google's calendar host.
   `AssistantMarkdown` also **strips the markers from the prose before rendering**: react-markdown
   has no raw-HTML plugin here and prints an HTML comment instead of dropping it, so without this
   the reader saw the JSON in full under the answer (caught in the browser, 24 Sep). The backend
   strips them too before translating an answer in the meeting chat.
3. `components/assistant/meeting-link-card.tsx` draws the cards; `AssistantMarkdown` renders them
   under the answer when `withMeetingCards` is set.

## Files affected

- `src/lib/assistant/meeting-links.ts` (new) — markers → card data, plus `formatMeetingWhen`.
- `src/lib/assistant/confirmation-answer.ts` (new) — the confirmation answer as the user reads it.
- `src/lib/assistant/message-mentions.ts` — `mentionToken`, `hasMentionToken`,
  `mentionTokenEndingAt`, `splitMentionTokens`.
- `src/components/assistant/meeting-link-card.tsx` (new).
- `src/components/assistant/message-mention-chips.tsx` — `UserMessageBody` draws a user message
  with its mentions in place.
- `src/components/assistant/assistant-markdown.tsx` — `withMeetingCards`,
  `meetingCardsOpenRoomsOutside`.
- `src/components/layout/assistant-question-card.tsx` — `details` rows on a question.
- `src/components/layout/global-chatbot.tsx` — composer keeps the `@Label` token, mirror highlight,
  atomic Backspace over a token, and a card answer no longer carries the draft's mentions.
- `src/app/(app)/[workspaceSlug]/ai-chat/page.tsx` — renders answers as markdown with cards.
- `src/components/rooms/live/chat-panel.tsx`, `src/components/rooms/bridge/widget/warpbot-pane.tsx`
  — the same cards; rooms open in a new tab from a live meeting and from the bridge popup.
- `scripts/check-warpbot-surface-parity.mjs` — every WarpBot surface must draw the cards.
- Tests: `src/lib/assistant/__tests__/{meeting-links,confirmation-answer,message-mentions}.test.ts`,
  wired into `test:contracts`.

## UI behaviour

- A card shows: badge (kind), time, title, code box with Copy, the link, then the actions.
  "Join Google Meet" and "Open in Calendar" open a new tab; "Open room" opens in place, except in a
  live meeting or the bridge popup, where navigating in place would close what the user is in.
- The confirmation card's question is its heading when it has `details`; the rows are a `dl`.
- Backspace at the end of `@Google Meet` deletes the whole mention, and removing the text removes
  the mention from what is sent.

## Known limitations

- Cards only appear for answers produced after the worker started appending markers; older answers
  in history show the prose alone.
- The Google Meet badge uses Tailwind's emerald palette rather than a design token, because it is a
  brand colour, not a semantic one.
- The time is rendered in the reader's own time zone; the confirmation card's "When" comes from the
  worker and is labelled GMT+7.

## Testing checklist

- `npm run test:meeting-links`, `npm run test:confirmation-answer`, `npm run test:message-mentions`,
  `npm run test:warpbot-parity`, `npm run test:plugin-confirmation`.
- Ask WarpBot "tạo 1 cuộc họp bằng @Google Meet": the sentence keeps its chip, the confirmation card
  lists Title/When/Calendar, pressing Create sends "Create", and the answer carries a Google Meet
  card with a working link and code.
- Ask for an ordinary meeting: the answer carries a WarpTalk room card instead.
- Reload the conversation: both cards come back.
