import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const page = readFileSync(
  join(root, "src/app/(app)/[workspaceSlug]/settings/plugins/page.tsx"),
  "utf8",
);

const forbidden = [
  "activeWorkspaceId",
  "Public",
  "Personal",
  "const plugins = [",
  "const pluginCatalog = [",
];

for (const token of forbidden) {
  if (page.includes(token)) {
    throw new Error(`Plugins page must not contain '${token}'.`);
  }
}

for (const token of [
  "useAssistantPlugins",
  "useInstallAssistantPlugin",
  "usePluginConnectUrl",
  "useDisconnectAssistantPlugin",
  "useDisableAssistantPlugin",
]) {
  if (!page.includes(token)) {
    throw new Error(`Plugins page must use API hook '${token}'.`);
  }
}

// A plugin the user cannot disconnect or remove is a one-way door, and with no
// token refresh it is the only way back from a dead connection.
for (const [label, handler] of [
  ["Disconnect", "onDisconnect"],
  ["Remove", "onRemove"],
]) {
  if (!page.includes(label) || !page.includes(handler)) {
    throw new Error(`Plugins page must offer a '${label}' action wired to '${handler}'.`);
  }
}

if (!page.includes("No plugins match")) {
  throw new Error("Plugins page must render an empty state when the search matches nothing.");
}

console.log("Plugin marketplace contract passed.");
