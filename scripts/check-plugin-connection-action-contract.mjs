// WarpBot raises three kinds of card mid-turn, all on the same AssistantQuestion event: a question
// (including the write confirmation), a Connect prompt, and an operator-setup notice. The worker
// sends one card per event, under a different JSON key each. A surface that renders question cards
// but not the other two does not fail loudly — the payload parses to nothing and the user is simply
// told nothing about the plugin they need to connect. That is how /ai-chat and the meeting panel
// came to drop these cards (WT-688), so this script checks every surface, not just the widget.
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

// --- The parsers read the keys the worker actually sends ----------------------------------------
// ai_assistant_worker/mcp_tools.py publishes {"pluginConnection": {...}} and
// {"pluginOperatorSetup": {...}}. A parser reading any other key returns null for every real event.

const actionCard = read("src/components/layout/plugin-connection-action-card.tsx");
assertIncludes(
  actionCard,
  "parsePluginConnectionAction",
  "Plugin connection action card module must export a parser for AssistantQuestion payloads.",
);
assertIncludes(
  actionCard,
  "{ pluginConnection?: unknown }",
  "The Connect card parser must read the pluginConnection key, which is the key the AI worker publishes the prompt under; reading any other key silently drops every real Connect prompt.",
);
assertIncludes(
  actionCard,
  'type: "plugin_connection_required"',
  "Plugin connection action card must use the plugin_connection_required action type.",
);
assertIncludes(
  actionCard,
  "onConnect(action.pluginKey)",
  "Plugin connection action card primary action must pass the backend plugin key to the connect flow.",
);
assertIncludes(
  actionCard,
  "Not now",
  "Plugin connection action card must offer a local dismissal action.",
);

const setupCard = read("src/components/layout/plugin-operator-setup-card.tsx");
assertIncludes(
  setupCard,
  "{ pluginOperatorSetup?: unknown }",
  "The operator-setup card parser must read the pluginOperatorSetup key, which is the key the AI worker publishes the notice under; reading any other key means a plugin that needs an administrator is never explained.",
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
    "<PluginConnectionActionCard",
    `${surface} renders WarpBot's question cards but not the Connect card, so a plugin tool that needs connecting tells the user nothing on this surface.`,
  );
  assertIncludes(
    source,
    "<PluginOperatorSetupCard",
    `${surface} renders WarpBot's question cards but not the operator-setup card, so a plugin that needs an administrator to register an OAuth app tells the user nothing on this surface.`,
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

// --- Setup beats Connect, wherever the choice is made -------------------------------------------
// "Press Connect" and "no button will help" cannot both be true of one failure. Each surface makes
// the choice explicitly instead of trusting the worker never to send both.

const globalWidget = read("src/components/layout/global-chatbot.tsx");
const aiChat = read("src/app/(app)/[workspaceSlug]/ai-chat/page.tsx");
for (const [surface, source] of [
  ["global-chatbot.tsx", globalWidget],
  ["/ai-chat", aiChat],
]) {
  assertIncludes(
    source,
    "if (pluginSetup) {",
    `${surface} must choose the operator-setup card explicitly, so a payload carrying both keys cannot show a Connect button for a plugin no button can connect.`,
  );
  assertIncludes(
    source,
    "} else if (pluginConnection) {",
    `${surface} must make the Connect card the else branch of the operator-setup card, so the two cannot both render.`,
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
  "if (parsePluginOperatorSetupAction(json)) {",
  "The meeting session must route operator-setup payloads into their own slot, chosen ahead of the Connect card.",
);
assertIncludes(
  roomHub,
  "} else if (parsePluginConnectionAction(json)) {",
  "The meeting session must route Connect payloads into their own slot, as the else branch of the operator-setup card so the two cannot both render.",
);

const roomChat = read("src/components/rooms/live/chat-panel.tsx");
assertIncludes(
  roomChat,
  "onDismiss={() => setAssistantPluginConnectionJson(null)}",
  "Dismissing the Connect card in the meeting panel must clear only the Connect card, not a question card shown beside it.",
);
assertIncludes(
  roomChat,
  "onDismiss={() => setAssistantPluginSetupJson(null)}",
  "Dismissing the operator-setup card in the meeting panel must clear only the setup card, not a question card shown beside it.",
);

console.log("Plugin connection action contract passed.");
