#!/usr/bin/env node
/**
 * The three promises /admin/plugins makes that nothing else can check.
 *
 * All three are source-level rather than render tests, because all three are wiring: the page
 * typechecks and every unit test passes with any of them broken.
 *
 *  1. THE OAUTH PANEL IS WRITE-ONLY. No endpoint in the catalog API returns a client secret in any
 *     form — not masked, not truncated — so nothing on this screen may render one, and the types
 *     must have nowhere to put one. A "helpful" `clientSecret` on the detail DTO would be an
 *     invitation for the next person to add a read-back field, and the reason none exists is not
 *     visible from the component.
 *
 *  2. THE SECRET IS TRI-STATE, AND "KEEP" IS THE DEFAULT. Omitted leaves the stored secret alone,
 *     "" clears it, a value replaces it. Rotating a client id is the common case; a form that sent
 *     the blank secret box along with it would wipe the secret every time, and — since no endpoint
 *     hands one back — the operator could not put it back. `undefined` therefore has to leave the
 *     client as an ABSENT property, which is what the service's undefined-stripping is for.
 *
 *  3. A NATIVE ROW IS NOT OFFERED WHAT THE SERVER WILL REFUSE. Its OAuth client comes from service
 *     configuration; `PUT .../oauth` and `rediscover` are both refused on one. Rendering them
 *     anyway would let an operator chasing an empty `client_id` in production type one in, watch
 *     it save, and believe the problem fixed — which is a worse outcome than the button not being
 *     there, and close to how the outage this screen exists for went unnoticed.
 *
 *  4. THE EDITABLE FIELDS FOLLOW THE ROW. Every write on this page re-seeds the detail cache in
 *     place, and the sections stay mounted, so a field initialised with `useState(detail.x)` keeps
 *     the value the row held when the page opened. "Re-run discovery" made that visible and
 *     dangerous: the summary above showed the endpoints discovery had found while the boxes below
 *     still held the old ones, and pressing Save wrote the old ones back over them.
 *
 *  5. NO ROW CAN BE EDITED THAT COULD NOT BE CREATED. The screen claimed create/edit/retire while
 *     having no create at all, which left "adding an MCP app is one INSERT, not a deploy" true of
 *     the API and false of the product.
 *
 * Plus the one thing the list is for: the row that cannot connect is visible without opening it,
 * and a retired row is visibly not a live one.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(root, rel), "utf8");

const LIST_PAGE = "src/app/(app)/admin/plugins/page.tsx";
const DETAIL_PAGE = "src/app/(app)/admin/plugins/[pluginKey]/page.tsx";
const TYPES = "src/types/admin-plugin-catalog.ts";
const SERVICE = "src/services/admin-plugin-catalog.service.ts";
const HELPERS = "src/lib/admin/plugin-catalog.ts";
const HOOKS = "src/hooks/use-admin-plugin-catalog.ts";
const ENDPOINTS = "src/lib/api/endpoints.ts";

const [listPage, detailPage, types, service, helpers, hooks, endpoints] = await Promise.all(
  [LIST_PAGE, DETAIL_PAGE, TYPES, SERVICE, HELPERS, HOOKS, ENDPOINTS].map(read),
);

// ── 1 · No secret can be read back, so none can be rendered ──────────────────

// The response types are where a read-back would have to land first.
assert.ok(
  /interface AdminPluginCatalogDetailDto \{[\s\S]*?hasClientSecret: boolean;[\s\S]*?\n\}/.test(types),
  "the detail DTO must expose hasClientSecret — a yes/no is the largest answer that cannot leak a secret",
);
const detailDto = types.match(/interface AdminPluginCatalogDetailDto \{([\s\S]*?)\n\}/)?.[1] ?? "";
assert.ok(detailDto.length > 200, "AdminPluginCatalogDetailDto could not be located in the types");
assert.ok(
  !/^\s*(oAuth)?[cC]lientSecret\??:/m.test(detailDto),
  "no response type may carry a client secret value — the service never returns one, and a field for it is how a read-back gets added by accident",
);

const listDto = types.match(/interface AdminPluginCatalogListItemDto \{([\s\S]*?)\n\}/)?.[1] ?? "";
assert.ok(listDto.length > 100, "AdminPluginCatalogListItemDto could not be located in the types");
assert.ok(
  !/^\s*(oAuth)?[cC]lientSecret\??:/m.test(listDto),
  "the listing type must not carry a client secret value either",
);

// And the page must not reach for one off the loaded row.
assert.ok(
  !/detail\.(oAuth)?[cC]lientSecret\b(?!\s*[?!]?\.?\s*$)/.test(
    detailPage.replace(/detail\.hasClientSecret/g, ""),
  ),
  "the detail page must not read a client secret off the loaded row",
);

// ── 2 · The tri-state, and its default ───────────────────────────────────────

assert.match(
  detailPage,
  /useState<SecretMode>\("keep"\)/,
  '"keep" must be the default secret mode: rotating a client id must not wipe the stored secret because the field beneath it was blank',
);
assert.match(
  detailPage,
  /clientSecret:\s*secretMode === "replace"\s*\?\s*secret\s*:\s*secretMode === "clear"\s*\?\s*""\s*:\s*undefined/,
  "the OAuth submit must express all three states: a value replaces, \"\" clears, undefined leaves the stored secret alone",
);
assert.ok(
  /type="password"/.test(detailPage) && /autoComplete="new-password"/.test(detailPage),
  "the new-secret field must be a password input that browsers will not autofill from a saved credential",
);
assert.match(
  detailPage,
  /setSecret\(""\)/,
  "the typed secret must be dropped from component state once the request carrying it has been sent",
);
assert.match(
  service,
  /setOAuthClient:[\s\S]{0,400}?withoutUndefined\(request\)/,
  "the OAuth request must be stripped of undefined before it is sent, so \"leave the secret alone\" travels as an absent property rather than a null",
);

// ── 3 · A native row is not offered what the server refuses ──────────────────

assert.match(
  detailPage,
  /catalogOwnsOAuthClient\(detail\.kind\)/,
  "the OAuth form must be gated on whether the catalog row owns the client at all",
);
assert.match(
  detailPage,
  /\{!catalogOwns \?/,
  "a native row must be given the explanation instead of the form",
);
assert.match(
  detailPage,
  /supportsRediscovery\(detail\.kind\) \?/,
  "the re-run discovery action must be withheld from a row that never walks the registration ladder",
);
assert.match(
  helpers,
  /export function catalogOwnsOAuthClient\(kind: AdminPluginKind\): boolean \{\s*return kind === "mcp";/,
  "only an MCP row's OAuth client lives in the catalog",
);

// ── 4 · The list shows what the list exists to show ──────────────────────────

assert.match(
  listPage,
  /catalogRowCannotConnect/,
  "the listing must flag the row that cannot connect — that condition is why this screen exists",
);
assert.match(
  listPage,
  /no client id/,
  "the warning must be legible on the row itself, not only in a banner",
);
assert.match(
  listPage,
  /!row\.isActive && "opacity-60"/,
  "a retired row must be visibly quieter than a live one — this listing, unlike the user-facing catalog, shows both",
);

// ── 5 · Nothing fails silently ───────────────────────────────────────────────
//
// The defect this codebase has already shipped once: an action failed, the button did not change,
// no toast appeared, and the only trace was an unhandled rejection in the console.
const awaited = detailPage.match(/await [\w.]*mutateAsync\(/g) ?? [];
const reported = detailPage.match(/reportFailure\(/g) ?? [];
assert.ok(awaited.length >= 5, `expected the detail page to perform writes, found ${awaited.length}`);
assert.ok(
  reported.length >= awaited.length,
  `every write must report its failure to the operator: ${awaited.length} awaited mutation(s), ${reported.length} reportFailure() call(s)`,
);
assert.match(
  detailPage,
  /function reportFailure\([\s\S]{0,200}?toast\.error\(/,
  "a failed write must raise a toast, not merely a console entry",
);

// ── 6 · Every route the API offers is reachable from the client ──────────────

for (const route of ["base", "detail", "oauth", "tools", "rediscover", "audits"]) {
  assert.ok(
    new RegExp(`adminPluginCatalog:[\\s\\S]{0,900}?\\b${route}:`).test(endpoints),
    `API.adminPluginCatalog.${route} must exist — a screen that cannot address an endpoint is the same defect as an endpoint nobody routed`,
  );
}
assert.match(
  service,
  /remove:[\s\S]{0,400}?params: hard \? \{ hard: true \} : undefined/,
  "a hard delete must be asked for explicitly; a soft delete must not carry the flag at all",
);

// ── 7 · The editable fields follow a re-seeded row ───────────────────────────
//
// Source-level because it is wiring: every unit test and the typechecker pass with the OAuth
// endpoints frozen at whatever the row held when the page opened.

assert.match(
  detailPage,
  /function useSeededField/,
  "the editable fields must be seeded through a helper that can re-seed: useState(initialValue) reads its argument once, so a re-seeded detail cache never reaches the boxes below the summary that shows it",
);
for (const [field, seed] of [
  ["clientId", /detail\.oAuthClientId \?\? ""/],
  ["authorizationEndpoint", /detail\.oAuthAuthorizationEndpoint \?\? ""/],
  ["tokenEndpoint", /detail\.oAuthTokenEndpoint \?\? ""/],
  ["revokeEndpoint", /detail\.oAuthRevokeEndpoint \?\? ""/],
]) {
  assert.ok(
    new RegExp(`const ${field} = useSeededField\\(${seed.source}\\)`).test(detailPage),
    `the OAuth '${field}' box must follow the loaded row — otherwise "Re-run discovery" leaves it holding the pre-discovery value and Save writes that straight back over what discovery found`,
  );
}
assert.match(
  detailPage,
  /const manifest = useSeededField\(stored\)/,
  "the manifest editor must follow the loaded row too: a discovery run that reads a new tools/list must not leave the textarea showing the tools it replaced",
);
// The other half of the trade-off. A field somebody is typing into must NOT be overwritten, which
// is only safe to promise if the section can tell the operator its text and the row disagree.
assert.ok(
  /dirty: value !== serverValue/.test(detailPage) && /dirtyCount/.test(detailPage),
  "a field the operator has edited must keep their text and report itself dirty — following the row silently over half-typed input trades one silent data loss for another",
);

// ── 8 · Nothing is left to SQL that the screen claims to do ──────────────────

assert.match(
  service,
  /create:[\s\S]{0,600}?apiClient\.post<RawRecord>\(\s*API\.adminPluginCatalog\.base/,
  "the catalog service must be able to create a row — POST to the same path the listing GETs, which is the endpoint that makes 'adding an MCP app is one INSERT' true",
);
assert.match(
  hooks,
  /export function useCreateAdminPlugin/,
  "a create hook must exist, and must not be a useCatalogWrite: the create endpoint answers with the user-facing catalog item, so there is no detail row to seed the cache with",
);
assert.ok(
  /Add MCP app/.test(listPage) && /NewPluginDialog/.test(listPage),
  "the listing must offer the create action — an admin screen that can edit, re-credential and retire a row it cannot create sends the operator back to psql for the one step that started it all",
);
assert.match(
  helpers,
  /export const RESERVED_PLUGIN_KEYS = \["mcp", "catalog"\]/,
  "the reserved plugin keys must be mirrored from PluginConstants.ReservedPluginKeys so the form refuses them at the box; the server answers them with the same undifferentiated 400 it answers a duplicate key with",
);
assert.match(
  helpers,
  /export function validateNewPlugin/,
  "the create draft must be validated before it is sent, for the same reason the tool manifest is",
);
assert.ok(
  /errorFor\("pluginKey"\)/.test(listPage),
  "the plugin key's refusal must be rendered under the plugin key box, not only as a toast",
);

// ── 9 · The split-era resource fields stay gone ──────────────────────────────
//
// google_workspace was one row the frontend split into a Drive tile and a Calendar tile off
// `tool.resourceKey`. WT-646 replaced that with three real catalog rows and migration
// 20260907100000 deleted the three keys from every stored tool. The C# tool record still declares
// them with a null default, so the wire still carries three nulls per tool — which is exactly how
// they creep back: a field on the manifest type is enough for every save to write them again.
// check-plugin-mention-contract.mjs bans them from the user-facing DTO; this is the admin half.

const toolDto = types.match(/interface AdminPluginToolDto \{([\s\S]*?)\n\}/)?.[1] ?? "";
const manifestEntry =
  types.match(/interface AdminPluginToolManifestEntry \{([\s\S]*?)\n\}/)?.[1] ?? "";
assert.ok(toolDto.length > 100, "AdminPluginToolDto could not be located in the types");
assert.ok(
  manifestEntry.length > 100,
  "AdminPluginToolManifestEntry could not be located in the types",
);

// What parseToolManifest actually emits, rather than what the file mentions in prose.
const emittedTool = helpers.match(/tools\.push\(\{([\s\S]*?)\n {4}\}\);/)?.[1] ?? "";
assert.ok(emittedTool.length > 50, "the tool parseToolManifest emits could not be located");

for (const token of ["resourceKey", "resourceLabel", "resourceAvatarUrl"]) {
  for (const [name, body] of [
    ["AdminPluginToolDto", toolDto],
    ["AdminPluginToolManifestEntry", manifestEntry],
  ]) {
    assert.ok(
      !body.includes(token),
      `${name} must not declare '${token}': the split it grouped for is gone, and a field here is how a dead key gets stamped back onto every tool the manifest editor saves`,
    );
  }
  assert.ok(
    !emittedTool.includes(token),
    `parseToolManifest must not emit '${token}' — the server accepts it and would write it straight back into tools_json`,
  );
}
assert.match(
  helpers,
  /MANIFEST_KEYS_NOT_AUTHORED[\s\S]{0,200}?"resourceKey"/,
  "the manifest editor must strip the dead resource keys as it strips pluginKey: the wire still carries them as nulls, and showing an operator three meaningless fields invites one of them to be filled in",
);

console.log("Admin plugin catalog contract passed.");
