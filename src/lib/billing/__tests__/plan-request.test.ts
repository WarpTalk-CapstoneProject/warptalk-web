import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PLAN_BILLING_CYCLE,
  applyPlanEdits,
  planRequestFields,
  planRequestFromDto,
  validatePlanRequest,
} from "../plan-request.ts";
import type { PlanRequest } from "../../../types/admin-pricing.ts";
import type { PlanDto } from "../../../types/billing.ts";

/**
 * A plan whose overage economics are all NON-default.
 *
 * Every one of the six columns below differs from the value `PlanRequest` declares as its C#
 * default, which is what makes this fixture able to catch the defect: if any of them is dropped on
 * the way to the wire, the value that comes back is the default, and the assertion fails.
 */
const STORED_PLAN: PlanDto = {
  id: "3f6d5f9e-0b0a-4a3f-9a6c-2b8f4b1f7c11",
  name: "Growth",
  slug: "growth",
  tier: "Startup",
  price: 490_000,
  currency: "VND",
  billingCycle: "monthly",
  creditsPerCycle: 90_000,
  overageCapCredits: 20_000,
  overagePricePerCredit: 5.5,
  lowBalanceThresholdCredits: 25_000,
  rolloverCapCredits: 10_000,
  invoiceTermsDays: 30,
  invoiceGraceHours: 720,
  features: '["Voice cloning","Glossary"]',
  sortOrder: 2,
  isActive: true,
  maxParticipants: 12,
  maxLanguages: 3,
  voiceCloneEnabled: true,
  aiAssistantEnabled: true,
  glossaryEnabled: true,
  dedicatedGpu: false,
};

describe("planRequestFromDto", () => {
  it("carries every field the write endpoint replaces", () => {
    const request = planRequestFromDto(STORED_PLAN);

    // The endpoint assigns all twenty-two columns from the body. A key missing here is a column
    // silently reset to a C# default on the row, so the SET of keys is the assertion, not a spot
    // check of the interesting ones.
    assert.deepEqual(Object.keys(request).sort(), [...planRequestFields].sort());
  });

  it("keeps the overage and invoicing columns that no form field shows", () => {
    const request = planRequestFromDto(STORED_PLAN);

    // These six are the regression. Read back as stored, not as 0 / 4.0 / 15 / 360.
    assert.equal(request.overageCapCredits, 20_000);
    assert.equal(request.overagePricePerCredit, 5.5);
    assert.equal(request.lowBalanceThresholdCredits, 25_000);
    assert.equal(request.rolloverCapCredits, 10_000);
    assert.equal(request.invoiceTermsDays, 30);
    assert.equal(request.invoiceGraceHours, 720);
  });

  it("changes nothing on its own", () => {
    const request = planRequestFromDto(STORED_PLAN);

    for (const field of planRequestFields) {
      assert.equal(
        request[field],
        STORED_PLAN[field],
        `${field} was altered on the way to the request`,
      );
    }
  });
});

describe("applyPlanEdits", () => {
  it("lays edits over the stored plan rather than over an empty form", () => {
    const request = applyPlanEdits(STORED_PLAN, { name: "Growth (2026)", price: 590_000 });

    assert.equal(request.name, "Growth (2026)");
    assert.equal(request.price, 590_000);
    // The edit touched two fields. Everything the dialog does not offer survives it.
    assert.equal(request.overageCapCredits, 20_000);
    assert.equal(request.invoiceGraceHours, 720);
    assert.equal(request.rolloverCapCredits, 10_000);
  });

  it("lets an edit set a field back to zero", () => {
    // Distinct from omission, and the reason the base is spread first and the edits second: a
    // falsy value the admin chose has to win over the stored one.
    const request = applyPlanEdits(STORED_PLAN, { overageCapCredits: 0 });
    assert.equal(request.overageCapCredits, 0);
  });
});

describe("validatePlanRequest", () => {
  const valid = planRequestFromDto(STORED_PLAN);
  const withEdits = (edits: Partial<PlanRequest>) => validatePlanRequest({ ...valid, ...edits });

  it("passes a plan read straight back out of the API", () => {
    assert.equal(validatePlanRequest(valid), null);
  });

  it("refuses a billing cycle the update endpoint does not accept", () => {
    // "yearly" exists as a constant on the server and is still rejected by ValidatePlanRequest.
    assert.match(String(withEdits({ billingCycle: "yearly" })), /monthly/);
    assert.equal(withEdits({ billingCycle: PLAN_BILLING_CYCLE }), null);
  });

  it("refuses a currency the plan validator does not accept", () => {
    assert.match(String(withEdits({ currency: "EUR" })), /VND or USD/);
  });

  it("refuses a slug that is not a slug", () => {
    assert.match(String(withEdits({ slug: "Growth Tier" })), /lowercase/);
    assert.equal(withEdits({ slug: "growth-tier-2" }), null);
  });

  it("refuses caps above the commitment they are capping", () => {
    assert.match(String(withEdits({ overageCapCredits: 90_001 })), /Overage cap/);
    assert.match(String(withEdits({ rolloverCapCredits: 90_001 })), /Rollover cap/);
  });

  it("refuses a low-balance warning that arrives after overage has started", () => {
    // Threshold at or below the overage cap means the customer is already paying overage by the
    // time they are told the balance is low.
    assert.match(String(withEdits({ lowBalanceThresholdCredits: 20_000 })), /too late/);
  });

  it("refuses overage with no price on it", () => {
    assert.match(String(withEdits({ overagePricePerCredit: 0 })), /overage price/);
  });

  it("accepts a plan that allows no overage at all", () => {
    // With the cap at zero the threshold rule above does not apply — nothing is being warned about.
    assert.equal(withEdits({ overageCapCredits: 0, overagePricePerCredit: 0 }), null);
  });

  it("names the field when a number input was cleared", () => {
    // NaN loses every comparison, so without an explicit finite check an emptied overage cap
    // passes the range rules below it and reaches the server as null.
    assert.match(String(withEdits({ overageCapCredits: Number.NaN })), /Overage cap must be a number/);
    assert.match(String(withEdits({ invoiceTermsDays: Number.NaN })), /Invoice terms must be a number/);
  });

  it("refuses a features blob that is not a JSON container", () => {
    assert.match(String(withEdits({ features: "Voice cloning" })), /JSON/);
    assert.equal(withEdits({ features: "" }), null);
    assert.equal(withEdits({ features: "{}" }), null);
  });
});
