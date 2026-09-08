import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  effectivePluginConnectionStatus,
  formatPluginLabelList,
  isPluginWorkspaceBlocked,
  pluginConnectionGroupKey,
  pluginWorkspaceBlock,
  pluginsSharingConnection,
  scopesSatisfied,
  sharedConnectionWarning,
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

const MEET_SCOPE = CALENDAR_SCOPE;

const drive = plugin({ key: "google_drive", label: "Google Drive", requiredScopes: [DRIVE_SCOPE] });
const calendar = plugin({ key: "google_calendar", label: "Google Calendar" });
const meet = plugin({ key: "google_meet", label: "Google Meet", requiredScopes: [MEET_SCOPE] });

describe("WT-646 — disconnecting one plugin ends the grant behind all of them", () => {
  test("provider is the grouping key when the catalog sends it", () => {
    const withProvider = plugin({ provider: "google" });
    assert.equal(pluginConnectionGroupKey(withProvider), "provider:google");
  });

  test("provider wins over the scope-issuer fallback", () => {
    // Two rows issued by the same host but belonging to different grants must not be grouped once
    // the real answer is available.
    const a = plugin({ key: "a", provider: "one", requiredScopes: [DRIVE_SCOPE] });
    const b = plugin({ key: "b", provider: "two", requiredScopes: [DRIVE_SCOPE] });
    assert.notEqual(pluginConnectionGroupKey(a), pluginConnectionGroupKey(b));
  });

  test("without provider, rows issued by one https origin group together", () => {
    // The state of the world today: the user-facing catalog DTO carries no provider.
    assert.equal(pluginConnectionGroupKey(drive), pluginConnectionGroupKey(calendar));
    assert.equal(pluginConnectionGroupKey(calendar), pluginConnectionGroupKey(meet));
  });

  test("the fallback refuses to guess rather than grouping the wrong rows", () => {
    // Nothing that names an issuer, and two issuers in one row, both mean "cannot tell" — and
    // cannot-tell must mean no siblings, not all siblings.
    for (const requiredScopes of [
      ["mcp:read"],
      ["drive.readonly"],
      [],
      ["openid", "email", "profile"],
      [DRIVE_SCOPE, "https://api.example.com/auth/thing"],
    ]) {
      assert.equal(pluginConnectionGroupKey(plugin({ requiredScopes })), null, requiredScopes.join());
    }
  });

  test("an identity scope does not collapse the group it sits in", () => {
    // The regression this exists for. `openid`, `email` and `profile` are bare words —
    // GoogleWorkspaceOAuthClient asks Google for all three — and requiring EVERY scope to parse as
    // an http(s) URL meant one of them appearing on a row returned null. A collapsed group means
    // the disconnect confirmation warns about nobody, which is the silent data loss the whole
    // grouping exists to prevent, arriving by the path that looks safest.
    const identityFirst = plugin({
      key: "google_drive",
      label: "Google Drive",
      requiredScopes: ["openid", "email", DRIVE_SCOPE],
    });
    assert.equal(pluginConnectionGroupKey(identityFirst), pluginConnectionGroupKey(drive));

    const siblings = pluginsSharingConnection(identityFirst, [identityFirst, calendar, meet]);
    assert.deepEqual(
      siblings.map((item) => item.key),
      ["google_calendar", "google_meet"],
    );
  });

  test("an opaque scope beside one issuer over-warns rather than under-warns", () => {
    // Ignoring a scope that names no issuer can over-group two rows that share a host. That is the
    // direction to fail in: an extra name in the confirmation is noise, a missing one is data the
    // user loses without being asked.
    const mixed = plugin({ key: "mixed", requiredScopes: ["mcp:read", DRIVE_SCOPE] });
    assert.equal(pluginConnectionGroupKey(mixed), pluginConnectionGroupKey(drive));
  });

  test("siblings are the other INSTALLED rows behind the same grant", () => {
    const notInstalled = plugin({
      key: "google_docs",
      label: "Google Docs",
      installationStatus: "not_installed",
    });
    const unrelated = plugin({
      key: "notion",
      label: "Notion",
      requiredScopes: ["https://api.notion.com/auth/read"],
    });

    const siblings = pluginsSharingConnection(drive, [drive, calendar, meet, notInstalled, unrelated]);
    assert.deepEqual(
      siblings.map((item) => item.key),
      ["google_calendar", "google_meet"],
    );
  });

  test("a row that cannot be grouped warns about nobody", () => {
    const opaque = plugin({ key: "mcp_thing", requiredScopes: ["mcp:read"] });
    assert.deepEqual(pluginsSharingConnection(opaque, [opaque, drive, calendar]), []);
  });

  test("the warning names every plugin that goes down, and agrees with itself grammatically", () => {
    assert.equal(sharedConnectionWarning([]), null);

    const one = sharedConnectionWarning([calendar]);
    assert.ok(one?.includes("Google Calendar"), one ?? "");
    assert.ok(one?.includes("shares this account connection"), one ?? "");
    assert.ok(one?.includes("it is disconnected too"), one ?? "");

    const two = sharedConnectionWarning([calendar, meet]);
    assert.ok(two?.includes("Google Calendar and Google Meet"), two ?? "");
    assert.ok(two?.includes("share this account connection"), two ?? "");
    assert.ok(two?.includes("they are disconnected too"), two ?? "");
  });

  test("formatPluginLabelList reads as a sentence, not as an array", () => {
    assert.equal(formatPluginLabelList([]), "");
    assert.equal(formatPluginLabelList(["A"]), "A");
    assert.equal(formatPluginLabelList(["A", "B"]), "A and B");
    assert.equal(formatPluginLabelList(["A", "B", "C"]), "A, B and C");
  });
});

