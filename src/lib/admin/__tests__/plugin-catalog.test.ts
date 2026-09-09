import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  catalogOwnsOAuthClient,
  catalogRowCannotConnect,
  EMPTY_NEW_PLUGIN_DRAFT,
  formatToolManifest,
  isReservedPluginKey,
  parseToolManifest,
  RESERVED_PLUGIN_KEYS,
  supportsRediscovery,
  toCreatePluginRequest,
  validateNewPlugin,
} from "../plugin-catalog.ts";
import type { NewPluginDraft } from "../plugin-catalog.ts";

type Row = Parameters<typeof catalogRowCannotConnect>[0];

const mcpRow = (over: Partial<Row> = {}): Row => ({
  kind: "mcp",
  oAuthClientSource: "preregistered",
  hasClientId: true,
  ...over,
});

describe("WT-646 — the row that cannot connect", () => {
  test("a pre-registered MCP row with no client id is the warning", () => {
    // The production condition: the consent URL is built with client_id= and the provider
    // refuses it, with nothing on any screen saying why.
    assert.equal(catalogRowCannotConnect(mcpRow({ hasClientId: false })), true);
  });

  test("a pre-registered row that has its client id is fine", () => {
    assert.equal(catalogRowCannotConnect(mcpRow()), false);
  });

  test("cimd, dcr and unresolved rows without an id are not flagged", () => {
    // They obtain a client at connect time, or have not tried yet. Flagging them would put the
    // badge on every new row, which is a badge nobody reads.
    for (const source of ["cimd", "dcr", "unresolved"] as const) {
      assert.equal(
        catalogRowCannotConnect(mcpRow({ oAuthClientSource: source, hasClientId: false })),
        false,
        `${source} must not be flagged`,
      );
    }
  });

  test("a native row is never flagged, whatever its columns say", () => {
    // Its credentials are environment configuration. This screen can neither see them nor fix
    // them, so it must not claim the row is broken — or that it is fine.
    assert.equal(
      catalogRowCannotConnect(mcpRow({ kind: "native", hasClientId: false })),
      false,
    );
  });
});

describe("WT-646 — what the catalog row owns", () => {
  test("only an MCP row's OAuth client lives in the catalog", () => {
    assert.equal(catalogOwnsOAuthClient("mcp"), true);
    // The server refuses PUT .../oauth on a native row; offering the form would let an operator
    // type a client id, watch it save, and believe an outage fixed.
    assert.equal(catalogOwnsOAuthClient("native"), false);
  });

  test("only an MCP row walks the registration ladder, so only it can rediscover", () => {
    assert.equal(supportsRediscovery("mcp"), true);
    assert.equal(supportsRediscovery("native"), false);
  });
});

const validTool = {
  name: "drive.search",
  label: "Search Drive",
  description: "Finds files in the connected Drive account.",
  effect: "read",
  requiredScopes: ["https://www.googleapis.com/auth/drive.readonly"],
  parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
};

describe("WT-646 — the tool manifest is checked before it is sent", () => {
  test("a well-formed manifest parses", () => {
    const result = parseToolManifest(JSON.stringify([validTool]));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0]!.name, "drive.search");
  });

  test("an empty array is a valid manifest — it clears the tools", () => {
    const result = parseToolManifest("[]");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.tools, []);
  });

  test("empty text is refused rather than read as a clear", () => {
    // Clearing is spelled [], which cannot be typed by accident. A blank box is a mistake.
    const result = parseToolManifest("   ");
    assert.equal(result.ok, false);
  });

  test("a JSON object, rather than an array, is refused", () => {
    const result = parseToolManifest(JSON.stringify(validTool));
    assert.equal(result.ok, false);
  });

  test("every problem is reported at once, not just the first", () => {
    const result = parseToolManifest(
      JSON.stringify([{ name: "", label: "", description: "", effect: "sideways" }]),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    // name, label, description, effect, requiredScopes, parameters.
    assert.ok(
      result.errors.length >= 6,
      `expected every failure, got ${result.errors.length}: ${result.errors.join(" | ")}`,
    );
  });

  test("an effect outside read/write is refused", () => {
    // 'write' is what makes a call require confirmation. A tool that should be write and says
    // read executes a side effect with nobody asked.
    const result = parseToolManifest(JSON.stringify([{ ...validTool, effect: "read-write" }]));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.some((error) => error.includes("'effect'")));
  });

  test("duplicate names are caught case-insensitively", () => {
    const result = parseToolManifest(
      JSON.stringify([validTool, { ...validTool, name: "Drive.Search" }]),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.some((error) => error.includes("duplicate")));
  });

  test("a required argument that is not declared in properties is caught", () => {
    // The manifest bug that costs the most to find: the model is told an argument is mandatory
    // and given no schema for it, so it invents one and the gateway rejects the call.
    const result = parseToolManifest(
      JSON.stringify([
        {
          ...validTool,
          parameters: { type: "object", properties: {}, required: ["query"] },
        },
      ]),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.some((error) => error.includes("not declared in 'properties'")));
  });

  test("missing requiredScopes is refused, an empty array is not", () => {
    const withoutScopes: Record<string, unknown> = { ...validTool };
    delete withoutScopes.requiredScopes;
    assert.equal(parseToolManifest(JSON.stringify([withoutScopes])).ok, false);
    assert.equal(parseToolManifest(JSON.stringify([{ ...validTool, requiredScopes: [] }])).ok, true);
  });

  test("invalid JSON comes back as one readable problem, not a thrown error", () => {
    const result = parseToolManifest("[{ name: 'drive.search' }]");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errors.length, 1);
  });
});

