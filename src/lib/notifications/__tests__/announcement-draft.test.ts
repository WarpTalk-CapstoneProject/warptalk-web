import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ANNOUNCEMENT_TARGET_MODE,
  MAX_RECIPIENTS,
  buildCreateRequest,
  containsHtml,
  emptyAnnouncementDraft,
  toUtcIso,
  validateAnnouncementDraft,
  type AnnouncementDraft,
} from "../announcement-draft.ts";

const RECIPIENT = "6a1c2f80-1f2e-4f7a-8f1d-0d1b2c3d4e5f";

const draft = (overrides: Partial<AnnouncementDraft> = {}): AnnouncementDraft => ({
  ...emptyAnnouncementDraft(),
  title: "Scheduled maintenance",
  content: "We will be upgrading the translation pipeline.",
  recipientIds: [RECIPIENT],
  ...overrides,
});

describe("containsHtml", () => {
  it("matches the server's regex, including what it over-matches", () => {
    assert.equal(containsHtml("<script>alert(1)</script>"), true);
    assert.equal(containsHtml("<b>bold</b>"), true);
    // The server's pattern is <[^>]+>, so this is refused too. Mirroring it means the composer
    // says so up front instead of after the request has already been spent.
    assert.equal(containsHtml("if a < b > c then"), true);
    assert.equal(containsHtml("Plain text with no markup."), false);
    assert.equal(containsHtml("Ends with a bracket <"), false);
  });
});

describe("validateAnnouncementDraft", () => {
  it("accepts a plain announcement to a named list", () => {
    assert.equal(validateAnnouncementDraft(draft()), null);
  });

  it("refuses an empty audience", () => {
    // The one failure mode with no undo: this endpoint has no "everyone" mode, so an empty list
    // is a mistake, never a shorthand.
    assert.match(String(validateAnnouncementDraft(draft({ recipientIds: [] }))), /at least one recipient/);
  });

  it("refuses an audience past the per-request limit", () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, index) => `user-${index}`);
    assert.match(String(validateAnnouncementDraft(draft({ recipientIds: many }))), /or fewer/);
  });

  it("refuses HTML in the message", () => {
    assert.match(
      String(validateAnnouncementDraft(draft({ content: "Read <a href='#'>this</a>" }))),
      /HTML/,
    );
  });

  it("refuses a title past 255 characters", () => {
    assert.equal(validateAnnouncementDraft(draft({ title: "x".repeat(255) })), null);
    assert.match(String(validateAnnouncementDraft(draft({ title: "x".repeat(256) }))), /255/);
  });

  describe("SYSTEM", () => {
    it("refuses each promotional field by name", () => {
      assert.match(
        String(validateAnnouncementDraft(draft({ type: "SYSTEM", imageUrl: "https://x/y.png" }))),
        /image/,
      );
      assert.match(
        String(validateAnnouncementDraft(draft({ type: "SYSTEM", ctaLink: "https://x" }))),
        /call-to-action/,
      );
      assert.match(
        String(validateAnnouncementDraft(draft({ type: "SYSTEM", discountCode: "SAVE10" }))),
        /discount/,
      );
    });

    it("accepts a bare system notice", () => {
      assert.equal(validateAnnouncementDraft(draft({ type: "SYSTEM" })), null);
    });
  });

  describe("MAINTENANCE", () => {
    it("requires both ends of the window", () => {
      assert.match(String(validateAnnouncementDraft(draft({ type: "MAINTENANCE" }))), /start/);
      assert.match(
        String(
          validateAnnouncementDraft(
            draft({ type: "MAINTENANCE", downtimeStart: "2026-09-01T01:00" }),
          ),
        ),
        /end/,
      );
    });

    it("refuses a window that ends before it starts", () => {
      assert.match(
        String(
          validateAnnouncementDraft(
            draft({
              type: "MAINTENANCE",
              downtimeStart: "2026-09-01T03:00",
              downtimeEnd: "2026-09-01T01:00",
            }),
          ),
        ),
        /end after it starts/,
      );
    });

    it("refuses a zero-length window", () => {
      // The server's rule is GreaterThan, not GreaterThanOrEqual.
      assert.match(
        String(
          validateAnnouncementDraft(
            draft({
              type: "MAINTENANCE",
              downtimeStart: "2026-09-01T01:00",
              downtimeEnd: "2026-09-01T01:00",
            }),
          ),
        ),
        /end after it starts/,
      );
    });

    it("accepts a well-formed window", () => {
      assert.equal(
        validateAnnouncementDraft(
          draft({
            type: "MAINTENANCE",
            downtimeStart: "2026-09-01T01:00",
            downtimeEnd: "2026-09-01T03:00",
          }),
        ),
        null,
      );
    });
  });
});

