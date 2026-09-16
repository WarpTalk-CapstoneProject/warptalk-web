// Which workspace this ACCOUNT was in last time — remembered across sign-outs. WT-347.

import assert from "node:assert/strict";
import test from "node:test";

import {
  LAST_WORKSPACE_STORAGE_KEY,
  preferRememberedWorkspace,
  recallLastWorkspaceSlug,
  rememberLastWorkspaceSlug,
  type LastWorkspaceStorage,
} from "../last-workspace.ts";

function memoryStorage(seed: Record<string, string> = {}): LastWorkspaceStorage & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

test("a workspace is remembered per account and read back for that account", () => {
  const storage = memoryStorage();
  rememberLastWorkspaceSlug("user-a", "acme", storage);
  assert.equal(recallLastWorkspaceSlug("user-a", storage), "acme");
});

test("account B signing in on account A's browser learns nothing from it", () => {
  // The record is keyed by user id, so it cannot leak a workspace between accounts.
  const storage = memoryStorage();
  rememberLastWorkspaceSlug("user-a", "acme", storage);
  assert.equal(recallLastWorkspaceSlug("user-b", storage), null);
});

test("two accounts on one browser each keep their own memory", () => {
  const storage = memoryStorage();
  rememberLastWorkspaceSlug("user-a", "acme", storage);
  rememberLastWorkspaceSlug("user-b", "globex", storage);
  assert.equal(recallLastWorkspaceSlug("user-a", storage), "acme");
  assert.equal(recallLastWorkspaceSlug("user-b", storage), "globex");
});

test("the memory is a canonical slug, whatever was handed in", () => {
  const storage = memoryStorage();
  rememberLastWorkspaceSlug("user-a", "  ACME ", storage);
  assert.equal(recallLastWorkspaceSlug("user-a", storage), "acme");
});

test("a value that is not a workspace slug is never recorded", () => {
  // Reserved segments and garbage would otherwise become a destination the login page
  // navigates to on the next sign-in.
  const storage = memoryStorage();
  for (const bad of ["workspace", "admin", "Not A Slug", "", null, undefined]) {
    rememberLastWorkspaceSlug("user-a", bad, storage);
  }
  assert.equal(storage.data.size, 0);
  assert.equal(recallLastWorkspaceSlug("user-a", storage), null);
});

test("no user id means nothing is written and nothing is read", () => {
  const storage = memoryStorage();
  rememberLastWorkspaceSlug(null, "acme", storage);
  rememberLastWorkspaceSlug(undefined, "acme", storage);
  assert.equal(storage.data.size, 0);
  assert.equal(recallLastWorkspaceSlug(null, storage), null);
});

test("corrupt or foreign storage contents read as no memory, never as a throw", () => {
  for (const raw of ["not json", "[]", "42", "null", JSON.stringify({ "user-a": 7 })]) {
    const storage = memoryStorage({ [LAST_WORKSPACE_STORAGE_KEY]: raw });
    assert.equal(recallLastWorkspaceSlug("user-a", storage), null, `raw=${raw}`);
  }
});

test("a storage that throws must not be what stops a sign-in", () => {
  const broken: LastWorkspaceStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.doesNotThrow(() => rememberLastWorkspaceSlug("user-a", "acme", broken));
  assert.equal(recallLastWorkspaceSlug("user-a", broken), null);
  assert.equal(recallLastWorkspaceSlug("user-a", null), null);
});

test("rewriting the same slug does not touch storage", () => {
  const storage = memoryStorage();
  rememberLastWorkspaceSlug("user-a", "acme", storage);
  const before = storage.getItem(LAST_WORKSPACE_STORAGE_KEY);
  let writes = 0;
  const counting: LastWorkspaceStorage = {
    getItem: storage.getItem,
    setItem: (key, value) => {
      writes += 1;
      storage.setItem(key, value);
    },
  };
  rememberLastWorkspaceSlug("user-a", "acme", counting);
  assert.equal(writes, 0);
  assert.equal(storage.getItem(LAST_WORKSPACE_STORAGE_KEY), before);
});

// ─────────────────────────────────────────────────────────────────────────────
// Which workspace to auto-open. Both the hub and the app shell used to take `items[0]`.
// ─────────────────────────────────────────────────────────────────────────────

const items = [
  { id: "1", slug: "first" },
  { id: "2", slug: "acme" },
  { id: "3", slug: "globex" },
];

test("the remembered workspace wins over the server's list order", () => {
  assert.equal(preferRememberedWorkspace(items, "acme")?.id, "2");
});

test("a memory of a workspace this account has since left is ignored", () => {
  assert.equal(preferRememberedWorkspace(items, "left-long-ago")?.id, "1");
});

test("no memory means the first workspace, exactly as before", () => {
  assert.equal(preferRememberedWorkspace(items, null)?.id, "1");
  assert.equal(preferRememberedWorkspace(items, undefined)?.id, "1");
});

test("an empty list opens nothing", () => {
  assert.equal(preferRememberedWorkspace([], "acme"), undefined);
});
