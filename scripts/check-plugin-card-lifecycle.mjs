// WarpBot's in-chat cards — a question or write confirmation, a Connect prompt, an operator-setup
// notice — last until the NEXT turn starts. Both ends of that rule have broken before.
//
// Cleared too late: nothing but a user click used to end a card, so a Connect card survived New
// chat, where pressing it opened an OAuth flow the current turn never asked for, and two cards
// could stack up, one per error code.
//
// Cleared too early: the fix for that also cleared the cards when their own turn's answer landed.
// But a card is raised MID-turn, when the plugin tool returns, and the answer that arrives next is
// the one explaining it ("connect Google Calendar", "confirm this write"). Clearing there erased
// the card moments after it appeared, before anyone could press it — and in a meeting, a plugin
// write's Confirm card with it, so a write could not realistically be approved (WT-688).
//
// So every surface is checked for both halves: the cards ARE cleared where a new turn or a
// different conversation begins, and are NOT cleared where a turn completes or fails. Each check
// reads the one handler or function it is about, not the whole file, so a clear that moves from
// the right place to the wrong one cannot keep the count and pass.
//
// THE ONE SEND THAT MUST NOT CLEAR, added with the permission form's states: the answer to the
// form itself. "The next turn ends the previous turn's cards" was implemented as "any send ends
// them", and an answer IS a send — so the form vanished on the press, leaving nothing on screen
// for the seconds a write takes. The last section below checks that half on all three surfaces:
// the answer keeps the prompt, the turn's end is reported to it rather than used to clear it, and
// the form is the thing that eventually takes itself away.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

/** The source from `start` up to the first `end` after it. Fails loudly when either is missing. */
function slice(source, file, start, end) {
  const from = source.indexOf(start);
  if (from === -1) {
    throw new Error(
      `${file}: could not find ${JSON.stringify(start)}, so the card lifecycle there cannot be checked. If it was renamed, update this script to the new name rather than deleting the check.`,
    );
  }
  const to = source.indexOf(end, from + start.length);
  if (to === -1) {
    throw new Error(
      `${file}: could not find where ${JSON.stringify(start)} ends, so the card lifecycle there cannot be checked. Update this script to the new shape.`,
    );
  }
  return source.slice(from, to);
}

