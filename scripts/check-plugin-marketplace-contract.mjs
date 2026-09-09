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
// THE CONSENT ROUND TRIP HAS TO COME BACK
//
// The assistant service's OAuth callbacks 302 the browser to a bare `{AppBaseUrl}/settings/plugins`
// — no ?connected=, no ?error=, nothing to read (AssistantPluginsController). Their own remark says
// the page re-reads connection status instead, and for a while the page did not: the connect-url
// mutation invalidated nothing, `staleTime: 60_000` meant the global refetchOnWindowFocus stayed
// quiet for a minute, and the "Finish connecting" banner had exactly one state. A user who
// cancelled at Google saw the same screen as a user who succeeded, indefinitely.
// ---------------------------------------------------------------------------------------------
for (const token of ["visibilitychange", '"focus"']) {
  if (!page.includes(token)) {
    throw new Error(
      `Plugins page must notice the user coming back from the provider ('${token}'). The redirect carries no query string, so returning to this tab is the only signal there is.`,
    );
  }
}
if (!/await refetch\(\)/.test(page)) {
  throw new Error(
    "The return from consent must refetch the catalog, not invalidate it: staleTime is 60s and a consent round trip fits comfortably inside that, so a cached pre-consent answer would be served back.",
  );
}
if (!page.includes('data-testid="plugin-consent-notice"')) {
  throw new Error("The connect banner must be findable, so its terminal states can be asserted.");
}
// The banner's terminal states are the point. Without them a cancelled consent is indistinguishable
// from a successful one, which is where this started.
for (const phase of ["unconfirmed", "partial", "blocked"]) {
  if (!page.includes(`"${phase}"`)) {
    throw new Error(
      `The connect banner must be able to end in '${phase}'. A banner that only ever says "finish this in your browser" tells a user who cancelled nothing at all.`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// THE DIALOG READS THE LIVE ROW, NOT A SNAPSHOT OF IT
//
// Holding the plugin OBJECT in state froze the dialog at the moment it opened: the catalog could
// refetch underneath it and the dialog would still offer "Continue to ..." for a plugin that was
// now connected, with no Disconnect button. The key is the identity; the row is looked up.
// ---------------------------------------------------------------------------------------------
if (!page.includes("plugin.key === selectedPluginKey")) {
  throw new Error(
    "The plugin dialog must look its row up in the live catalog by key. Storing the row itself makes the dialog a snapshot that no refetch can update.",
  );
}

// ---------------------------------------------------------------------------------------------
// DISCONNECT READS THE GRANT, NOT THE PLUGIN'S USABILITY
//
// withEffectiveConnectionStatus downgrades a row to not_connected when the user declined one of its
// scopes at the consent screen. That is right for labels and wrong for revocation: the grant is
// still live, and reading the downgraded status is what took the Disconnect button — and the
// disconnect inside Remove — away from the one user who most needs them.
// ---------------------------------------------------------------------------------------------
if (!page.includes("providerConnectionStatus={selectedPlugin.connectionStatus}")) {
  throw new Error(
    "The dialog must be handed the RAW connectionStatus for the Disconnect button; the effective status hides a live OAuth grant from the user holding it.",
  );
}
if (!page.includes("plugin={withEffectiveConnectionStatus(selectedPlugin)}")) {
  throw new Error(
    "The dialog's labels must still read the effective status: a plugin whose own scope was declined must not claim it is connected.",
  );
}
if (!page.includes("hasProviderGrant ? (")) {
  throw new Error(
    "The Disconnect button must be gated on the grant existing, not on the plugin being usable.",
  );
}

// ---------------------------------------------------------------------------------------------
// WORKSPACE PLUGIN POLICY
//
// A blocked row is returned by the catalog rather than hidden, deliberately: it may be holding a
// live OAuth grant, and this page is where it gets revoked. So the row stays, adding it goes dead,
// and disconnect and remove do not.
// ---------------------------------------------------------------------------------------------
// The whole branch below is dead unless the LISTING names a workspace. `workspacePolicyBlockReason`
// is populated only when `GET /assistant/plugins` is called with a workspaceId; without one the
// server applies no policy at all, every row comes back with the field absent, and the notice, the
// disabled Add button and the "Manage" label are unreachable code that reads as a shipped feature.
//
// `activeWorkspaceId` used to be a FORBIDDEN token here, from when the fix was to stop scoping the
// catalog to a workspace — the [workspaceSlug] route redirects to /settings/plugins for that
// reason, and it still does. Naming the workspace is not scoping the list to it: the catalog stays
// personal, the rows are the same rows, and the workspace only supplies its verdict on them.
if (!page.includes("state.activeWorkspaceId")) {
  throw new Error(
    "Plugins page must read the active workspace from the workspace store; without it every row's workspacePolicyBlockReason is absent and the policy branch below can never render.",
  );
}
if (!page.includes("useAssistantPlugins(workspaceId)")) {
  throw new Error(
    "Plugins page must pass the active workspace to useAssistantPlugins — an unscoped listing carries no policy verdict.",
  );
}
// Install and connect must be sent under the same workspace the refusal was read from, or the page
// disables a button the server would have happily honoured, and honours one it would have refused.
//
// Matched on the call rather than on one exact line: the connect call also carries which surface
// asked for it, so it spans several lines now. Pinning the formatting would have made a second
// argument a contract break, which is not what this check is about.
for (const call of ["installPlugin.mutateAsync", "connectUrl.mutateAsync"]) {
  const start = page.indexOf(`${call}({`);
  const args = start < 0 ? "" : page.slice(start, page.indexOf("})", start));
  if (!args.includes("workspaceId")) {
    throw new Error(
      `Plugins page must send the workspace with the actions the workspace can refuse ('${call}' must pass workspaceId), so its own guard and the server's agree.`,
    );
  }
}
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
// "Featured" sat above the whole catalog and nothing selected the rows under it. isFeatured and
// sortOrder reach the user-facing DTO since WT-646, so the ordering can be curated — but the page
// still renders one list, and heading all of it "Featured" would be the same untrue claim.
//
// The ordering assertions are the point: if a refactor drops isFeatured or sortOrder from the sort,
// an operator's curation silently stops having any effect, which is invisible on screen.
// ---------------------------------------------------------------------------------------------
if (/<h2[^>]*>Featured<\/h2>/.test(page)) {
  throw new Error(
    "Plugins page must not head the whole catalog 'Featured' — it lists every row, featured or not.",
  );
}
// Matched as a property read off the comparator's own arguments, not as a bare word: the field
// names appear in the prose above the sort too, and `page.includes("isFeatured")` was satisfied by
// that comment even with the comparison deleted — an assertion that cannot fail.
for (const field of ["isFeatured", "sortOrder"]) {
  if (!new RegExp(`[ab]\\.${field}\\b`).test(page)) {
    throw new Error(
      `The catalog ordering must honour \`${field}\` in the comparator; without it an operator's curation is stored and silently ignored.`,
    );
  }
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
