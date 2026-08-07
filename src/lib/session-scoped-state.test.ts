// Must come first: it installs the storage that zustand's persist middleware looks for at
// module-evaluation time.
import { testSessionStorage } from "./test-browser-storage.ts";

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { QueryClient } from "@tanstack/react-query";

import {
  registerSessionQueryClient,
  resetSessionScopedStateOnLogin,
  resetSessionScopedStateOnLogout,
} from "./session-scoped-state.ts";
import { useActiveMeetingStore } from "../stores/active-meeting-store.ts";
import { useAssistantContextStore } from "../stores/assistant-context-store.ts";
import { useNotificationStore } from "../stores/notification-store.ts";
import { usePresenceStore } from "../stores/presence-store.ts";
import { useTranslationRoomStore } from "../stores/translationRoom-store.ts";
import { useWorkspaceStore } from "../stores/workspace-store.ts";
import { useWorkspaceTabsStore } from "../stores/workspace-tabs-store.ts";

/**
 * A change of signed-in account must leave nothing of the previous one behind.
 *
 * These are behavioural assertions against the real query client and the real stores, not
 * source greps, because the failure this guards against is invisible to the type checker:
 * every type stays satisfied while the previous account's rooms render for the next one.
 *
 * The keys below are the real ones. `WORKSPACE_KEYS.list(1, 100, "")` is what the workspace
 * onboarding page and the (app) layout both mount, and it is the specific cache entry that
 * decides which workspace an account is auto-routed into — so a stale one does not merely
 * show the wrong rows, it sends the wrong person into the wrong workspace.
 */

const ACCOUNT_A_QUERIES: [readonly unknown[], unknown][] = [
  [["workspaces", "list", { page: 1, pageSize: 100, search: "" }], { items: [{ id: "ws-a", slug: "acme" }] }],
  [["translation-rooms", { page: 1 }], [{ id: "room-a", title: "Account A standup" }]],
  [["workspaces", "members", "ws-a", { page: 1, pageSize: 10, search: "" }], { items: [{ email: "a@example.com" }] }],
  [["workspaces", "invitations", "pending"], [{ id: "inv-a" }]],
  [["notifications", "list"], [{ notificationId: "n-a" }]],
  [["auth", "profile"], { id: "user-a", email: "a@example.com" }],
];

function seedAccountA(client: QueryClient) {
  for (const [key, value] of ACCOUNT_A_QUERIES) client.setQueryData(key, value);

  useWorkspaceStore
    .getState()
    .setActiveWorkspace("ws-a", "Acme", "acme", "Owner", "Internal", "en");
  usePresenceStore.setState({ states: { "user-a": { status: "online" } } as never });
  useNotificationStore
    .getState()
    .setNotifications([{ notificationId: "n-a", title: "A was mentioned" }] as never);
  useWorkspaceTabsStore
    .getState()
    .addTab("acme", { id: "t-a", title: "Account A standup", href: "/acme/rooms/room-a" });
  useTranslationRoomStore
    .getState()
    .addChatMessage({ messageId: "m-a", content: "A said this" } as never);
  useActiveMeetingStore.getState().openMeeting("room-a");
  useAssistantContextStore
    .getState()
    .setPageContext({ pageType: "room", summary: "A's room" } as never);

  // Written by the meeting join preview and the device picker, outside zustand entirely.
  testSessionStorage.setItem("warptalk.join.preview", JSON.stringify({ "room-a": { camera: true } }));
  testSessionStorage.setItem("warptalk.devices.preview", JSON.stringify({ micId: "a-mic" }));
  testSessionStorage.setItem("unrelated-third-party-key", "keep me");
}

