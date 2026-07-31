import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const peoplePanel = fs.readFileSync(
  path.join(
    root,
    "src/components/rooms/live/side-panel/people-panel.tsx",
  ),
  "utf8",
);

assert.match(
  peoplePanel,
  /participant\.status === "waiting"[\s\S]*?<Button[\s\S]*?disabled=\{admit\.isPending\}[\s\S]*?\{admit\.isPending \? "Approving\.\.\." : "Approve"\}/,
  "Waiting participants must have a visible, labelled Approve button with a pending state.",
);

console.log("Participant approval UI contract: PASS");
