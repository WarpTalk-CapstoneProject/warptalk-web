// Everything WarpBot has to ask before it may act — a write to confirm, a plugin to connect, a
// provider only an operator can register — arrives on the AssistantQuestion event under one
// `permission` key and is drawn by one form above the composer. A surface that renders question
// cards but not that form does not fail loudly: the payload parses to nothing and the user is
// simply told nothing about the plugin they need to connect. That is how /ai-chat and the meeting
// panel came to drop the old cards (WT-688), so this script checks every surface, not just the
// widget.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertIncludes(source, token, message) {
  if (!source.includes(token)) {
    throw new Error(message);
  }
}

function assertNotIncludes(source, token, message) {
  if (source.includes(token)) {
    throw new Error(message);
  }
}

// --- The parser reads the key the worker actually sends -----------------------------------------
// ai_assistant_worker/mcp_tools.py publishes {"permission": {...}} for all three kinds. A parser
// reading any other key returns null for every real event.

const prompt = read("src/components/assistant/permission-prompt.tsx");
assertIncludes(
  prompt,
  "{ permission?: unknown }",
  "The permission prompt parser must read the permission key, which is the key the AI worker publishes every ask under; reading any other key silently drops all of them.",
);
for (const kind of ['kind !== "tool"', 'kind !== "connect"', 'kind !== "blocked"']) {
  assertIncludes(
    prompt,
    kind,
    `The permission prompt must know the ${kind.split('"')[1]} kind, or that ask renders nothing.`,
  );
}
assertIncludes(
  prompt,
  "onConnect(prompt.pluginKey)",
  "The permission prompt's Connect answer must pass the backend plugin key to the connect flow.",
);
assertIncludes(
  prompt,
  '"Not now"',
  "The permission prompt must offer a local dismissal for a plugin the user does not want to connect now.",
);

// --- Every surface that renders question cards renders the plugin cards too ---------------------
// Found by scanning, not listed by hand, so a NEW chat surface cannot quietly render question
// cards and drop the other two. A surface that must leave them out needs an explicit carve-out.

const CHAT_SURFACES = [
  "src/components/layout/global-chatbot.tsx",
  "src/app/(app)/[workspaceSlug]/ai-chat/page.tsx",
  "src/components/rooms/live/chat-panel.tsx",
];

// CARVE-OUT, deliberate — do not "fix" by adding the cards. The bridge WarpBot pane is a popup
// floating over a Google Meet call, and warpbot-pane.tsx leaves both plugin cards out on purpose:
// "Consent opens a browser from an always-on-top popup, and the desktop hand-back from it is not a
// finished path yet — a Connect button here would be a control that cannot succeed." The model's
// answer still says what is missing. When that hand-back ships, remove this carve-out and add the
// pane to CHAT_SURFACES in the same change.
const CARVED_OUT_SURFACES = {
  "src/components/rooms/bridge/widget/warpbot-pane.tsx":
    "a Connect button here would be a control that cannot succeed",
};

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

const questionCardRenderers = listSourceFiles(join(root, "src"))
  .filter((file) => readFileSync(file, "utf8").includes("<AssistantQuestionCard"))
  .map((file) => relative(root, file).split(sep).join("/"));

for (const surface of questionCardRenderers) {
  if (!CHAT_SURFACES.includes(surface) && !(surface in CARVED_OUT_SURFACES)) {
    throw new Error(
      `${surface} renders assistant question cards but is not checked for the Connect and operator-setup cards. Every surface that shows WarpBot's question cards receives those two on the same event; render them there and add the file to CHAT_SURFACES, or, if the surface must leave them out, add a carve-out to CARVED_OUT_SURFACES quoting why.`,
    );
  }
}

for (const [surface, reason] of Object.entries(CARVED_OUT_SURFACES)) {
  // Joined back into one line: the reason is prose in a block comment, wrapped at the page width.
  const prose = read(surface).replace(/\s*\n\s*\*?\s*/g, " ");
  assertIncludes(
    prose,
    reason,
    `${surface} is carved out of the plugin-card check because it documents why it cannot offer a working Connect button. That explanation is gone, so the carve-out may be stale: if the surface can now connect plugins, render both plugin cards there and move it to CHAT_SURFACES.`,
  );
}

