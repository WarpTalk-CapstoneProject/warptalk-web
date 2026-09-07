import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  effectivePluginConnectionStatus,
  scopesSatisfied,
  withEffectiveConnectionStatus,
} from "../plugin-connection.ts";
import type { AssistantPluginCatalogItemDto } from "../../../types/assistant.ts";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function plugin(overrides: Partial<AssistantPluginCatalogItemDto> = {}): AssistantPluginCatalogItemDto {
  return {
    key: "google_calendar",
    label: "Google Calendar",
    description: "Read and create events",
    requiredScopes: [CALENDAR_SCOPE],
    installationStatus: "installed",
    connectionStatus: "connected",
    grantedScopes: [CALENDAR_SCOPE],
    tools: [],
    ...overrides,
  };
}

describe("WT-646 — a shared Google connection does not make every plugin usable", () => {
  test("all required scopes granted: connected stays connected", () => {
    assert.equal(effectivePluginConnectionStatus(plugin()), "connected");
  });

  test("connected on a consent screen where this plugin's scope was declined reads as not_connected", () => {
    // The case this exists for: one sign-in covers google_drive, google_calendar and
    // google_meet, and Google lets the person tick Drive and untick Calendar. Reporting
    // "Connected" here is a claim the user only finds false when a tool call fails mid-answer.
    // "not_connected" is also the honest instruction, because Connect re-runs consent.
    const declined = plugin({ grantedScopes: [DRIVE_SCOPE] });
    assert.equal(effectivePluginConnectionStatus(declined), "not_connected");
  });

  test("a plugin needing no scopes is not dragged down by an unrelated grant", () => {
    const scopeless = plugin({ requiredScopes: [], grantedScopes: [] });
    assert.equal(effectivePluginConnectionStatus(scopeless), "connected");
  });

  test("expired and revoked are reported as they are, not overwritten", () => {
    // These say something Connect cannot fix by re-consent alone, and the UI has its own
    // "Reconnect" wording for them. Collapsing them into not_connected would lose that.
    for (const connectionStatus of ["expired", "revoked", "not_connected"] as const) {
      const stale = plugin({ connectionStatus, grantedScopes: [] });
      assert.equal(effectivePluginConnectionStatus(stale), connectionStatus);
    }
  });

  test("scopesSatisfied wants every required scope, not merely an overlap", () => {
    assert.equal(scopesSatisfied([DRIVE_SCOPE, CALENDAR_SCOPE], [DRIVE_SCOPE]), false);
    assert.equal(scopesSatisfied([DRIVE_SCOPE], [DRIVE_SCOPE, CALENDAR_SCOPE]), true);
    assert.equal(scopesSatisfied([], [DRIVE_SCOPE]), true);
  });

  test("withEffectiveConnectionStatus rewrites only the status, and only when it differs", () => {
    const usable = plugin();
    // Same reference when nothing changed: both surfaces map the catalog on every render, and a
    // fresh object each time would churn every useMemo downstream of it.
    assert.equal(withEffectiveConnectionStatus(usable), usable);

    const declined = plugin({ grantedScopes: [] });
    const mapped = withEffectiveConnectionStatus(declined);
    assert.notEqual(mapped, declined);
    assert.equal(mapped.connectionStatus, "not_connected");
    assert.equal(mapped.key, declined.key);
    assert.equal(mapped.installationStatus, declined.installationStatus);
    // The account is still connected — the row just cannot claim this plugin works.
    assert.deepEqual(mapped.grantedScopes, declined.grantedScopes);
  });
});
