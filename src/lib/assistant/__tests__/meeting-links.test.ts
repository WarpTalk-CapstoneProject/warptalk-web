import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  extractMeetingLinks,
  formatMeetingWhen,
  stripMeetingMarkers,
} from "../meeting-links.ts";

const ROOM_ID = "3f2b8c1e-0a4d-4b6f-9e21-7c5d8a9b0e12";
const MEET_URL = "https://meet.google.com/abc-defg-hij";

function marker(fields: Record<string, unknown>): string {
  return `<!-- warpbot:meeting ${JSON.stringify(fields)} -->`;
}

describe("WarpBot — meeting cards come from the worker's marker", () => {
  test("a Google Meet marker carries the link, the code, the time and the calendar event", () => {
    const md = `Đã tạo cuộc họp.\n\n${marker({
      kind: "google_meet",
      url: MEET_URL,
      title: "Quick sync",
      start: "2026-09-18T08:40:00+00:00",
      end: "2026-09-18T09:10:00+00:00",
      calendarUrl: "https://www.google.com/calendar/event?eid=abc",
    })}`;

    assert.deepEqual(extractMeetingLinks(md), [
      {
        kind: "google_meet",
        url: MEET_URL,
        id: "abc-defg-hij",
        code: "abc-defg-hij",
        title: "Quick sync",
        start: "2026-09-18T08:40:00+00:00",
        end: "2026-09-18T09:10:00+00:00",
        calendarUrl: "https://www.google.com/calendar/event?eid=abc",
      },
    ]);
  });

  test("a room marker keeps its code and its bridge type", () => {
    const md = marker({
      kind: "warptalk_room",
      url: `/rooms/${ROOM_ID}`,
      title: "Japan client",
      code: "WT-8K2P4Q",
      roomType: "EXTERNAL_BRIDGE",
    });
    assert.deepEqual(extractMeetingLinks(md), [
      {
        kind: "warptalk_room",
        url: `/rooms/${ROOM_ID}`,
        id: ROOM_ID,
        code: "WT-8K2P4Q",
        title: "Japan client",
        roomType: "EXTERNAL_BRIDGE",
        start: undefined,
        end: undefined,
      },
    ]);
  });

  test("a meeting merely mentioned in prose gets no card", () => {
    const md = `Bạn có 2 cuộc họp: ${MEET_URL} và [Sync](/rooms/${ROOM_ID})`;
    assert.deepEqual(extractMeetingLinks(md), []);
  });

  test("a marker whose URL is not ours is refused — the card carries a Join button", () => {
    for (const url of [
      "https://evil.test/abc-defg-hij",
      "https://meet.google.com.evil.test/abc-defg-hij",
      "https://meet.google.com/landing",
      "http://meet.google.com/abc-defg-hij",
    ]) {
      assert.deepEqual(extractMeetingLinks(marker({ kind: "google_meet", url })), [], url);
    }
    for (const url of [
      `https://evil.test/rooms/${ROOM_ID}`,
      "/rooms/not-a-guid",
      `/api/x/rooms/${ROOM_ID}`,
    ]) {
      assert.deepEqual(extractMeetingLinks(marker({ kind: "warptalk_room", url })), [], url);
    }
  });

  test("a Calendar link off Google's calendar host is dropped, the card is not", () => {
    const [link] = extractMeetingLinks(
      marker({ kind: "google_meet", url: MEET_URL, calendarUrl: "https://evil.test/c" }),
    );
    assert.equal(link.calendarUrl, undefined);
  });

  test("junk is ignored rather than thrown", () => {
    assert.deepEqual(extractMeetingLinks("<!-- warpbot:meeting {not json} -->"), []);
    assert.deepEqual(extractMeetingLinks(marker({ kind: "elsewhere", url: MEET_URL })), []);
    assert.deepEqual(extractMeetingLinks(""), []);
  });

  test("one card per meeting, however many markers", () => {
    const md = [marker({ kind: "google_meet", url: MEET_URL }), marker({ kind: "google_meet", url: `${MEET_URL}?authuser=0` })].join("\n");
    assert.equal(extractMeetingLinks(md).length, 1);
  });

  test("the markers come out of the text a reader sees", () => {
    // react-markdown has no raw-HTML plugin here, and it PRINTS an HTML comment rather than
    // dropping it: the JSON showed up under the answer in full until AssistantMarkdown started
    // stripping markers before rendering.
    const md = `Đã tạo.\n\n${marker({ kind: "google_meet", url: MEET_URL })}`;
    assert.equal(stripMeetingMarkers(md), "Đã tạo.");
    assert.equal(
      stripMeetingMarkers(`A\n\n${marker({ kind: "google_meet", url: MEET_URL })}\n\nB`),
      "A\n\nB",
    );
    assert.equal(stripMeetingMarkers("no markers here"), "no markers here");
  });
});

describe("WarpBot — when a meeting is, in the reader's own time zone", () => {
  const now = new Date("2026-09-18T10:00:00");

  test("today, tomorrow, or a named day", () => {
    assert.equal(
      formatMeetingWhen("2026-09-18T15:40:00", "2026-09-18T16:10:00", now),
      "Today 15:40 – 16:10",
    );
    assert.equal(formatMeetingWhen("2026-09-19T09:00:00", undefined, now), "Tomorrow 09:00");
    // The month's short name is the runtime's ("Sep" or "Sept"), the shape is ours.
    assert.match(
      formatMeetingWhen("2026-09-22T09:00:00", "2026-09-22T10:00:00", now),
      /^Tue 22 Sept? 09:00 – 10:00$/,
    );
  });

  test("no start, or an unreadable one, says nothing", () => {
    assert.equal(formatMeetingWhen(undefined, undefined, now), "");
    assert.equal(formatMeetingWhen("not a date", undefined, now), "");
    assert.equal(formatMeetingWhen("2026-09-18T15:40:00", "not a date", now), "Today 15:40");
  });
});
