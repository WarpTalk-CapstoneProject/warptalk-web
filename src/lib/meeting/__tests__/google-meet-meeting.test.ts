import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isGoogleMeetMeeting } from "../google-meet-meeting.ts";

const MEET_URL = "https://meet.google.com/abc-defg-hij";

describe("Calendar — which meetings carry the Google Meet mark", () => {
  test("a meeting on Google Meet with its link", () => {
    assert.equal(isGoogleMeetMeeting({ externalProvider: "GOOGLE_MEET", externalMeetingUrl: MEET_URL }), true);
  });

  test("the provider is read without regard to case", () => {
    assert.equal(isGoogleMeetMeeting({ externalProvider: "google_meet", externalMeetingUrl: MEET_URL }), true);
  });

  test("a provider without a link gets no mark: a mark that opens nothing is worse than none", () => {
    assert.equal(isGoogleMeetMeeting({ externalProvider: "GOOGLE_MEET", externalMeetingUrl: null }), false);
    assert.equal(isGoogleMeetMeeting({ externalProvider: "GOOGLE_MEET", externalMeetingUrl: "" }), false);
    assert.equal(isGoogleMeetMeeting({ externalProvider: "GOOGLE_MEET" }), false);
  });

  test("a WarpTalk room, or another provider, is not a Google Meet meeting", () => {
    assert.equal(isGoogleMeetMeeting({}), false);
    assert.equal(isGoogleMeetMeeting({ externalProvider: null, externalMeetingUrl: MEET_URL }), false);
    assert.equal(isGoogleMeetMeeting({ externalProvider: "ZOOM", externalMeetingUrl: "https://zoom.us/j/1" }), false);
  });
});
