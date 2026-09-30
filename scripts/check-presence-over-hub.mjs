#!/usr/bin/env node
/**
 * Presence is resolved over the notification hub, not over REST.
 *
 * WHY
 *   Live presence already arrived on the notification hub (UserPresenceChanged), but the starting
 *   state came from POST /api/v1/presence/query. On 2026-09-24 a retry loop on that lookup spent
 *   the account's whole 180/min gateway budget and every other API answered 429 (web #562). The
 *   owner's rule since then: presence travels over the WebSocket. The snapshot is asked for with
 *   NotificationHub.QueryPresence on the connection RealtimeNotificationProvider owns.
 *
 * WHAT THIS PINS
 *   Web side (always):
 *     1. Nothing in src/ calls the REST endpoint. It stays on the backend for older clients only.
 *     2. The presence service invokes the hub method through NOTIFICATION_HUB_METHODS, and that
 *        constant says "QueryPresence".
 *     3. usePresence takes the connection from useRealtime() and WAITS for it: no request while
 *        the hub is not connected, and no fallback to anything else.
 *     4. The #562 back-off survives: failed ids go through presenceIdsToRequest/failedAt.
 *
 *   Backend side (when WARPTALK_BACKEND_ROOT is set, as CI does after checking out the sibling
 *   branch): every method this client invokes on the notification hub — the ones named through
 *   NOTIFICATION_HUB_METHODS and the literal invokes in RealtimeNotificationProvider — is a public
 *   method on the Gateway's NotificationHub. A client->server name has no emitter/handler pair for
 *   the realtime event contract to diff, so without this a rename fails only at runtime, with
 *   "Method does not exist", and presence just silently never resolves.
 *
 *   The backend half deliberately does NOT fall back to a sibling ../warptalk-backend checkout: the
 *   shared local checkout is usually on some unrelated branch, and a check that answers for
 *   whatever happens to be checked out there is a false red (or a false green).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const failures = [];

const HOOK = "src/hooks/use-presence.ts";
const SERVICE = "src/services/presence.service.ts";
const CONSTANTS = "src/constants/realtime.ts";
const PROVIDER = "src/components/providers/realtime-notification-provider.tsx";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Source with comments removed, so prose that NAMES the old endpoint is not a call to it. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

// ---- 1. No REST presence lookup anywhere in the client ---------------------------------------
for (const file of walk(join(root, "src"))) {
  if (/__tests__|\.test\.tsx?$/.test(file)) continue;
  if (/["'`][^"'`]*\/presence\/query/.test(code(readFileSync(file, "utf8")))) {
    failures.push(
      `${relative(root, file)} calls /presence/query. Presence is resolved over the notification ` +
        "hub (QueryPresence); the REST endpoint is kept for older clients only.",
    );
  }
}

// ---- 2. The service invokes the hub method by its constant ------------------------------------
const constants = read(CONSTANTS);
const methodsBlock = constants.match(/export const NOTIFICATION_HUB_METHODS\s*=\s*\{([\s\S]*?)\n\}/);
const hubMethods = methodsBlock
  ? Object.fromEntries([...methodsBlock[1].matchAll(/(\w+)\s*:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]))
  : {};
if (hubMethods.QUERY_PRESENCE !== "QueryPresence") {
  failures.push(`${CONSTANTS}: NOTIFICATION_HUB_METHODS.QUERY_PRESENCE must be "QueryPresence".`);
}

const service = code(read(SERVICE));
if (!/\.invoke\s*(<[^>]*>)?\s*\(\s*NOTIFICATION_HUB_METHODS\.QUERY_PRESENCE/.test(service)) {
  failures.push(`${SERVICE}: must invoke NOTIFICATION_HUB_METHODS.QUERY_PRESENCE on the hub connection.`);
}
if (/apiClient|fetch\s*\(|axios/.test(service)) {
  failures.push(`${SERVICE}: must not reach presence over HTTP.`);
}

// ---- 3. The hook uses the provider's connection, and waits for it -----------------------------
const hook = code(read(HOOK));
if (!/useRealtime\s*\(\s*\)/.test(hook)) {
  failures.push(
    `${HOOK}: must take the connection from useRealtime() — the one RealtimeNotificationProvider ` +
      "owns — rather than opening its own.",
  );
}
if (/createHubConnection|HubConnectionBuilder/.test(hook + service)) {
  failures.push(`${HOOK} / ${SERVICE}: must not open a second hub connection.`);
}
if (!/if\s*\(\s*!connection\s*\|\|\s*!isConnected\s*\)\s*return/.test(hook)) {
  failures.push(
    `${HOOK}: must not ask for presence until the hub is connected (\`if (!connection || ` +
      "!isConnected) return;`) — and must not fall back to anything while it waits.",
  );
}
if (/apiClient|fetch\s*\(/.test(hook)) {
  failures.push(`${HOOK}: must not fall back to HTTP.`);
}

// ---- 4. The #562 back-off survives the move ---------------------------------------------------
if (!/presenceIdsToRequest\s*\(/.test(hook) || !/failedAt\.set\s*\(/.test(hook)) {
  failures.push(
    `${HOOK}: failed ids must still go through presenceIdsToRequest / failedAt, or one failure ` +
      "becomes a loop again (web #562).",
  );
}

// ---- Backend: every notification-hub invoke names a real NotificationHub method --------------
const backendRoot = process.env.WARPTALK_BACKEND_ROOT;
if (backendRoot) {
  const hubFile = join(backendRoot, "gateway/src/WarpTalk.Gateway/Hubs/NotificationHub.cs");
  if (!existsSync(hubFile) || !statSync(hubFile).isFile()) {
    failures.push(`WARPTALK_BACKEND_ROOT is set but ${hubFile} does not exist.`);
  } else {
    const hub = readFileSync(hubFile, "utf8");
    const serverMethods = new Set(
      [...hub.matchAll(/public\s+(?:async\s+)?(?:Task(?:<[^>]+>)?|void)\s+(\w+)\s*\(/g)].map((m) => m[1]),
    );
    const invoked = new Set(Object.values(hubMethods));
    for (const m of code(read(PROVIDER)).matchAll(/\.invoke\s*(?:<[^>]*>)?\s*\(\s*"([^"]+)"/g)) {
      invoked.add(m[1]);
    }
    for (const name of invoked) {
      if (!serverMethods.has(name)) {
        failures.push(
          `The web client invokes "${name}" on the notification hub, and the Gateway's ` +
            `NotificationHub (${relative(backendRoot, hubFile)}) has no public method by that name. ` +
            "It would fail at runtime with \"Method does not exist\". If the backend change is on " +
            "an unmerged branch, give it this branch's name so CI validates against it.",
        );
      }
    }
    console.log(`Checked ${invoked.size} notification-hub invokes against the backend: ${[...invoked].join(", ")}.`);
  }
} else {
  console.log("WARPTALK_BACKEND_ROOT not set: web half only (CI runs the backend half).");
}

if (failures.length > 0) {
  console.error("Presence-over-hub contract FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Presence-over-hub contract passed.");