function assertNothingOfAccountARemains(client: QueryClient) {
  for (const [key] of ACCOUNT_A_QUERIES) {
    assert.equal(
      client.getQueryData(key),
      undefined,
      `query ${JSON.stringify(key)} still holds the previous account's response`,
    );
  }
  assert.equal(client.getQueryCache().getAll().length, 0, "query cache is not empty");

  assert.equal(useWorkspaceStore.getState().activeWorkspaceId, null);
  assert.equal(useWorkspaceStore.getState().activeWorkspaceSlug, null);
  assert.equal(useWorkspaceStore.getState().role, null);
  assert.deepEqual(usePresenceStore.getState().states, {});
  assert.deepEqual(useNotificationStore.getState().notifications, []);
  assert.equal(useNotificationStore.getState().unreadCount, 0);
  assert.deepEqual(useWorkspaceTabsStore.getState().tabsByScope, {});
  assert.deepEqual(useTranslationRoomStore.getState().chatMessages, []);
  assert.deepEqual(useTranslationRoomStore.getState().participants, []);
  assert.deepEqual(useTranslationRoomStore.getState().transcriptSegments, []);
  assert.equal(useActiveMeetingStore.getState().activeRoomId, null);
  assert.equal(useAssistantContextStore.getState().pageContext, null);

  assert.equal(testSessionStorage.getItem("warptalk.join.preview"), null);
  assert.equal(testSessionStorage.getItem("warptalk.devices.preview"), null);
  assert.equal(
    testSessionStorage.getItem("unrelated-third-party-key"),
    "keep me",
    "the reset reached past its own namespace",
  );
}

let client: QueryClient;
let unregister: () => void;

beforeEach(() => {
  client = new QueryClient();
  unregister?.();
  unregister = registerSessionQueryClient(client);
});

test("signing out leaves no cached response belonging to the account that left", () => {
  seedAccountA(client);
  assert.ok(client.getQueryCache().getAll().length > 0, "fixture did not seed anything");

  resetSessionScopedStateOnLogout();

  assertNothingOfAccountARemains(client);
});

test("signing out empties the mutation cache too", () => {
  client.getMutationCache().build(client, { mutationFn: async () => "invited b@example.com" });
  assert.equal(client.getMutationCache().getAll().length, 1);

  resetSessionScopedStateOnLogout();

  assert.equal(client.getMutationCache().getAll().length, 0);
});

test("signing in clears state the previous session never got to clean up", () => {
  // The logout that never happened: an unredeemable refresh token, a sign-out in another
  // tab, a browser closed mid-session. Nothing called logout(), so the arriving account is
  // the first code with a chance to act.
  seedAccountA(client);

  resetSessionScopedStateOnLogin();

  assertNothingOfAccountARemains(client);
});

test("signing in does not disturb the mutation it is itself running", () => {
  // resetSessionScopedStateOnLogin() runs inside the login mutation's own onSuccess.
  const loginMutation = client
    .getMutationCache()
    .build(client, { mutationFn: async () => "signed in" });

  resetSessionScopedStateOnLogin();

  assert.equal(client.getMutationCache().getAll().length, 1);
  assert.equal(client.getMutationCache().getAll()[0], loginMutation);
});

test("an in-flight request from the previous account cannot repopulate the cache", async () => {
  // The narrow window the ordering inside resetQueryCache exists to close: a request issued
  // as A is still on the wire when B signs in, and its response would otherwise be written
  // into the cache B is about to read.
  const key = ["translation-rooms", { page: 1 }];
  let releaseResponse: (rooms: unknown) => void = () => {};
  const inFlight = new Promise((resolve) => {
    releaseResponse = resolve;
  });

  const observerPromise = client
    .fetchQuery({ queryKey: key, queryFn: () => inFlight, retry: false })
    .catch(() => undefined);

  resetSessionScopedStateOnLogout();
  releaseResponse([{ id: "room-a", title: "Account A standup" }]);
  await observerPromise;
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(
    client.getQueryData(key),
    undefined,
    "a response fetched as the previous account landed in the cache after the reset",
  );
});

test("the reset is a no-op, not a crash, before any query client is registered", () => {
  // The store rehydration path runs at module load, before <Providers> has mounted.
  unregister();
  unregister = () => {};
  assert.doesNotThrow(() => resetSessionScopedStateOnLogout());
});
