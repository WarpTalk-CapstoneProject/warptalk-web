#!/usr/bin/env node
/**
 * A summary that has landed must reach the screen without a reload. WT-509.
 *
 * The reported state was a Notification Center reading "Summary ready for X" directly above a
 * Summary tab still spinning on "Generating summary…". Neither was lying; they were reading
 * different caches, and only one of them had been told.
 *
 * The reason this is a contract script rather than a unit test is that the defect was a fix
 * applied to ONE OF TWO TWINS. `useRoomHistory` and `useEndedRoomRecord` sit ten lines apart, read
 * the same query, and serve the archive list and the single-meeting record respectively. The
 * polling fix went on the list — its comment even says what it prevents — and the record hook, the
 * one the meeting page actually uses, was left without it. Nothing failed; the list just happened
 * to be the screen somebody tested.
 *
 * Both signals are pinned here because they cover different gaps: the invalidation is the fast
 * path for anyone with the page open, and the poll is what covers a client whose realtime
 * connection dropped.
 */

import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const roomHistoryHooks = read("src/hooks/use-room-history.ts");
const notificationProvider = read("src/components/providers/realtime-notification-provider.tsx");
const recordPanels = read("src/components/rooms/meeting-record-panels.tsx");

/**
 * Source with comments removed, for the one check below that is about CODE.
 *
 * meeting-record-panels.tsx explains in prose why `isGenerating = !artifact && recentlyEnded`
 * was replaced, and a check that cannot tell an explanation from an implementation would forbid
 * saying so — the same trap check-workspace-plan-gate.mjs records.
 */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The body of one exported hook, so a check about one cannot be satisfied by the other. */
function hookBody(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  if (start === -1) return "";
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

const checks = [];

checks.push([
  "the archive list still polls while something is being produced",
  /refetchInterval:/.test(hookBody(roomHistoryHooks, "useRoomHistory")),
]);

checks.push([
  "the single-meeting record polls too — this is the twin the fix missed",
  /refetchInterval:/.test(hookBody(roomHistoryHooks, "useEndedRoomRecord")),
]);

checks.push([
  "the record's poll is scoped to its own room, so an idle tab does not poll for other meetings",
  /roomId/.test(
    hookBody(roomHistoryHooks, "useEndedRoomRecord").match(/refetchInterval:[\s\S]*?\n {4}\w/)?.[0] ?? "",
  ),
]);

checks.push([
  "polling stops once nothing is generating, rather than running forever",
  hookBody(roomHistoryHooks, "useRoomHistory").includes("shouldPollRoomHistory") &&
    hookBody(roomHistoryHooks, "useEndedRoomRecord").includes("shouldPollRoomHistory"),
]);

checks.push([
  "a summary-ready notification refreshes the record it is announcing",
  notificationProvider.includes('notif.type === "MEETING_SUMMARY_READY"') &&
    /queryKey: \["room-history"\]/.test(notificationProvider),
]);

checks.push([
  "the Summary panel still reads its state from the artifact, not from a wall clock",
  recordPanels.includes("resolveSummaryState") &&
    !/isGenerating\s*=\s*!artifact/.test(withoutComments(recordPanels)),
]);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

const failures = checks.filter(([, passed]) => !passed);
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
