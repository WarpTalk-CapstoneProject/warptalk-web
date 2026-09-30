import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  PLUGIN_BRAND_ICONS,
  pluginBrandIcon,
  pluginIconSources,
  pluginInitials,
} from "../plugin-brand-icons.ts";

// The remote MCP apps assistant migration 20260917130000 seeds into the marketplace. They drew as
// letter tiles (L, N, AJ, A, M, C, Z) on every surface, /admin/plugins included.
const SEEDED_MCP_APPS = ["linear", "notion", "atlassian", "asana", "monday", "canva", "zapier"];

describe("plugin brand icons", () => {
  test("every seeded marketplace app has a bundled brand mark, and the file ships", () => {
    for (const key of SEEDED_MCP_APPS) {
      const src = pluginBrandIcon(key);
      assert.ok(src, `${key} has no brand icon`);
      const file = join(process.cwd(), "public", src);
      assert.ok(existsSync(file), `${src} is not in public/`);
      const svg = readFileSync(file, "utf8");
      assert.match(svg, /<svg[\s>]/, `${src} is not an SVG`);
      // Served from our own origin: nothing in it may run or reach out.
      assert.doesNotMatch(svg, /<script|\son[a-z]+=|href="https?:/i, `${src} carries script or a remote reference`);
    }
  });

  test("the Google rows keep the marks their seeded avatars already point at", () => {
    assert.equal(pluginBrandIcon("google_drive"), "/assets/plugins/google-drive.svg");
    assert.equal(Object.keys(PLUGIN_BRAND_ICONS).length, SEEDED_MCP_APPS.length + 3);
  });

  test("a private plugin never borrows a marketplace app's mark", () => {
    assert.equal(pluginBrandIcon("ws_linear_1a2b3c4d"), null);
    assert.equal(pluginBrandIcon(""), null);
    assert.equal(pluginBrandIcon("constructor"), null);
  });

  test("the row's own avatar wins, the brand mark is the fallback, and neither is tried twice", () => {
    assert.deepEqual(pluginIconSources({ key: "notion", avatarUrl: "https://cdn.example/n.png" }), [
      "https://cdn.example/n.png",
      "/assets/plugins/notion.svg",
    ]);
    // Admin rows name the key pluginKey.
    assert.deepEqual(pluginIconSources({ pluginKey: "canva", avatarUrl: null }), ["/assets/plugins/canva.svg"]);
    assert.deepEqual(pluginIconSources({ key: "notion", avatarUrl: "/assets/plugins/notion.svg" }), [
      "/assets/plugins/notion.svg",
    ]);
    assert.deepEqual(pluginIconSources({ key: "ws_crm_1a2b3c4d", avatarUrl: "  " }), []);
  });

  test("initials are the last resort", () => {
    assert.equal(pluginInitials("Atlassian Jira & Confluence"), "AJ");
    assert.equal(pluginInitials("  "), "");
  });
});