describe("WT-646 — the split-era resource fields are gone for good", () => {
  // google_workspace was a single row the frontend split into a Drive tile and a Calendar tile off
  // `tool.resourceKey`. That split is gone — three real catalog rows replaced it, and migration
  // 20260907100000 stripped the three keys out of every stored tool. What kept them alive on this
  // side was the parser stamping them back on: the server still accepts them, so every manifest
  // save quietly rewrote three dead keys into tools_json.
  test("a parsed tool carries only the six fields a manifest is made of", () => {
    const result = parseToolManifest(JSON.stringify([validTool]));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(Object.keys(result.tools[0]!).sort(), [
      "description",
      "effect",
      "label",
      "name",
      "parameters",
      "requiredScopes",
    ]);
  });

  test("a resourceKey pasted into the editor is dropped rather than saved back", () => {
    const result = parseToolManifest(
      JSON.stringify([
        { ...validTool, resourceKey: "drive", resourceLabel: "Drive", resourceAvatarUrl: "/d.png" },
      ]),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const submitted = JSON.stringify(result.tools);
    for (const dead of ["resourceKey", "resourceLabel", "resourceAvatarUrl"]) {
      assert.ok(!submitted.includes(dead), `${dead} must not reach the request: ${submitted}`);
    }
  });
});

describe("WT-646 — the manifest the editor is seeded with", () => {
  test("pluginKey is stripped, because the server stamps it from the route", () => {
    // A manifest naming another row's key would route tool calls at the wrong plugin — a failure
    // that surfaces at chat time, nowhere near the edit that caused it.
    const text = formatToolManifest([{ ...validTool, pluginKey: "google_drive" }]);
    assert.ok(!text.includes("pluginKey"), text);
    assert.ok(text.includes("drive.search"));
  });

  test("the dead resource keys are stripped too", () => {
    // The C# tool record still declares them with a null default and the API serialises nulls, so
    // the wire carries "resourceKey": null on every tool. Rendering those would show an operator
    // three fields that mean nothing and invite one of them to be filled in.
    const text = formatToolManifest([
      { ...validTool, pluginKey: "google_drive", resourceKey: null, resourceLabel: null },
    ]);
    assert.ok(!text.includes("resourceKey"), text);
    assert.ok(!text.includes("resourceLabel"), text);
  });

  test("what comes out of the editor goes back in", () => {
    const result = parseToolManifest(formatToolManifest([{ ...validTool, pluginKey: "x" }]));
    assert.equal(result.ok, true);
  });
});

// ── Adding a row ─────────────────────────────────────────────────────────────

const existingRows = [
  { pluginKey: "google_drive", provider: "google", label: "Google Drive" },
  { pluginKey: "linear", provider: "linear", label: "Linear" },
];

const draft = (over: Partial<NewPluginDraft> = {}): NewPluginDraft => ({
  ...EMPTY_NEW_PLUGIN_DRAFT,
  pluginKey: "notion",
  label: "Notion",
  description: "Search and read pages in the connected Notion workspace.",
  mcpServerUrl: "https://mcp.notion.com/sse",
  ...over,
});

describe("WT-646 — a new catalog row is checked before it is sent", () => {
  test("a complete draft has nothing to report", () => {
    assert.deepEqual(validateNewPlugin(draft(), existingRows), {});
  });

  test("the reserved keys are refused at the box, not by a 400", () => {
    // The create endpoint answers a reserved key, a duplicate key and a provider collision with
    // the same status and the same error code, so a server refusal cannot be attached to a field.
    for (const reserved of RESERVED_PLUGIN_KEYS) {
      const errors = validateNewPlugin(draft({ pluginKey: reserved }), existingRows);
      assert.ok(errors.pluginKey, `${reserved} must be refused`);
      assert.ok(errors.pluginKey!.includes("reserved"));
    }
    // Route matching is case-insensitive, so the check has to be too.
    assert.ok(validateNewPlugin(draft({ pluginKey: "Catalog" }), existingRows).pluginKey);
    assert.equal(isReservedPluginKey("  MCP  "), true);
    assert.equal(isReservedPluginKey("mcp_server"), false);
  });

  test("a key another row already holds is caught from the loaded listing", () => {
    const errors = validateNewPlugin(draft({ pluginKey: "linear" }), existingRows);
    assert.ok(errors.pluginKey?.includes("already exists"));
  });

  test("a key that collides with an existing PROVIDER is caught, and says why", () => {
    // An MCP row takes its key as its provider, and a provider is the identity of a user's OAuth
    // grant — so a row keyed 'google' would be handed the existing Google connection, refresh
    // token and all, and would run its tools against that grant.
    const errors = validateNewPlugin(draft({ pluginKey: "google" }), existingRows);
    assert.ok(errors.pluginKey?.includes("provider"));
    assert.ok(errors.pluginKey?.includes("Google Drive"));
  });

  test("http, or anything that is not an absolute https URL, is refused", () => {
    for (const url of ["http://mcp.example.com", "mcp.example.com", "ftp://x", ""]) {
      assert.ok(
        validateNewPlugin(draft({ mcpServerUrl: url }), existingRows).mcpServerUrl,
        `${url || "(blank)"} must be refused`,
      );
    }
  });

  test("label and description are required, because the columns are NOT NULL", () => {
    assert.ok(validateNewPlugin(draft({ label: "   " }), existingRows).label);
    assert.ok(validateNewPlugin(draft({ description: "" }), existingRows).description);
  });

  test("an OAuth endpoint typed without a client id is refused rather than silently ignored", () => {
    // Only a client id moves the row off 'unresolved'. Endpoints sent without one would be stored
    // and then never read, which is the kind of write that looks like it worked.
    const errors = validateNewPlugin(
      draft({ tokenEndpoint: "https://auth.example.com/token" }),
      existingRows,
    );
    assert.ok(errors.clientId);
  });

  test("an OAuth endpoint that is not https is refused", () => {
    const errors = validateNewPlugin(
      draft({ clientId: "abc", tokenEndpoint: "auth.example.com/token" }),
      existingRows,
    );
    assert.ok(errors.tokenEndpoint);
  });
});

describe("WT-646 — the create request the draft becomes", () => {
  test("blank optional fields are omitted, not sent as empty strings", () => {
    const request = toCreatePluginRequest(draft());
    assert.deepEqual(Object.keys(request).sort(), [
      "description",
      "label",
      "mcpServerUrl",
      "pluginKey",
    ]);
    // An empty avatarUrl would be stored as an empty avatar rather than as no avatar, and an empty
    // oAuth.clientId is the exact value that put a `client_id=` consent URL into production.
    assert.equal("avatarUrl" in request, false);
    assert.equal("oAuth" in request, false);
  });

  test("scopes are split, trimmed and de-duplicated", () => {
    const request = toCreatePluginRequest(
      draft({ requiredScopes: "read:issues\n write:issues , read:issues\n\n" }),
    );
    assert.deepEqual(request.requiredScopes, ["read:issues", "write:issues"]);
  });

  test("the OAuth block travels as `oAuth`, and only when a client id was typed", () => {
    // Not `oauth`: JsonSerializerDefaults.Web lowercases only the leading run of capitals before
    // another capital, so C#'s `OAuth` is `oAuth` on the wire — the same rule that produces
    // `oAuthClientSource` on the way back.
    const request = toCreatePluginRequest(
      draft({ clientId: " abc123 ", clientSecret: "s3cret", tokenEndpoint: " https://a/t " }),
    );
    assert.equal(request.oAuth?.clientId, "abc123");
    assert.equal(request.oAuth?.clientSecret, "s3cret");
    assert.equal(request.oAuth?.tokenEndpoint, "https://a/t");
    assert.equal(request.oAuth?.authorizationEndpoint, undefined);
    assert.ok(JSON.stringify(request).includes('"oAuth"'));
  });

  test("a blank secret is absent rather than an empty string", () => {
    // At create time there is no stored secret to keep or clear, so a blank box means a public
    // client — and "" would be a secret of zero length.
    const request = toCreatePluginRequest(draft({ clientId: "abc" }));
    assert.equal(request.oAuth?.clientSecret, undefined);
    assert.ok(!JSON.stringify(request).includes("clientSecret"));
  });
});
