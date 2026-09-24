// WT-690: Stripe owns customer pricing, so the admin portal no longer edits the credit value or the
// per-credit price floor.
//
// Neither value is dead config — billing reads `credit_value_vnd` to turn a top-up's credit count
// into the Stripe amount, and `minimum_price_per_credit_vnd` is the floor plan and contract prices
// are validated against. So the backend keeps both stored and makes them OPTIONAL on
// `PUT /usages/pricing-config` (omitted = keep stored). This check pins the web half of that
// agreement: the dialog must never put either field in the request (sending a stale draft would
// re-open the knob), and no admin page may render them as editable economics again.
//
// Source-level, like the other admin contracts: the regression is a field list, and every type
// check and unit test passes with it put back.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(root, rel), "utf8");

const editors = await read("src/components/admin/pricing-editors.tsx");
const settings = await read("src/app/(app)/admin/settings/page.tsx");
const plans = await read("src/app/(app)/admin/plans/page.tsx");
const types = await read("src/types/admin-pricing.ts");

const failures = [];
const check = (label, ok) => {
  if (!ok) failures.push(label);
};

const fieldList = editors.match(/const CONFIG_FIELD_KEYS[^=]*=\s*\[([\s\S]*?)\];/);
check("pricing-editors.tsx still declares CONFIG_FIELD_KEYS", Boolean(fieldList));
if (fieldList) {
  for (const key of ["creditValueVnd", "minimumPricePerCreditVnd"]) {
    check(`the pricing dialog does not edit ${key}`, !fieldList[1].includes(`"${key}"`));
  }
  check("the pricing dialog still edits the FX rate", fieldList[1].includes('"fxRateUsdVnd"'));
}

for (const [name, source] of [
  ["settings", settings],
  ["plans", plans],
]) {
  check(`/admin/${name} does not show the credit value`, !/config\.creditValueVnd/.test(source));
  check(
    `/admin/${name} does not show the per-credit price floor`,
    !/config\.minimumPricePerCreditVnd/.test(source),
  );
}

const request = types.match(/export interface UpdatePricingConfigRequest \{([\s\S]*?)\n\}/);
check("UpdatePricingConfigRequest exists", Boolean(request));
if (request) {
  check("creditValueVnd is optional on the request", /creditValueVnd\?:/.test(request[1]));
  check(
    "minimumPricePerCreditVnd is optional on the request",
    /minimumPricePerCreditVnd\?:/.test(request[1]),
  );
}

if (failures.length > 0) {
  console.error("Admin pricing knobs contract failed (WT-690):");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Admin pricing knobs contract: credit value and price floor are not editable in the admin UI.");
