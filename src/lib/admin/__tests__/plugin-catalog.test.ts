import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  catalogOwnsOAuthClient,
  catalogRowCannotConnect,
  formatToolManifest,
  parseToolManifest,
  supportsRediscovery,
} from "../plugin-catalog.ts";

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

describe("WT-646 — the manifest the editor is seeded with", () => {
  test("pluginKey is stripped, because the server stamps it from the route", () => {
    // A manifest naming another row's key would route tool calls at the wrong plugin — a failure
    // that surfaces at chat time, nowhere near the edit that caused it.
    const text = formatToolManifest([{ ...validTool, pluginKey: "google_drive" }]);
    assert.ok(!text.includes("pluginKey"), text);
    assert.ok(text.includes("drive.search"));
  });

  test("what comes out of the editor goes back in", () => {
    const result = parseToolManifest(formatToolManifest([{ ...validTool, pluginKey: "x" }]));
    assert.equal(result.ok, true);
  });
});
