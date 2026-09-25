/**
 * The admin Providers page (/admin/providers): what must stay true, and the defect each line stops.
 *   - It is reachable: a sidebar entry under Operations, labelled in every locale (a page with no
 *     door is how the workspace glossary got deleted).
 *   - It reads only GETs from ~/admin/providers — nothing on it can change a key, a quota or a price.
 *   - It never renders a secret: the configuration list shows the server's set / not-set state, and
 *     no source file under it names an API key or secret variable.
 *   - Honest empties: a null figure is words ("Not tracked"/"Not measured"), the uptime says "not
 *     tracked" instead of a flattering 100%, and gaps in a line are the server's nulls.
 *   - The status row is the shared UptimeBars primitive and the share chart the shared PieChart.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "./lib/strip-comments.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const page = read("src/app/(app)/admin/providers/page.tsx");
assert.match(page, /ProvidersDashboard/, "the route renders the providers dashboard");

const sidebar = read("src/components/layout/linear-sidebar.tsx");
assert.match(
  sidebar,
  /label: t\("adminNav\.items\.systemHealth"\)[\s\S]{0,200}label: t\("adminNav\.items\.providers"\), href: "\/admin\/providers"/,
  "Providers sits under Operations, next to System health",
);
for (const locale of ["en", "vi", "ja"]) {
  const common = JSON.parse(read(`messages/${locale}/common.json`));
  assert.ok(common.sidebar?.adminNav?.items?.providers, `the Providers nav label exists in ${locale}`);
  assert.ok(fs.existsSync(path.join(root, `messages/${locale}/adminProviders.json`)), `adminProviders messages exist in ${locale}`);
}
assert.match(read("src/i18n/request.ts"), /"adminProviders"/, "the adminProviders namespace is loaded");

const service = stripComments(read("src/services/admin-providers.service.ts"));
assert.ok(!/apiClient\.(post|put|patch|delete)\b/.test(service), "the providers service is read-only");
assert.match(read("src/lib/api/endpoints.ts"), /adminProviders:\s*{[\s\S]*base: "\/admin\/providers"/, "the endpoints are registered");

const files = [
  "src/components/admin/providers/providers-dashboard.tsx",
  "src/components/admin/providers/provider-card.tsx",
  "src/components/admin/providers/provider-detail.tsx",
  "src/components/admin/providers/provider-uptime-row.tsx",
];
for (const rel of files) {
  const source = stripComments(read(rel));
  assert.ok(!/(API_KEY|SECRET|apiKey\b|secretKey\b|\.value\b.*password)/.test(source), `${rel} names no secret`);
}

const card = read("src/components/admin/providers/provider-card.tsx");
assert.match(card, /stats\.notTracked|stats\.notMeasured/, "a missing figure is said in words");
assert.match(card, /describeGap=/, "gaps in a line are described, not drawn as 0");
assert.match(card, /display: s\.raw/, "an indexed line still reads out its real value");

const uptime = read("src/components/admin/providers/provider-uptime-row.tsx");
assert.match(uptime, /from "@\/components\/admin\/charts\/uptime-bars"/, "the uptime row uses the shared primitive");
assert.match(uptime, /uptime\.notTracked/, "no signal is 'uptime not tracked', not 100%");

const detail = read("src/components/admin/providers/provider-detail.tsx");
assert.match(detail, /from "@\/components\/admin\/charts\/pie-chart"/, "the share chart uses the shared pie");
assert.match(detail, /configHint/, "the configuration list says it shows state, not values");

console.log("Admin providers contract: PASS");
