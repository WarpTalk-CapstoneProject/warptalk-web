import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { documentActorName, findDocumentActor } from "../document-actor.ts";

const MEMBERS = [
  { userId: "u1", id: "m1", fullName: "Ngọc Kỳ", email: "ky@acme.com" },
  { userId: "u2", id: "m2", fullName: "", email: "nameless@acme.com" },
  { userId: "u3", id: "m3", fullName: "   ", email: "  " },
  // A member row that carries no account id. The DTO makes both ids optional, and an
  // invitation accepted but not yet reconciled is the shape that produces one.
  { userId: null, id: null, fullName: "Unlinked", email: "unlinked@acme.com" },
];

describe("WT-551 — naming the person behind a document action", () => {
  test("a member is named", () => {
    assert.equal(documentActorName(MEMBERS, "u1"), "Ngọc Kỳ");
  });

  test("the membership row's own id still matches", () => {
    // A document stores the ACCOUNT id, but the card grid has always accepted either and a
    // silent narrowing here would drop names off a surface nobody asked about.
    assert.equal(documentActorName(MEMBERS, "m1"), "Ngọc Kỳ");
  });

  test("somebody who never set a display name is named by their address", () => {
    assert.equal(documentActorName(MEMBERS, "u2"), "nameless@acme.com");
  });

  test("an actor who left the workspace has no name, rather than a placeholder", () => {
    // The reported defect: this used to answer "Uploader", which reads as somebody's name in a
    // row labelled "Uploaded by".
    assert.equal(documentActorName(MEMBERS, "u-gone"), null);
  });

  test("a document nobody uploaded has no name", () => {
    // And specifically does not match the member whose own ids are missing: without the
    // early return, `undefined === undefined` makes that row answer for every empty actor.
    assert.equal(documentActorName(MEMBERS, null), null);
    assert.equal(documentActorName(MEMBERS, undefined), null);
    assert.equal(documentActorName(MEMBERS, ""), null);
    assert.equal(findDocumentActor(MEMBERS, null), null);
  });

  test("an empty or missing member list is not a crash", () => {
    // The member query is still loading, or its page did not reach this actor.
    assert.equal(documentActorName([], "u1"), null);
    assert.equal(documentActorName(undefined, "u1"), null);
  });

  test("whitespace is not a name", () => {
    assert.equal(documentActorName(MEMBERS, "u3"), null);
  });

  test("findDocumentActor returns the member itself, for callers that want the avatar", () => {
    assert.equal(findDocumentActor(MEMBERS, "u1")?.email, "ky@acme.com");
    assert.equal(findDocumentActor(MEMBERS, "u-gone"), null);
  });
});
