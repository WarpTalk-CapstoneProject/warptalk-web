import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hook = await readFile(path.join(root, "src/hooks/use-room-history.ts"), "utf8");
const roomPage = await readFile(
  path.join(root, "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx"),
  "utf8",
);

// WT-509: a summary lands ~40s after a meeting ends, so both surfaces that show one must
// re-ask. `useRoomHistory` carried the poll and `useEndedRoomRecord` did not — so the archive
// list updated itself while the meeting-record page, the page somebody actually opens after
// their meeting, sat on "Generating summary…" until a manual reload. The room page even
// documented the behaviour it was not getting.
//
// The fix is not "add it to the other hook too" — that is two copies of one rule, which is how
// they came apart. It belongs to the shared query object both hooks build on.

/** The body of `roomHistoryQuery`, which both hooks spread. */
const sharedQuery = hook.slice(
  hook.indexOf("function roomHistoryQuery"),
  hook.indexOf("export function useRoomHistory"),
);

const bodyOf = (name) => {
  const start = hook.indexOf(`export function ${name}`);
  if (start < 0) return "";
  const next = hook.indexOf("\nexport function ", start + 1);
  return next < 0 ? hook.slice(start) : hook.slice(start, next);
};

const checks = [
  [
    "the poll lives on the query both hooks share, so neither can be the one that forgets",
    /refetchInterval/.test(sharedQuery) && /shouldPollRoomHistory/.test(sharedQuery),
  ],
  [
    "useEndedRoomRecord — the meeting-record page's hook — therefore polls",
    hook.includes("export function useEndedRoomRecord") &&
      /\.\.\.roomHistoryQuery\(/.test(bodyOf("useEndedRoomRecord")),
  ],
  [
    "useRoomHistory builds on the same object rather than restating the poll",
    /\.\.\.roomHistoryQuery\(/.test(bodyOf("useRoomHistory")) &&
      !/refetchInterval/.test(bodyOf("useRoomHistory")),
  ],
  [
    "no hook carries its own private copy of the interval",
    !/refetchInterval/.test(bodyOf("useEndedRoomRecord")),
  ],
  [
    "the poll stops on its own, so an idle tab is not left on an unbounded interval",
    /:\s*false/.test(sharedQuery),
  ],
  [
    "the room page's claim that its record refetches is backed by the hook it uses",
    // The page says "`useEndedRoomRecord` already polls while anything is generating, so this
    // clears itself" and renders "Still writing this up" on the strength of it.
    !roomPage.includes("already polls while anything is generating") ||
      /refetchInterval/.test(sharedQuery),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} room-record polling contract(s) broken.`);
  process.exitCode = 1;
}
