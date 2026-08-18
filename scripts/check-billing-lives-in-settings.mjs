#!/usr/bin/env node
/**
 * Billing is a Workspace Settings page, and every route to it says so.
 *
 * WT-380: Billing sat on the app's main sidebar, beside Meetings and Documents, as though a credit
 * balance were a place you go to do work. It belongs with the other things an owner configures
 * once — under Settings, which is where the nav now puts it.
 *
 * WHY THIS IS A CONTRACT AND NOT JUST A MOVED FILE
 *   The sidebar picks which of its two trees to render from the pathname: `isSettingsPage`. So the
 *   nav entry and the URL are one decision, not two. A Billing row inside the settings nav that
 *   still pointed at `/{slug}/billing` would swap the entire sidebar back to the main app nav the
 *   instant it was pressed — the row would vanish from under the cursor that clicked it. That bug
 *   is invisible in a diff and obvious in the browser, which is exactly the kind this repo pins.
 *
 *   The reverse failure is just as easy: someone adds a "Billing" link somewhere new next month and
 *   reaches for the address they remember. The last check below scans for that.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const sidebar = read("src/components/layout/linear-sidebar.tsx");
const proxy = read("src/proxy.ts");
const settingsBillingPage = "src/app/(app)/[workspaceSlug]/settings/billing/page.tsx";
const legacyBillingRoute = "src/app/(app)/[workspaceSlug]/billing";

/**
 * The `workspaceNav` array is the main sidebar's second group. Slicing to it rather than searching
 * the whole file matters: the platform-admin nav further down has its own Billing row at
 * `/admin/billing`, which is a different product surface and must stay.
 */
const workspaceNavBlock = sidebar.slice(
  sidebar.indexOf("const workspaceNav: NavItem[] = []"),
  sidebar.indexOf("const isSettingsPage"),
);

/** Any in-app link to the old slugged address: `${slug}/billing`, `${base}/billing`, and friends. */
const OLD_ADDRESS = /\}\/billing[`"']/;

/**
 * Comments are stripped first. Several files here explain WHY the old address is gone, quoting it
 * to do so — and a check that cannot tell an explanation from a link would force the explanation
 * out, which is the wrong trade.
 */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(join(root, dir))) {
    const relative = join(dir, entry);
    if (statSync(join(root, relative)).isDirectory()) {
      sourceFiles(relative, found);
    } else if (/\.tsx?$/.test(entry)) {
      found.push(relative);
    }
  }
  return found;
}

const staleLinks = sourceFiles("src").filter((file) =>
  OLD_ADDRESS.test(withoutComments(read(file))),
);

const checks = [
  ["the page lives under settings", existsSync(join(root, settingsBillingPage))],
  [
    // In the proxy, not in a page. A page-level redirect under this app's client layout streams
    // the shell first and Next downgrades it to a 200 with a client-side navigation, which the
    // login bounce cannot honour — a signed-out visitor would land back on the dead address.
    "the old address forwards from the proxy",
    proxy.includes("/settings/billing`, request.url)") &&
      /\^\\\/\(\[\^\/\]\+\)\\\/billing/.test(proxy),
  ],
  [
    "the platform-admin billing surface is exempt from that forward",
    proxy.includes('!== "admin"'),
  ],
  [
    "no page shadows the forward at the old address",
    !existsSync(join(root, legacyBillingRoute)),
  ],
  ["Billing is gone from the main workspace nav", !workspaceNavBlock.includes('label: "Billing"')],
  [
    "the expanded settings nav offers Billing",
    sidebar.includes("/settings/billing`} className=\"flex items-center gap-2.5"),
  ],
  [
    "the collapsed settings rail offers Billing",
    /settingsItems\.push\(\{[\s\S]{0,120}label: "Billing"/.test(sidebar),
  ],
  [
    "the settings chrome survives the trip to /payment/plans",
    sidebar.includes('pathname.includes("/payment")'),
  ],
  [
    "platform admin keeps its own Billing surface",
    sidebar.includes('href: "/admin/billing"'),
  ],
  [
    `no source file links to the old address (${staleLinks.join(", ") || "none"})`,
    staleLinks.length === 0,
  ],
];

for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
