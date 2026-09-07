import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const actionCard = read("src/components/layout/plugin-connection-action-card.tsx");
assertIncludes(
  actionCard,
  "parsePluginConnectionAction",
  "Plugin connection action card module must export a parser for AssistantQuestion payloads.",
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

const globalWidget = read("src/components/layout/global-chatbot.tsx");
assertIncludes(
  globalWidget,
  "parsePluginConnectionAction",
  "Global WarpBot widget must parse plugin connection action payloads.",
);
assertIncludes(
  globalWidget,
  "<PluginConnectionActionCard",
  "Global WarpBot widget must render plugin connection action cards.",
);
assertIncludes(
  globalWidget,
  "usePluginConnectUrl",
  "Global WarpBot widget must use the existing connect-url hook.",
);
assertNotIncludes(
  globalWidget,
  "/settings/plugins/",
  "Global WarpBot widget must not depend on a workspace-scoped plugin route.",
);

const roomChat = read("src/components/rooms/live/chat-panel.tsx");
assertIncludes(
  roomChat,
  "parsePluginConnectionAction",
  "Room chat must parse plugin connection action payloads.",
);
assertIncludes(
  roomChat,
  "<PluginConnectionActionCard",
  "Room chat must render plugin connection action cards.",
);
assertIncludes(
  roomChat,
  "usePluginConnectUrl",
  "Room chat must use the existing connect-url hook.",
);
assertIncludes(
  roomChat,
  "setAssistantQuestionsJson(null)",
  "Room chat dismissal must clear the pending action locally.",
);

console.log("Plugin connection action contract passed.");