function assertIncludes(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

function assertNotIncludes(source, token, message) {
  if (source.includes(token)) throw new Error(message);
}

const ERASED_ON_ARRIVAL =
  "A card is raised mid-turn and the answer that lands next is the one explaining it, so clearing it when the turn ends erases it before anyone can press it.";

// --- The WarpBot widget ---------------------------------------------------------------------------

const widgetFile = "src/components/layout/global-chatbot.tsx";
const widget = read(widgetFile);

assertIncludes(
  widget,
  "const clearPluginCards = useCallback(",
  "global-chatbot must clear both plugin cards from one place, so no boundary can clear one and forget the other.",
);

for (const [name, start] of [
  ["sending a message", "const sendMessage = async ("],
  ["New chat", "const startNewConversation = () => {"],
  // openConversationFromHistory delegates to openConversationById, which also opens a thread handed over from a meeting.
  ["opening a conversation (from history or a meeting handoff)", "const openConversationById = async ("],
]) {
  assertIncludes(
    slice(widget, widgetFile, start, "\n  };"),
    "clearPluginCards()",
    `global-chatbot must clear the plugin cards on ${name}. A card left over from an earlier turn or conversation offers an OAuth flow the current turn never asked for.`,
  );
}

for (const event of ["AssistantMessageCompleted", "AssistantMessageFailed"]) {
  const handler = slice(widget, widgetFile, `"${event}",`, "connection.on(");
  for (const clear of ["clearPluginCards()", "setPendingPermission(null)"]) {
    assertNotIncludes(
      handler,
      clear,
      `global-chatbot must not clear the plugin cards in its ${event} handler. ${ERASED_ON_ARRIVAL}`,
    );
  }
}

// One prompt at a time, by construction: a write to confirm, a plugin to connect and a provider
// needing an operator are one question asked in one form, so there is one slot to overwrite rather
// than three that can contradict each other on screen.
assertIncludes(
  widget,
  "setPendingPermission(permission)",
  "global-chatbot must put the permission prompt in its own slot, so an answer it is waiting on cannot be erased by an unrelated event.",
);

// --- /ai-chat ---------------------------------------------------------------------------------------

const aiChatFile = "src/app/(app)/[workspaceSlug]/ai-chat/page.tsx";
const aiChat = read(aiChatFile);

assertIncludes(
  slice(aiChat, aiChatFile, "async function sendContent(", "\n  }\n"),
  "clearPluginCards()",
  "/ai-chat must clear the plugin cards when a message is sent: that is where the next turn starts.",
);
assertIncludes(
  slice(aiChat, aiChatFile, "function selectConversation(", "\n  }\n"),
  "clearPluginCards()",
  "/ai-chat must clear the plugin cards when switching conversation, or a Connect card from one conversation is offered in another.",
);
assertIncludes(
  slice(aiChat, aiChatFile, "async function handleCreateConversation(", "\n  }\n"),
  "selectConversation(",
  "/ai-chat's New conversation must go through selectConversation, which is what clears the plugin cards.",
);

// The whole hub effect, not one handler: on this page no hub event starts a turn — the page's own
// send does — so nothing registered on the connection has any reason to clear a card. The one
// exception is cut out first: the AssistantQuestion handler nulls one plugin card while setting the
// other, which is the setup-beats-Connect exclusivity, not the end of a turn.
const aiChatHubEffect = slice(aiChat, aiChatFile, "createHubConnection(", "return () => {");
const aiChatHub = aiChatHubEffect.replace(
  slice(aiChatHubEffect, aiChatFile, '"AssistantQuestion",', "\n    );"),
  "",
);
for (const clear of [
  "clearPluginCards()",
  "setPendingPluginConnection(null)",
  "setPendingPluginSetup(null)",
]) {
  assertNotIncludes(
    aiChatHub,
    clear,
    `/ai-chat must not clear the plugin cards from a hub event handler such as AssistantMessageCompleted or AssistantMessageFailed. ${ERASED_ON_ARRIVAL}`,
  );
}

// --- The meeting panel's store ----------------------------------------------------------------------
// Behaviour is also pinned by src/stores/__tests__/assistant-trail.test.ts; this keeps the shape the
// tests rely on from being routed around.

const storeFile = "src/stores/translationRoom-store.ts";
const store = read(storeFile);
const CARD_SLOTS = ["assistantQuestionsJson: null", "assistantPermissionJson: null"];

const seal = slice(store, storeFile, "sealAssistantTrail: (messageId) =>", "\n    }),");
for (const slot of CARD_SLOTS) {
  assertNotIncludes(
    seal,
    slot,
    `The meeting store must not clear ${slot.split(":")[0]} in sealAssistantTrail, which runs when the answer arrives. ${ERASED_ON_ARRIVAL} In a meeting this is also the write-confirmation card.`,
  );
}

const beginTurn = slice(store, storeFile, "beginAssistantTurn: () =>", "\n    })),");
for (const slot of CARD_SLOTS) {
  assertIncludes(
    beginTurn,
    slot,
    `The meeting store must clear ${slot.split(":")[0]} in beginAssistantTurn. Cards outlive their own answer, so the next turn is the only thing that ends them on the asker's screen.`,
  );
}

const clearCards = slice(store, storeFile, "clearAssistantCards: () =>", "\n    }),");
for (const slot of CARD_SLOTS) {
  assertIncludes(
    clearCards,
    slot,
    `The meeting store's clearAssistantCards must clear ${slot.split(":")[0]}. It is what ends the previous turn's cards on the screens of participants who did not ask.`,
  );
}

const noteActivity = slice(store, storeFile, "noteAssistantActivity: (toolName = null", "\n    }),");
for (const slot of CARD_SLOTS) {
  assertNotIncludes(
    noteActivity,
    slot,
    `The meeting store must not clear ${slot.split(":")[0]} in noteAssistantActivity, even on idle -> thinking. On a client that did not ask, the panel's answer baseline is stale and drops the state to idle mid-turn, so a later tool call of the same turn would look like a new turn and erase the card that turn just raised.`,
  );
}

const sessionFile = "src/components/rooms/live/persistent-meeting-session.tsx";
assertIncludes(
  slice(read(sessionFile), sessionFile, '"ChatAssistantResponsePending"', "\n    });"),
  "clearAssistantCards()",
  "The meeting session must clear the previous turn's cards on ChatAssistantResponsePending. Only the asker's panel runs beginAssistantTurn; this is the once-per-turn signal every other participant receives, and it always arrives before that turn's own card.",
);

// --- The answer is the one send that keeps the prompt ---------------------------------------------
// Everything above is about a card nobody has pressed yet. These are about the moment after the
// press, which used to be the end of the form: it now stays, says the write is running, and leaves
// on its own once the turn is over.

const promptFile = "src/components/assistant/permission-prompt.tsx";
const promptSource = read(promptFile);

for (const [what, token] of [
  ["the three states it draws", 'const phase: "asking" | "running" | "done"'],
  [
    "a receipt that takes itself off the screen",
    "setTimeout(() => dismissRef.current(), RECEIPT_VISIBLE_MS)",
  ],
]) {
  assertIncludes(
    promptSource,
    token,
    `The permission form must keep ${what}. Without it the press is the end of the form again, and a write that takes seconds happens behind an empty composer.`,
  );
}
// The message is the worker's, not the button's: the short label is a display choice and the model
// parses what is sent.
assertIncludes(
  promptSource,
  "handlers.onAnswer(option.value!)",
  "An answer must send the worker's own option value. Sending the button's label instead would hand the model a word it does not parse.",
);

const widgetPrompt = slice(widget, widgetFile, "<AssistantPermissionPrompt", "/>");
const aiChatPrompt = slice(aiChat, aiChatFile, "<AssistantPermissionPrompt", "/>");
const roomChatFile = "src/components/rooms/live/chat-panel.tsx";
const roomChat = read(roomChatFile);
const roomChatPrompt = slice(roomChat, roomChatFile, "<AssistantPermissionPrompt", "/>");

for (const [surface, element, cleared] of [
  ["global-chatbot", widgetPrompt, "setPendingPermission(null)"],
  ["/ai-chat", aiChatPrompt, "setPendingPermission(null)"],
  ["the meeting chat panel", roomChatPrompt, "setAssistantPermissionJson(null)"],
]) {
  assertIncludes(
    element,
    "turnEndedAt=",
    `${surface} must tell the permission form when the turn ended, or its answer spins forever: the form cannot see the hub.`,
  );
  const onAnswer = slice(element, surface, "onAnswer=", "onConnect=");
  assertNotIncludes(
    onAnswer,
    cleared,
    `${surface} must not clear the permission slot when the answer is sent. The form is the only thing on screen saying the write is running — clearing it here is the empty composer the states were added to fix.`,
  );
}

// The widget and /ai-chat funnel every send through one function, which is where the clear lives;
// it has to skip the answer's own send and nothing else.
for (const [surface, source, file, start] of [
  ["global-chatbot", widget, widgetFile, "const sendMessage = async ("],
  ["/ai-chat", aiChat, aiChatFile, "async function sendContent("],
]) {
  assertIncludes(
    slice(source, file, start, "\n  }"),
    "if (!options?.keepPermissionPrompt) clearPluginCards();",
    `${surface} must skip the card clear for the permission form's own answer, and only for that: every other send is a new turn, which is what ends a card nobody pressed.`,
  );
}

// Reported, not acted on: a handler that clears here is the WT-688 bug, and one that says nothing
// leaves the form spinning under a finished answer.
for (const event of ["AssistantMessageCompleted", "AssistantMessageFailed"]) {
  assertIncludes(
    slice(widget, widgetFile, `"${event}",`, "connection.on("),
    "setTurnEndedAt(Date.now())",
    `global-chatbot's ${event} handler must report the turn's end to the permission form. It is the only signal that an allowed write is over.`,
  );
}
assertIncludes(
  slice(aiChat, aiChatFile, "const refetchBoth = (", "\n    };"),
  "setTurnEndedAt(Date.now())",
  "/ai-chat must report the turn's end to the permission form from the handler both the completed and the failed event share.",
);

// The meeting's answer goes out through beginAssistantTurn, which ends the previous turn's cards —
// including, unless it is put back, the prompt the answer belongs to.
assertIncludes(
  slice(roomChat, roomChatFile, "function dispatchMessage(", "sendMessageAPI("),
  "setAssistantPermissionJson(answeredPermission)",
  "The meeting chat panel must put the answered prompt back after beginAssistantTurn, which clears the card slots wholesale. Without it the form disappears on the press in a meeting only.",
);

console.log("Plugin card lifecycle contract passed.");
