import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Frozen credits: an expired workspace keeps what it bought (billing CreditFreezeService), and the
// owner is told so — "X credits kept — renew to use them" — on the one page an expired workspace
// still lands on. The balance endpoint 404s without a live plan, so this number has its own call,
// and the "no plan" state must use it rather than the generic copy that reads as if all was lost.
const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const service = read("src/services/billing.service.ts");
assert.match(
  service,
  /getFrozenCredits:[\s\S]{0,200}?\/credits\/workspace\/\$\{workspaceId\}\/frozen/,
  "billingService must read GET credits/workspace/{id}/frozen.",
);

const billingPage = read("src/app/(app)/[workspaceSlug]/settings/billing/page.tsx");
assert.match(
  billingPage,
  /queryFn: \(\) => billingService\.getFrozenCredits\(workspaceId\)/,
  "The billing page must ask for the workspace's frozen credits.",
);
assert.match(
  billingPage,
  /<BillingNoSubscriptionState workspaceSlug=\{workspaceSlug\} frozen=\{frozen \?\? null\} \/>/,
  "An expired workspace's billing page must be told what it kept.",
);
assert.match(
  billingPage,
  /t\("frozen\.kept", \{ credits:/,
  "The kept credits must be stated with their number.",
);

const adminPage = read("src/app/(app)/admin/workspaces/[workspaceRef]/page.tsx");
assert.match(
  adminPage,
  /subscription\.frozenCredits/,
  "The admin workspace page must show the frozen amount.",
);

for (const locale of ["en", "vi", "ja"]) {
  const billing = JSON.parse(read(`messages/${locale}/settingsBilling.json`));
  assert.ok(billing.frozen?.kept?.includes("{credits}"), `${locale}: settingsBilling.frozen.kept`);
}

console.log("Frozen credits wiring contract: PASS");
