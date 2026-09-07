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

// ---------------------------------------------------------------------------------------------
// SILENT DATA LOSS: one disconnect ends the grant behind several plugins
//
// A connection is keyed by provider, not by plugin key, so DisconnectAsync ends the Google grant
// and Drive, Calendar and Meet all go with it. A user disconnecting Drive to tidy up used to lose
// the other two without ever being told. This block is a guard against that warning being
// refactored away in a tidy-up of its own — the dialog looks perfectly reasonable without it.
// ---------------------------------------------------------------------------------------------
for (const token of ["pluginsSharingConnection", "sharedConnectionWarning"]) {
  if (!page.includes(token)) {
    throw new Error(
      `Plugins page must call '${token}': disconnecting one plugin ends the shared OAuth grant, and the other plugins behind it have to be named before the user confirms, not discovered afterwards.`,
    );
  }
}
if (!page.includes("sharedConnectionPlugins={sharedConnectionPlugins}")) {
  throw new Error(
    "The disconnect dialog must be handed the sibling list; computing it and not passing it warns nobody.",
  );
}
if (!page.includes('data-testid="shared-connection-warning"')) {
  throw new Error(
    "The disconnect/remove confirmation must render the shared-connection warning, not merely compute it.",
  );
}
// The grouping is catalog data. A key or a provider name spelled out here is the frontend
// re-deciding something the catalog already knows, and it is wrong the day a second multi-product
// provider is added or these three rows are renamed.
for (const token of ['"google"', "'google'", "google_drive", "google_calendar", "google_meet"]) {
  if (page.includes(token)) {
    throw new Error(
      `Plugins page must not hardcode '${token}'. Which plugins share a connection is derived from the catalog, by provider.`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// WORKSPACE PLUGIN POLICY
//
// A blocked row is returned by the catalog rather than hidden, deliberately: it may be holding a
// live OAuth grant, and this page is where it gets revoked. So the row stays, adding it goes dead,
// and disconnect and remove do not.
// ---------------------------------------------------------------------------------------------
if (!page.includes("pluginWorkspaceBlock")) {
  throw new Error(
    "Plugins page must read workspacePolicyBlockReason through pluginWorkspaceBlock; a row the workspace refuses cannot look like a row that works.",
  );
}
if (!page.includes('data-testid="workspace-policy-block"')) {
  throw new Error("A row refused by workspace policy must state the reason on the page.");
}
if (!page.includes("isBlockedFromAdding")) {
  throw new Error(
    "The primary action on a row refused by workspace policy must be disabled, not left to fail at the API.",
  );
}
// The one thing this must not do is take away the way out. If either handler stops being reachable
// on a blocked row, a user whose workspace narrowed its allowlist is left holding a grant with no
// button that revokes it.
for (const token of ["onDisconnect={", "onRemove={"]) {
  if (!page.includes(token)) {
    throw new Error(
      `Plugins page must keep '${token}' wired unconditionally — disconnect and remove are never gated by workspace policy.`,
    );
  }
}
// Connecting is the only action in the dialog that workspace policy gates. Spelled out so that
// widening it to the disconnect/remove buttons has to be a deliberate edit here as well.
if (!page.includes("disabled={isConnecting || workspaceBlock !== null}")) {
  throw new Error(
    "In the plugin dialog, workspace policy must gate the connect button and nothing else.",
  );
}

// ---------------------------------------------------------------------------------------------
// The heading has to be true
//
// "Featured" sat above the whole catalog and nothing selected the rows under it. isFeatured,
// sortOrder and category are on the admin catalog DTOs only, so the user-facing page cannot know
// which rows are featured — and a heading that claims a distinction the data cannot make gets more
// wrong with every row added.
// ---------------------------------------------------------------------------------------------
if (/<h2[^>]*>Featured<\/h2>/.test(page)) {
  throw new Error(
    "Plugins page must not head the whole catalog 'Featured'. isFeatured is not on the user-facing catalog DTO, so nothing selects those rows.",
  );
}
if (!page.includes("localeCompare")) {
  throw new Error(
    "The catalog must be ordered by something stable rather than by whatever order the query returned.",
  );
}

if (!personalRoute.includes("@/components/assistant/plugins/plugins-page")) {
  throw new Error("Personal /settings/plugins route must render the plugins page component.");
}

if (!legacyWorkspaceRoute.includes('redirect("/settings/plugins")')) {
  throw new Error("Workspace-shaped plugins route must redirect to the personal plugins route.");
}

console.log("Plugin marketplace contract passed.");
