import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "src/app");

/**
 * No page component may call a hook after an early return.
 *
 * React counts hooks per render. A component that returns early while its data is still
 * loading, and then calls a hook further down, runs a different NUMBER of hooks on the
 * first render than on the second — and React answers that with error #310, "Rendered
 * more hooks than during the previous render". That is not a degraded page; it is a blank
 * error screen where the route used to be.
 *
 * This happened on the room detail page. `useActiveMeetingStore` was added below an
 * `if (!room) return ...` guard that had been there for two months, so every fresh load of
 * /{workspace}/rooms/{id} died as soon as the room query resolved.
 *
 * Nothing caught it, and it is worth being precise about why, because the obvious answer
 * is wrong: react-hooks/rules-of-hooks does NOT flag this. That rule looks for hooks inside
 * conditionals, loops and nested functions. A hook sitting after an early return is still
 * syntactically at the top level of the function body, so the rule sees nothing — verified
 * by running eslint against the broken file, which reported zero findings. Raising the rule
 * from "warn" to "error" would not have helped either.
 *
 * So this is a static check instead, in the style of the other contracts here: inside a
 * component body, once a top-level `return` has appeared, no further top-level statement
 * may call a hook.
 */

const HOOK_CALL = /(?:^|[\s=([{,])(use[A-Z]\w*)\s*\(/;

/** `useUIStore.getState()` reads a store imperatively — a method call, not a hook. */
const STORE_ACCESSOR = /use[A-Z]\w*\s*\.\s*\w+\s*\(/;

async function* pageFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* pageFiles(full);
    } else if (/^(page|layout|template)\.tsx$/.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * Statements at the top level of a component body, which prettier indents by exactly two
 * spaces. Anything deeper belongs to a nested function or a block, where an early return
 * governs only that inner scope and the hook rule does not apply.
 */
const TOP_LEVEL = /^ {2}\S/;
const COMPONENT_START = /^export default function \w+\(/;

/**
 * Only a guard counts, and identifying one has to be precise in both directions.
 *
 * Matching any `return` indented two-to-four spaces was the first attempt, and it reported
 * history/page.tsx and rooms/page.tsx — where the `return` belongs to a `useMemo(() => {`
 * callback, not to the component. A check that fails CI on correct code is worse than no
 * check, so an early return is recognised only in the two shapes a guard actually takes:
 *
 *     if (!room) return null;          // one-liner
 *     if (!room) {                     // block, return nested inside
 *       return <Something />;
 *     }
 */
const GUARD_ONE_LINER = /^ {2}if \(.*\)\s*return[\s;]/;
const GUARD_BLOCK_OPEN = /^ {2}if \(.*\)\s*\{\s*$/;
const GUARD_BLOCK_CLOSE = /^ {2}\}/;
const NESTED_RETURN = /^ {4}return[\s;(]/;
const FINAL_RETURN = /^ {2}return[\s;(]/;

function findViolations(source) {
  const lines = source.split("\n");
  const violations = [];
  let inComponent = false;
  let returned = false;
  let inGuardBlock = false;

  for (const [index, line] of lines.entries()) {
    if (COMPONENT_START.test(line)) {
      inComponent = true;
      returned = false;
      inGuardBlock = false;
      continue;
    }
    if (!inComponent) continue;
    // Column 0 means the component body has closed.
    if (/^\S/.test(line) && line.trim() !== "") {
      inComponent = false;
      continue;
    }

    if (GUARD_ONE_LINER.test(line) || FINAL_RETURN.test(line)) {
      returned = true;
      continue;
    }
    if (GUARD_BLOCK_OPEN.test(line)) {
      inGuardBlock = true;
      continue;
    }
    if (inGuardBlock) {
      if (NESTED_RETURN.test(line)) returned = true;
      if (GUARD_BLOCK_CLOSE.test(line)) inGuardBlock = false;
      continue;
    }

    if (!TOP_LEVEL.test(line)) continue;
    if (!returned) continue;

    const match = line.match(HOOK_CALL);
    if (match && !STORE_ACCESSOR.test(line)) {
      violations.push({ line: index + 1, hook: match[1], text: line.trim() });
    }
  }

  return violations;
}

const failures = [];
for await (const file of pageFiles(appDir)) {
  const source = await readFile(file, "utf8");
  for (const violation of findViolations(source)) {
    failures.push(
      `${path.relative(root, file)}:${violation.line} calls ${violation.hook}() after an early return — ${violation.text}`,
    );
  }
}

assert.deepEqual(
  failures,
  [],
  `A hook after an early return changes how many hooks run between renders, which React reports as error #310 and the user sees as a blank error page. Move the hook above the guard:\n  ${failures.join("\n  ")}`,
);

console.log("Hooks-before-early-return contract passed.");