describe("WT-646 — a workspace's plugin policy, in words a member can act on", () => {
  test("no reason means no block", () => {
    assert.equal(pluginWorkspaceBlock(plugin()), null);
    assert.equal(pluginWorkspaceBlock(plugin({ workspacePolicyBlockReason: null })), null);
    assert.equal(pluginWorkspaceBlock(plugin({ workspacePolicyBlockReason: "   " })), null);
    assert.equal(isPluginWorkspaceBlocked(plugin()), false);
  });

  test("a reason the backend no longer emits gets no remedy invented for it", () => {
    // The per-plugin allowlist was cut from this ticket, so "does not include this plugin" is a
    // sentence nothing produces any more. It must fall through to reason-without-remedy rather
    // than matching something else and sending the member to ask for the wrong thing.
    const block = pluginWorkspaceBlock(
      plugin({
        workspacePolicyBlockReason: "This workspace's plugin policy does not include this plugin.",
      }),
    );
    assert.equal(block?.reason, "This workspace's plugin policy does not include this plugin.");
    assert.equal(block?.remedy, null);
  });

  test("plugins switched off is explained, and points at the one person who can undo it", () => {
    // PluginConstants.WorkspacePolicyMessages.PluginsDisabled — the single refusal a workspace can
    // now produce, since a workspace configures exactly one plugin attribute.
    const block = pluginWorkspaceBlock(
      plugin({
        workspacePolicyBlockReason: "Workspace settings do not allow personal plugins in WarpBot.",
      }),
    );
    assert.ok(block?.remedy?.includes("turned plugins off"), block?.remedy ?? "");
    assert.ok(block?.remedy?.includes("Owner or Admin"), block?.remedy ?? "");
  });

  test("an unrecognised reason is still shown, with no invented advice attached", () => {
    const block = pluginWorkspaceBlock(
      plugin({ workspacePolicyBlockReason: "Something new the backend started saying." }),
    );
    assert.equal(block?.reason, "Something new the backend started saying.");
    assert.equal(block?.remedy, null);
    assert.equal(isPluginWorkspaceBlocked(plugin({ workspacePolicyBlockReason: "x" })), true);
  });
});
