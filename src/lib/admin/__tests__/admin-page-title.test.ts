import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ADMIN_PAGE_LABEL_KEYS, adminPageLabelKey } from "../admin-page-title.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

test("each admin page is titled by its own nav label, and only /admin is Insights", () => {
  assert.equal(adminPageLabelKey("/admin"), "insights");
  assert.equal(adminPageLabelKey("/admin/providers"), "providers");
  assert.equal(adminPageLabelKey("/admin/packages"), "packages");
  assert.equal(adminPageLabelKey("/admin/finance/expenses"), "operatingCosts");
  assert.equal(adminPageLabelKey("/admin/inbox"), "inbox");
  assert.equal(adminPageLabelKey("/admin/staff"), "staff");
  assert.equal(adminPageLabelKey("/admin/roles"), "roles");
  assert.equal(adminPageLabelKey("/admin/email-templates/welcome"), "emailTemplates");
  assert.equal(adminPageLabelKey("/admin/some-future-page"), null, "an unknown page is untitled, not Insights");
  assert.equal(adminPageLabelKey("/acme/rooms"), null);
});

test("every admin route directory has a title, and every title is a real nav label in en/vi/ja", () => {
  const adminDir = path.join(root, "src/app/(app)/admin");
  const routes = fs.readdirSync(adminDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const route of routes) {
    assert.ok(ADMIN_PAGE_LABEL_KEYS[route], `/admin/${route} has no entry in ADMIN_PAGE_LABEL_KEYS`);
  }
  for (const locale of ["en", "vi", "ja"]) {
    const items = JSON.parse(fs.readFileSync(path.join(root, `messages/${locale}/common.json`), "utf8")).sidebar.adminNav.items;
    for (const key of [...Object.values(ADMIN_PAGE_LABEL_KEYS), "insights"]) {
      assert.ok(items[key], `common.sidebar.adminNav.items.${key} is missing in ${locale}`);
    }
  }
});