const CONNECT_CALL = /connectPlugin\.mutateAsync\(\{[\s\S]*?\}\)/g;

for (const surface of CHAT_SURFACES) {
  const source = read(surface);

  assertIncludes(
    source,
    "<AssistantPermissionPrompt",
    `${surface} renders WarpBot's question cards but not the permission prompt, so a write awaiting confirmation, or a plugin that needs connecting, tells the user nothing on this surface.`,
  );
  assertIncludes(
    source,
    "usePluginConnectUrl",
    `${surface} must connect plugins through the existing usePluginConnectUrl hook rather than a route or request of its own.`,
  );
  assertNotIncludes(
    source,
    "/settings/plugins/",
    `${surface} must not depend on a workspace-scoped plugin settings route to connect a plugin.`,
  );

  const connectCalls = source.match(CONNECT_CALL) ?? [];
  if (connectCalls.length === 0) {
    throw new Error(
      `${surface} renders the Connect card but never calls connectPlugin.mutateAsync, so pressing Connect cannot start the connect flow.`,
    );
  }
  for (const call of connectCalls) {
    assertIncludes(
      call,
      "workspaceId",
      `${surface} starts a plugin connect without a workspaceId. Unscoped, the API has no workspace policy to apply, so a workspace that turned plugins off would still have them connected from this surface.`,
    );
    assertIncludes(
      call,
      'client: isDesktopApp() ? "desktop" : "web"',
      `${surface} starts a plugin connect without saying which client asked. The client is sealed into the OAuth state, and without it a desktop user finishes consent in the browser and is never handed back to the app.`,
    );
  }
}

// --- One prompt, one slot ------------------------------------------------------------------------
// "Press Connect" and "no button will help" cannot both be true of one failure. They used to be two
// keys on one payload and two setters, so a surface could render both; now the worker sends one
// kind and each surface keeps one slot.

const globalWidget = read("src/components/layout/global-chatbot.tsx");
const aiChat = read("src/app/(app)/[workspaceSlug]/ai-chat/page.tsx");
for (const [surface, source] of [
  ["global-chatbot.tsx", globalWidget],
  ["/ai-chat", aiChat],
]) {
  assertIncludes(
    source,
    "setPendingPermission(permission)",
    `${surface} must store the permission prompt it was sent, in its own slot.`,
  );
  assertNotIncludes(
    source,
    "setPendingPluginSetup",
    `${surface} still keeps a second slot for an operator-setup card. There is one prompt now; two slots is how they contradicted each other on screen.`,
  );
}

// --- The meeting panel keeps one slot per card --------------------------------------------------
// The room receives cards through persistent-meeting-session.tsx and the panel renders them from
// the store. All three kinds used to share one slot that every event overwrote, so an operator-setup
// event erased a half-answered question card and, with no setup card to show, rendered nothing.

const roomHub = read("src/components/rooms/live/persistent-meeting-session.tsx");
assertNotIncludes(
  roomHub,
  "setAssistantQuestionsJson(payload?.questionsJson",
  "The meeting session must not store every WarpBot card payload in the questions slot. Each event carries one kind of card, and overwriting one shared slot lets a Connect or setup event erase a question card the user was still answering.",
);
assertIncludes(
  roomHub,
  "store.setAssistantPermissionJson(json)",
  "The meeting session must route a permission payload into its own slot, so it cannot overwrite a question the user is still answering.",
);
assertIncludes(
  roomHub,
  "parsePermissionPrompt(json)",
  "The meeting session must recognise a permission payload before storing it; storing whatever arrives would put a question in the permission slot and vice versa.",
);

const roomChat = read("src/components/rooms/live/chat-panel.tsx");
assertIncludes(
  roomChat,
  "onDismiss={() => setAssistantPermissionJson(null)}",
  "Dismissing the permission prompt in the meeting panel must clear only that prompt, not a question card shown beside it.",
);

console.log("Plugin connection action contract passed.");
