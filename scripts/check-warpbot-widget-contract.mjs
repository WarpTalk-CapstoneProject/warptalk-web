/**
 * WarpBot assistant widget (global-chatbot.tsx) — regressions this pins:
 *
 *  1. Enter on the @mention menu selected the mention AND fell through to sendMessage() in
 *     the same handler, sending the raw "@Al" text with mentions: []. An unguarded
 *     filteredOptions[selectedIndex] also crashed the page on a query matching nothing.
 *  2. JoinConversation was only invoked inside start().then(), so a reconnect left the
 *     client outside the hub group and "Thinking..." never cleared.
 *  3. Answers rendered without whitespace-pre-wrap (one run-on line) and the panel never
 *     scrolled to a new answer.
 *  4. The "Ask WarpBot" trigger called startNewConversation() unconditionally, wiping the
 *     open conversation every time the widget was re-opened.
 *  5. The slash menu opened on pages with no commands and then swallowed Enter entirely.
 *  6. Dead controls: an unlabelled paperclip, a handler-less "Chat history" button, a
 *     console.log on the mention chip, hover-styled skill rows that did nothing.
 *  7. Decorative @mention options with no entityType/entityId, and history/page.tsx
 *     registering a "history" page context with no meeting selected.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const widget = await readFile(
  path.join(root, "src/components/layout/global-chatbot.tsx"),
  "utf8",
);
const historyPage = await readFile(
  path.join(root, "src/app/(app)/[workspaceSlug]/history/page.tsx"),
  "utf8",
);

const keydownBody = widget.slice(
  widget.indexOf("const handleKeyDown"),
  widget.indexOf("const filteredOptions"),
);

const checks = [
  // Fix 1 — keyboard mention selection
  [
    "Enter on the mention menu guards the selected index",
    /const option = filteredOptions\[selectedIndex\];\s*\n\s*if \(option\) \{/.test(
      keydownBody,
    ),
  ],
  [
    "selecting a mention with Enter does not fall through to the send path",
    /insertMention\(option\);\s*\n\s*return;/.test(keydownBody),
  ],
  [
    "no unguarded insertMention(filteredOptions[selectedIndex])",
    !widget.includes("insertMention(filteredOptions[selectedIndex])"),
  ],
  [
    "every arrow/escape branch in the keydown handler returns",
    (keydownBody.match(/return;/g) ?? []).length >= 10,
  ],

  // Fix 2 — hub rejoin + first-message race + watchdog
  [
    "the hub re-joins the conversation group after an automatic reconnect",
    widget.includes("connection.onreconnected(") &&
      /onreconnected\([\s\S]{0,220}joinConversation\(\)/.test(widget),
  ],
  [
    "join state is dropped while reconnecting and on close",
    widget.includes("connection.onreconnecting(") &&
      widget.includes("connection.onclose("),
  ],
  [
    "the first message waits until this client has joined the hub group",
    widget.includes("waitForConversationJoin") &&
      /await waitForConversationJoin\(convId\);[\s\S]{0,400}sendAssistantMessage\.mutateAsync/.test(
        widget,
      ),
  ],
  [
    "a turn with no hub traffic surfaces an error instead of a stuck spinner",
    widget.includes("armResponseTimeout") &&
      widget.includes("ASSISTANT_RESPONSE_TIMEOUT_MS") &&
      widget.includes("clearResponseTimeout"),
  ],
  [
    "the stalled-spinner comment is gone",
    !widget.includes("surface as a stalled"),
  ],

  // Fix 3 — rendering + autoscroll
  [
    "assistant answers keep their line breaks",
    widget.includes("whitespace-pre-wrap"),
  ],
  [
    "the message list autoscrolls",
    widget.includes("messagesContainerRef") &&
      widget.includes("container.scrollTop = container.scrollHeight"),
  ],
  [
    "autoscroll respects a user who has scrolled up",
    widget.includes("shouldAutoScrollRef") &&
      widget.includes("handleMessagesScroll") &&
      widget.includes("AUTOSCROLL_THRESHOLD_PX"),
  ],

  // Fix 4 — re-opening keeps the conversation
  [
    "the Ask WarpBot trigger does not start a new conversation",
    !/PopoverTrigger[\s\S]{0,200}aria-label="Ask WarpBot"[\s\S]{0,200}startNewConversation/.test(
      widget,
    ),
  ],
  [
    "a new conversation is still reachable from the panel header",
    widget.includes('aria-label="New chat"') &&
      widget.includes("onClick={startNewConversation}"),
  ],

  // Fix 5 — slash commands never swallow Enter
  [
    "the slash menu only opens where the page has commands",
    widget.includes("if (slashMatch && availableSlashCommands.length > 0)"),
  ],
  [
    "Enter with no matching command sends the text instead of doing nothing",
    /setSlashMenuOpen\(false\);\s*\n\s*void sendMessage\(\);/.test(keydownBody),
  ],

  // Fix 6 — no dead controls
  ["no console.log left in the widget", !widget.includes("console.log")],
  [
    "the mention chip has a real remove control instead of a fake link",
    widget.includes("Remove ${ctx.title}") && !widget.includes("ctx.link"),
  ],
  [
    "the handler-less paperclip button is gone",
    !widget.includes('viewBox="0 0 16 16"'),
  ],
  [
    "chat history opens real conversations",
    widget.includes("useAssistantConversations") &&
      widget.includes("openConversationFromHistory") &&
      widget.includes("useLoadAssistantConversation"),
  ],
  [
    "skills are a read-only list, not hover-styled fake buttons",
    !/skills\.map\([\s\S]{0,200}hover:bg-surface-2/.test(widget),
  ],

  // Fix 7 — mentions and ambient history context
  [
    "@mention options always carry a real entity",
    !widget.includes("STATIC_CONTEXT_OPTIONS") &&
      /entityType: AssistantMentionDto\["entityType"\];\s*\n\s*entityId: string;/.test(
        widget,
      ),
  ],
  [
    "history registers ambient context only with a selected meeting",
    /useRegisterAssistantContext\(\s*\n\s*selected\s*\n\s*\? \{/.test(
      historyPage,
    ) && /: null,\s*\n\s*\);/.test(historyPage),
  ],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} WarpBot widget contract check(s) failed.`);
  process.exitCode = 1;
}
