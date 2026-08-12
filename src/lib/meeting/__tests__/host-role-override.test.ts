import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyLiveHostRole } from "../host-role-override.ts";

/**
 * WT-358. Transfer Host changed who ran the meeting, but the People panel went on showing the
 * outgoing host as Host until the page was reloaded.
 *
 * The reason is structural, not a missing refresh: roles come from the API participant list, and
 * the realtime presence payload carries no role at all (WT-192), so the live merge had nothing to
 * correct them with. This is the rule that closes the gap on the client.
 */
describe("applyLiveHostRole", () => {
  const roster = () => [
    { userId: "booker", role: "host" },
    { userId: "transferee", role: "participant" },
    { userId: "bystander", role: "participant" },
  ];

  it("moves the Host label to the new host and takes it off the old one", () => {
    const result = applyLiveHostRole(roster(), "transferee");

    assert.deepEqual(
      result.map((p) => [p.userId, p.role]),
      [
        ["booker", "participant"],
        ["transferee", "host"],
        ["bystander", "participant"],
      ],
    );
  });

  it("never leaves two rows labelled Host", () => {
    // The bug's visible signature. A promote-only rule produces exactly this and looks correct
    // in a two-person meeting, which is how it survives review.
    const result = applyLiveHostRole(roster(), "transferee");
    const hosts = result.filter((p) => p.role === "host");

    assert.equal(hosts.length, 1);
    assert.equal(hosts[0].userId, "transferee");
  });

  it("leaves fetched roles alone when nothing has said the host moved", () => {
    const input = roster();
    const result = applyLiveHostRole(input, null);

    // Same array, not a relabelled copy: a room where no transfer has happened must not have its
    // roles rewritten, and a host-less room (WT-234) must not have one invented.
    assert.equal(result, input);
  });

  it("treats the backend's uppercase HOST as the same label", () => {
    // The enum is HOST on the wire and "host" in the frontend union; both spellings reach this
    // list. Comparing exactly would read HOST as "not the host" and rewrite the correct row.
    const result = applyLiveHostRole(
      [{ userId: "transferee", role: "HOST" }],
      "transferee",
    );

    assert.equal(result[0].role, "HOST", "already correct — left untouched");
  });

  it("returns unchanged rows by reference so memoised consumers stay stable", () => {
    const input = roster();
    const result = applyLiveHostRole(input, "booker");

    assert.equal(result[0], input[0], "booker was already host");
    assert.equal(result[2], input[2], "bystander was already a participant");
  });

  it("handles a roster with no role information at all", () => {
    const result = applyLiveHostRole(
      [{ userId: "a" }, { userId: "b", role: null }],
      "b",
    );

    assert.deepEqual(
      result.map((p) => [p.userId, p.role]),
      [
        ["a", undefined],
        ["b", "host"],
      ],
    );
  });
});