describe("toUtcIso", () => {
  it("stamps the zone the admin typed in", () => {
    const iso = toUtcIso("2026-09-01T01:00");
    // Not asserted as a fixed string: the correct instant depends on the machine's zone, and a
    // test that hard-coded one would pass only where it was written. What must hold everywhere is
    // that the value carries a zone at all — the whole point of the conversion.
    assert.ok(iso?.endsWith("Z"));
    assert.ok(!Number.isNaN(Date.parse(String(iso))));
  });

  it("preserves ordering across the conversion", () => {
    const start = Date.parse(String(toUtcIso("2026-09-01T01:00")));
    const end = Date.parse(String(toUtcIso("2026-09-01T03:00")));
    assert.ok(end > start);
    assert.equal(end - start, 2 * 60 * 60 * 1000);
  });

  it("reads blank as absent rather than as the epoch", () => {
    assert.equal(toUtcIso(""), null);
    assert.equal(toUtcIso("   "), null);
    assert.equal(toUtcIso("not a date"), null);
  });
});

describe("buildCreateRequest", () => {
  it("always sends the one audience mode the endpoint accepts", () => {
    assert.equal(buildCreateRequest(draft()).targetAudienceMode, ANNOUNCEMENT_TARGET_MODE);
    assert.equal(buildCreateRequest(draft()).segmentId, null);
  });

  it("sends blank optional fields as null, not as empty strings", () => {
    // The mapper writes any non-null value into the payload JSON, so "" would be stored as a
    // present-but-empty link for the client to try to render.
    const request = buildCreateRequest(draft({ type: "PROMOTION" }));
    assert.equal(request.imageUrl, null);
    assert.equal(request.ctaLink, null);
    assert.equal(request.discountCode, null);
  });

  it("carries the promotional fields for a type that allows them", () => {
    const request = buildCreateRequest(
      draft({ type: "PROMOTION", discountCode: " SAVE10 ", ctaLink: "https://warptalk.vn/pricing" }),
    );
    assert.equal(request.discountCode, "SAVE10");
    assert.equal(request.ctaLink, "https://warptalk.vn/pricing");
  });

  it("drops promotional fields the type forbids even if the draft still holds them", () => {
    // Switching the type in the composer leaves the earlier values in state. They must not be
    // sent — the server would refuse with UNSUPPORTED_PAYLOAD_FIELD, and validation already told
    // the admin to clear them, so this is the second line rather than the first.
    const request = buildCreateRequest(draft({ type: "SYSTEM", discountCode: "SAVE10" }));
    assert.equal(request.discountCode, null);
  });

  it("drops a downtime window from a type that has no use for one", () => {
    const request = buildCreateRequest(
      draft({ type: "PROMOTION", downtimeStart: "2026-09-01T01:00", downtimeEnd: "2026-09-01T03:00" }),
    );
    assert.equal(request.downtimeStart, null);
    assert.equal(request.downtimeEnd, null);
  });

  it("sends a maintenance window as a zoned instant", () => {
    const request = buildCreateRequest(
      draft({ type: "MAINTENANCE", downtimeStart: "2026-09-01T01:00", downtimeEnd: "2026-09-01T03:00" }),
    );
    assert.ok(request.downtimeStart?.endsWith("Z"));
    assert.ok(request.downtimeEnd?.endsWith("Z"));
  });

  it("trims the text it sends", () => {
    const request = buildCreateRequest(draft({ title: "  Upgrade  ", content: "  Body  " }));
    assert.equal(request.title, "Upgrade");
    assert.equal(request.content, "Body");
  });
});
