import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  VISIBILITY_CONFIRM_COPY,
  broadAllowIsInert,
  documentAudienceSummary,
  documentVisibilityLabel,
  externalAccessHint,
  isPrivateDocument,
  isPublicDocument,
  memberAccessHint,
  visibilityActionFor,
} from "../document-visibility.ts";
import { DOCUMENT_TAB, documentMatchesTab, historyActionLabel } from "../document-review.ts";

const UPLOADER = "user-uploader";
const STRANGER = "user-stranger";

function doc(status: string) {
  return { status, uploadedBy: UPLOADER, ownerId: UPLOADER };
}

// ── The bug: a public document offered no way back ────────────────────────────────────────────

test("an owner/admin is offered 'make private' on a public document", () => {
  assert.equal(visibilityActionFor(doc("public"), STRANGER, true), "make_private");
});

test("the uploader may withdraw their own public document without approval rights", () => {
  assert.equal(visibilityActionFor(doc("public"), UPLOADER, false), "make_private");
});

test("an ordinary member who did not upload it is offered nothing", () => {
  assert.equal(visibilityActionFor(doc("public"), STRANGER, false), null);
  assert.equal(visibilityActionFor(doc("private"), STRANGER, false), null);
});

test("sharing again: owner/admin publishes directly, the uploader goes back through approval", () => {
  assert.equal(visibilityActionFor(doc("private"), STRANGER, true), "make_public");
  assert.equal(visibilityActionFor(doc("private"), UPLOADER, false), "submit_for_approval");
});

test("no visibility control on documents that were never published", () => {
  for (const status of ["pending_approval", "rejected", "archived"]) {
    assert.equal(visibilityActionFor(doc(status), STRANGER, true), null, status);
  }
});

test("the legacy 'active' status is treated as public, the way the API reads it", () => {
  assert.equal(isPublicDocument(doc("active")), true);
  assert.equal(visibilityActionFor(doc("active"), STRANGER, true), "make_private");
});

test("status matching tolerates case and whitespace", () => {
  assert.equal(isPrivateDocument(doc(" Private ")), true);
  assert.equal(isPublicDocument(doc("PUBLIC")), true);
});

// ── The confirm step ───────────────────────────────────────────────────────────────────────────

test("making a document private is confirmed, destructive, and says what it cuts", () => {
  const copy = VISIBILITY_CONFIRM_COPY.make_private;
  assert.equal(copy.destructive, true);
  assert.match(copy.body, /lose access immediately/);
  assert.match(copy.body, /assistant/);
  assert.match(copy.body, /public again/);
});

test("the approval route says it stays private until approved", () => {
  assert.match(VISIBILITY_CONFIRM_COPY.submit_for_approval.body, /stays private/);
  assert.equal(VISIBILITY_CONFIRM_COPY.submit_for_approval.destructive, false);
});

// ── Labels and copy that used to contradict each other ─────────────────────────────────────────

test("the badge reads as words, not the raw status", () => {
  assert.equal(documentVisibilityLabel(doc("public")), "Public");
  assert.equal(documentVisibilityLabel(doc("private")), "Private");
  assert.equal(documentVisibilityLabel(doc("pending_approval")), "Pending approval");
});

test("the audience line matches the state", () => {
  assert.match(documentAudienceSummary(doc("public")), /Every internal member/);
  assert.match(documentAudienceSummary(doc("private")), /named under Allowed/);
});

test("the External switch no longer describes a public link", () => {
  const hint = externalAccessHint(doc("public"), false);
  assert.doesNotMatch(hint, /outside the workspace/);
  assert.match(hint, /external members/);
});

test("the External switch says it is paused, not active, on a private document", () => {
  assert.match(externalAccessHint(doc("private"), true), /Paused while private/);
});

test("a member-role DENY is described as the role rule it is, not as 'no member'", () => {
  const hint = memberAccessHint(doc("public"), "view", "deny");
  assert.doesNotMatch(hint, /whatever else allows it/);
  assert.match(hint, /Member role/);
  assert.match(hint, /Owners and admins still can/);
});

test("the unset member rule on a public document says members can read it", () => {
  assert.match(memberAccessHint(doc("public"), "view", null), /every internal member may view/);
});

test("ai_retrieval reads as a sentence, not 'may ai this'", () => {
  const hint = memberAccessHint(doc("public"), "ai_retrieval", "allow");
  assert.doesNotMatch(hint, / ai this/i);
  assert.match(hint, /assistant answers/);
});

test("broad ALLOWs are flagged inert while private, because the API ignores them", () => {
  assert.equal(broadAllowIsInert(doc("private")), true);
  assert.equal(broadAllowIsInert(doc("public")), false);
  assert.match(memberAccessHint(doc("private"), "view", "allow"), /Paused while private/);
});

// ── The library and the history know the new state ─────────────────────────────────────────────

test("a private document has its own tab and is not counted as Published", () => {
  const privateDoc = doc("private");
  assert.equal(documentMatchesTab(privateDoc, DOCUMENT_TAB.PRIVATE), true);
  assert.equal(documentMatchesTab(privateDoc, DOCUMENT_TAB.PUBLISHED), false);
  assert.equal(documentMatchesTab(privateDoc, DOCUMENT_TAB.ALL), true);
});

test("the history names both transitions", () => {
  assert.equal(historyActionLabel("UnpublishDocument"), "Made private");
  assert.equal(historyActionLabel("PublishDocument"), "Shared with the workspace again");
});

// ── Wired, not just written ─────────────────────────────────────────────────────────────────────
// Five fixes in this codebase were once written, tested and connected to nothing. These read the
// screens themselves, so the rules above cannot pass while the page goes on rendering the old
// dead end.


const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const DETAIL = "src/app/(app)/[workspaceSlug]/documents/[documentId]";

test("the detail page offers the revoke, behind the confirm dialog", () => {
  const page = read(`${DETAIL}/page.tsx`);
  assert.match(page, /visibilityActionFor\(/);
  assert.match(page, /<DocumentVisibilityDialog/);
  assert.match(page, /useSetWorkspaceDocumentVisibility\(/);
});

test("the side panel renders the visibility control and the corrected access copy", () => {
  const panel = read(`${DETAIL}/components/DocumentSidePanel.tsx`);
  assert.match(panel, /onRequestVisibilityChange\(visibilityAction\)/);
  assert.match(panel, /externalAccessHint\(/);
  assert.match(panel, /memberAccessHint\(/);
  assert.doesNotMatch(panel, /guests outside the workspace/);
  assert.doesNotMatch(panel, /whatever else allows it/);
});

test("the service calls the two routes the API exposes", () => {
  const endpoints = read("src/lib/api/endpoints.ts");
  assert.match(endpoints, /\/documents\/\$\{docId\}\/unpublish`/);
  assert.match(endpoints, /\/documents\/\$\{docId\}\/publish`/);
});

test("the library shows private documents as private", () => {
  const library = read("src/app/(app)/[workspaceSlug]/documents/page.tsx");
  assert.match(library, /DOCUMENT_TAB\.PRIVATE/);
  assert.match(library, /t\("status\.private"\)/);
});
