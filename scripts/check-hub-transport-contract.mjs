#!/usr/bin/env node
/**
 * The meeting-chat and assistant hubs must connect WebSockets-only with skipNegotiation.
 *
 * WHY
 *   Both hubs live in services that run several replicas behind a Kubernetes Service, reached
 *   through the gateway's YARP proxy. Nothing pins a client to one pod, so a negotiate answered by
 *   replica A followed by a WebSocket upgrade routed to replica B fails with "No Connection with
 *   that ID" — intermittently, roughly (N-1)/N of the time. Skipping negotiation lets the WebSocket
 *   request create the connection on whichever replica gets it. The backend restricts those two
 *   hubs to WebSockets (warptalk-backend #428), so Long Polling must not be requested for them.
 *
 *   The gateway hubs keep negotiate + Long Polling: Traefik's sticky cookie holds both requests on
 *   one gateway pod, and removing the fallback would cost users behind WebSocket-blocking proxies.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src/lib/realtime/signalr.ts"), "utf8");
const failures = [];

const listMatch = source.match(/SKIP_NEGOTIATION_HUBS[^=]*=\s*\[([\s\S]*?)\]/);
if (!listMatch) {
  failures.push("SKIP_NEGOTIATION_HUBS is missing from src/lib/realtime/signalr.ts.");
} else {
  const listed = [...listMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const hub of ["/api/v1/meetings/chat-hub", "/api/v1/assistant/chat-hub"]) {
    if (!listed.includes(hub)) failures.push(`${hub} must skip negotiation (it is proxied to a multi-replica service).`);
  }
  for (const hub of listed) {
    if (hub.startsWith("/hubs/")) {
      failures.push(`${hub} is a gateway hub: it relies on the sticky cookie and keeps Long Polling; do not skip negotiation for it.`);
    }
  }
}

const fnMatch = source.match(/export function hubTransportOptions[\s\S]*?\n}\n/);
if (!fnMatch) {
  failures.push("hubTransportOptions is missing.");
} else {
  const fn = fnMatch[0];
  if (!/skipNegotiation:\s*true/.test(fn)) failures.push("hubTransportOptions must set skipNegotiation: true for the proxied hubs.");
  if (!/transport:\s*signalR\.HttpTransportType\.WebSockets,\s*skipNegotiation/.test(fn)) {
    failures.push("skipNegotiation requires the WebSockets transport alone.");
  }
}

if (!/\.\.\.hubTransportOptions\(hubPath\)/.test(source)) {
  failures.push("createHubConnection must take its transport options from hubTransportOptions(hubPath).");
}
if (/withUrl\([^)]*\{\s*transport:/.test(source)) {
  failures.push("createHubConnection hard-codes a transport again; use hubTransportOptions.");
}

if (failures.length > 0) {
  console.error("Hub transport contract FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Hub transport contract passed.");
