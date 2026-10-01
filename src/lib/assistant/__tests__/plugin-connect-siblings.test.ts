import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  connectAllRequest,
  pluginSiblingsToOffer,
  providerDisplayName,
  siblingPromptDismissedKey,
} from "../plugin-connect-siblings.ts";
import type { AssistantPluginCatalogItemDto } from "../../../types/assistant.ts";

const DRIVE = "https://www.googleapis.com/auth/drive.readonly";
const CALENDAR = "https://www.googleapis.com/auth/calendar.events";
const MEET = "https://www.googleapis.com/auth/meetings.space.created";

function row(overrides: Partial<AssistantPluginCatalogItemDto>): AssistantPluginCatalogItemDto {
  return {
    key: "google_calendar",
    label: "Google Calendar",
    description: "Read and create events",
    provider: "google",
    requiredScopes: [CALENDAR],
    installationStatus: "installed",
    connectionStatus: "not_connected",
    grantedScopes: [],
    tools: [],
    workspaceAvailability: "added",
    ...overrides,
  };
}

const calendar = row({ connectionStatus: "connected", grantedScopes: [CALENDAR] });
const drive = row({ key: "google_drive", label: "Google Drive", requiredScopes: [DRIVE], sortOrder: 1 });
const meet = row({ key: "google_meet", label: "Google Meet", requiredScopes: [MEET], sortOrder: 2 });

describe("pluginSiblingsToOffer", () => {
  test("offers the provider's other unconnected rows, in catalog order", () => {
    const keys = pluginSiblingsToOffer(calendar, [meet, calendar, drive]).map((p) => p.key);
    assert.deepEqual(keys, ["google_drive", "google_meet"]);
  });

  test("never offers the plugin itself, or another provider's rows", () => {
    const notion = row({ key: "notion", label: "Notion", provider: "notion", requiredScopes: [] });
    const keys = pluginSiblingsToOffer(calendar, [calendar, notion, drive]).map((p) => p.key);
    assert.deepEqual(keys, ["google_drive"]);
  });

  test("skips siblings that are already connected", () => {
    const connectedDrive = { ...drive, connectionStatus: "connected" as const, grantedScopes: [DRIVE] };
    assert.deepEqual(pluginSiblingsToOffer(calendar, [calendar, connectedDrive, meet]).map((p) => p.key), [
      "google_meet",
    ]);
  });

  test("still offers a sibling connected with its own scope declined", () => {
    const partialDrive = { ...drive, connectionStatus: "connected" as const, grantedScopes: [CALENDAR] };
    assert.deepEqual(pluginSiblingsToOffer(calendar, [calendar, partialDrive]).map((p) => p.key), [
      "google_drive",
    ]);
  });

  test("offers a row the workspace added but the user has not installed — it shows Connect", () => {
    const uninstalledMeet = { ...meet, installationStatus: "not_installed" as const };
    assert.deepEqual(pluginSiblingsToOffer(calendar, [calendar, uninstalledMeet]).map((p) => p.key), [
      "google_meet",
    ]);
  });

  test("never offers a Request/Add row the workspace has not added", () => {
    const requestMeet = { ...meet, installationStatus: "not_installed" as const, workspaceAvailability: "not_added" as const };
    const addMeet = { ...requestMeet, canAdd: true };
    assert.deepEqual(pluginSiblingsToOffer(calendar, [calendar, requestMeet]), []);
    assert.deepEqual(pluginSiblingsToOffer(calendar, [calendar, addMeet]), []);
  });

  test("skips rows refused by workspace policy, disabled by the platform, or keyed by API key", () => {
    const blocked = { ...drive, workspacePolicyBlockReason: "Plugins are turned off for this workspace." };
    const disabled = { ...meet, workspaceAvailability: "platform_disabled" as const };
    const apiKey = row({ key: "google_x", label: "Google X", requiredScopes: [DRIVE], authMode: "api_key" });
    assert.deepEqual(pluginSiblingsToOffer(calendar, [calendar, blocked, disabled, apiKey]), []);
  });

  test("a row with no group has no siblings", () => {
    const loner = row({ key: "mcp", label: "MCP", provider: null, requiredScopes: ["mcp:read"] });
    assert.deepEqual(pluginSiblingsToOffer(loner, [loner, drive, meet]), []);
  });
});

describe("connectAllRequest", () => {
  test("names the first sibling and carries the rest in alsoConnect", () => {
    assert.deepEqual(connectAllRequest([drive, meet]), { pluginKey: "google_drive", alsoConnect: ["google_meet"] });
  });

  test("a single sibling sends an empty alsoConnect", () => {
    assert.deepEqual(connectAllRequest([meet]), { pluginKey: "google_meet", alsoConnect: [] });
  });

  test("nothing to connect is null", () => {
    assert.equal(connectAllRequest([]), null);
  });
});

describe("providerDisplayName", () => {
  test("title-cases the provider slug", () => {
    assert.equal(providerDisplayName({ provider: "google" }), "Google");
    assert.equal(providerDisplayName({ provider: "google_workspace" }), "Google Workspace");
  });

  test("no provider is null", () => {
    assert.equal(providerDisplayName({ provider: null }), null);
    assert.equal(providerDisplayName({}), null);
  });
});

test("dismissal key is per provider group", () => {
  assert.notEqual(siblingPromptDismissedKey("provider:google"), siblingPromptDismissedKey("provider:notion"));
});
