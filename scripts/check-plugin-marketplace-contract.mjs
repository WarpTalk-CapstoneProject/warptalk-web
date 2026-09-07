import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const page = readFileSync(
  join(root, "src/components/assistant/plugins/plugins-page.tsx"),
  "utf8",
);
const personalRoute = readFileSync(
  join(root, "src/app/(app)/settings/plugins/page.tsx"),
  "utf8",
);
const legacyWorkspaceRoute = readFileSync(
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

// The empty state exists so a filter that matches nothing does not look like a broken page.
// Its wording is part of the contract now: the box is a client-side filter over the catalog the
// page already fetched, and copy that reads as "we searched and found nothing" claims a
// marketplace search that does not exist behind it.
if (!page.includes("No plugin in this catalog matches")) {
  throw new Error("Plugins page must render an empty state when the filter matches nothing.");
}
if (!page.includes("It does not search a wider marketplace.")) {
  throw new Error(
    "The empty state must say the box only filters the fetched catalog. There is no marketplace search behind it, and the copy must not imply one.",
  );
}
for (const token of ['placeholder="Search plugins"', "Clear search"]) {
  if (page.includes(token)) {
    throw new Error(
      `Plugins page must not call the client-side filter a search ('${token}') — it queries nothing.`,
    );
  }
}

// A row keyed on anything but the catalog key means the page has invented an identity again.
// Every action on that row (install/connect/disconnect/remove) is sent as `pluginKey: plugin.key`,
// so an id the backend does not know is a row whose buttons cannot work.
if (!page.includes("key={plugin.key}")) {
  throw new Error("Plugins page must key catalog rows on the real plugin key.");
}
if (page.includes("tileId") || page.includes("toDisplayTiles")) {
  throw new Error(
    "Plugins page must not split a catalog row into display tiles; the catalog ships one row per product.",
  );
}

// One Google connection backs several plugin rows, and consent can be granted for some and
// declined for others — so "installed and connected" is not on its own enough to promise the
// plugin works. See src/lib/assistant/plugin-connection.ts.
if (!page.includes("withEffectiveConnectionStatus")) {
  throw new Error(
    "Plugins page must resolve connection status through withEffectiveConnectionStatus, so a plugin whose own scopes were declined does not read as Connected.",
  );
}

if (!personalRoute.includes("@/components/assistant/plugins/plugins-page")) {
  throw new Error("Personal /settings/plugins route must render the plugins page component.");
}

if (!legacyWorkspaceRoute.includes('redirect("/settings/plugins")')) {
  throw new Error("Workspace-shaped plugins route must redirect to the personal plugins route.");
}

console.log("Plugin marketplace contract passed.");
