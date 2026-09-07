/**
 * The rules the `/admin/plugins` screens read a catalog row by, kept out of the components so
 * they can be tested without a browser (WT-646).
 *
 * Two of them are worth more than the rest.
 *
 * `catalogRowCannotConnect` names the exact condition that took Google consent down in
 * production: a row that asserts an operator-supplied OAuth client and holds no client id. The
 * consent screen was built with `client_id=`, the provider rejected it, and nothing anywhere in
 * the product said so — the catalog listing showed a perfectly ordinary row. It is a badge on the
 * list rather than something you find by opening each row.
 *
 * `parseToolManifest` mirrors `PluginToolManifestValidator` on the server, and mirrors it
 * deliberately rather than trusting the round trip: `PUT .../tools` replaces the manifest
 * wholesale, so an operator who pastes a manifest with one bad entry should be told which entry
 * before the whole thing is submitted. The server remains the authority — this only saves the
 * trip.
 */

import type {
  AdminPluginCatalogListItemDto,
  AdminPluginKind,
  AdminPluginOAuthClientSource,
  AdminPluginToolManifestEntry,
} from "@/types/admin-plugin-catalog";

export const PLUGIN_KIND_LABELS: Record<AdminPluginKind, string> = {
  native: "native",
  mcp: "MCP",
};

export const OAUTH_CLIENT_SOURCE_LABELS: Record<AdminPluginOAuthClientSource, string> = {
  unresolved: "unresolved",
  preregistered: "preregistered",
  cimd: "CIMD",
  dcr: "DCR",
};

/**
 * What each source means in one line, for the column header's benefit rather than a tooltip
 * nobody opens.
 */
export const OAUTH_CLIENT_SOURCE_NOTES: Record<AdminPluginOAuthClientSource, string> = {
  unresolved: "Discovery has not run. The registration ladder chooses on the first connect.",
  preregistered: "An operator supplied the client id. It must be present on this row.",
  cimd: "The client is identified by our published metadata document URL.",
  dcr: "Credentials came from RFC 7591 dynamic registration.",
};

/**
 * Whether the catalog row is where this plugin's OAuth client lives at all.
 *
 * A native row's credentials come from service configuration (`GOOGLE_CLIENT_ID` and friends), not
 * from the row — the server refuses `PUT .../oauth` on one for that reason. Offering the panel
 * anyway would let an operator chasing an empty client id type one in, watch it save, and believe
 * the problem fixed while nothing had changed.
 */
export function catalogOwnsOAuthClient(kind: AdminPluginKind): boolean {
  return kind === "mcp";
}

/** Discovery only applies to a row that walks the registration ladder — i.e. an MCP row. */
export function supportsRediscovery(kind: AdminPluginKind): boolean {
  return kind === "mcp";
}

/**
 * True when the row names a client source that requires a stored client id and does not have one.
 *
 * Only `preregistered` qualifies. `cimd` and `dcr` obtain a client at connect time and `unresolved`
 * has not tried yet, so a missing id there is the normal state of a row nobody has connected —
 * flagging it would be a warning every new row wears, which is a warning nobody reads.
 *
 * Native rows are excluded because the catalog genuinely cannot see their credentials: they are
 * environment configuration. This screen must not claim a native row is fine, and must not claim
 * it is broken either.
 */
export function catalogRowCannotConnect(
  row: Pick<AdminPluginCatalogListItemDto, "kind" | "oAuthClientSource" | "hasClientId">,
): boolean {
  return (
    row.kind === "mcp" && row.oAuthClientSource === "preregistered" && !row.hasClientId
  );
}

/** The sentence the badge's tooltip carries, so list and detail say the same thing. */
export const MISSING_CLIENT_ID_EXPLANATION =
  "This row is marked pre-registered but holds no OAuth client id, so a connect attempt builds a consent URL with an empty client_id and the provider refuses it. Set the client id below.";

// ── Tool manifest ────────────────────────────────────────────────────────────

/** Mirrors the server's `ToolNamePattern`. */
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,150}$/;
const MAX_TOOL_COUNT = 100;
const MAX_TOOL_LABEL = 150;
const MAX_TOOL_DESCRIPTION = 1000;

export type ToolManifestParseResult =
  | { ok: true; tools: AdminPluginToolManifestEntry[] }
  | { ok: false; errors: string[] };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses and validates the text in the manifest editor.
 *
 * Returns EVERY problem rather than the first, for the same reason the server does: an operator
 * editing a manifest by hand wants one round of corrections, not one per typo.
 */
export function parseToolManifest(text: string): ToolManifestParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      errors: ["The manifest is empty. Use [] to clear the tools on this plugin."],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return {
      ok: false,
      errors: [
        `That is not valid JSON: ${error instanceof Error ? error.message : "could not be parsed"}.`,
      ],
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      errors: ["The manifest must be a JSON array of tools. Use [] to clear it."],
    };
  }

  const errors: string[] = [];
  if (parsed.length > MAX_TOOL_COUNT) {
    errors.push(
      `A manifest may hold at most ${MAX_TOOL_COUNT} tools; ${parsed.length} were written.`,
    );
  }

  const tools: AdminPluginToolManifestEntry[] = [];
  const seen = new Set<string>();

  parsed.forEach((raw, index) => {
    const position = `tools[${index}]`;
    if (!isPlainRecord(raw)) {
      errors.push(`${position} must be an object.`);
      return;
    }

    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (name.length === 0) {
      errors.push(`${position}: 'name' is required.`);
    } else if (!TOOL_NAME_PATTERN.test(name)) {
      errors.push(
        `${position}: 'name' must be 1-150 characters of letters, digits, '_', '.' or '-' (got '${name}').`,
      );
    } else if (seen.has(name.toLowerCase())) {
      errors.push(`${position}: duplicate tool name '${name}'.`);
    } else {
      seen.add(name.toLowerCase());
    }

    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (label.length === 0) {
      errors.push(`${position}: 'label' is required — it is what the UI shows for the tool.`);
    } else if (label.length > MAX_TOOL_LABEL) {
      errors.push(`${position}: 'label' must be at most ${MAX_TOOL_LABEL} characters.`);
    }

    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    if (description.length === 0) {
      errors.push(
        `${position}: 'description' is required — it is the only thing telling the model when to pick this tool.`,
      );
    } else if (description.length > MAX_TOOL_DESCRIPTION) {
      errors.push(`${position}: 'description' must be at most ${MAX_TOOL_DESCRIPTION} characters.`);
    }

    // Not decoration: 'write' is what makes a call require a confirmation token before it runs, so
    // a tool that should be 'write' and says 'read' executes a side effect with no confirmation.
    const effect = typeof raw.effect === "string" ? raw.effect.trim() : "";
    if (effect.length === 0) {
      errors.push(`${position}: 'effect' is required.`);
    } else if (effect !== "read" && effect !== "write") {
      errors.push(`${position}: 'effect' must be 'read' or 'write' (got '${effect}').`);
    }

    const scopes = validateScopes(raw.requiredScopes, position, errors);
    const parameters = validateParameters(raw.parameters, position, errors);

    tools.push({
      name,
      label,
      description,
      effect,
      requiredScopes: scopes,
      parameters: parameters ?? {},
      resourceKey: optionalString(raw.resourceKey),
      resourceLabel: optionalString(raw.resourceLabel),
      resourceAvatarUrl: optionalString(raw.resourceAvatarUrl),
    });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, tools };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function validateScopes(value: unknown, position: string, errors: string[]): string[] {
  // Required as a property, allowed to be empty as a value. A manifest that simply forgot the
  // property would otherwise read as "needs nothing" at the scope check on every call.
  if (!Array.isArray(value)) {
    errors.push(
      `${position}: 'requiredScopes' is required. Use [] for a tool that needs no additional scope.`,
    );
    return [];
  }

  const scopes: string[] = [];
  for (const entry of value) {
    const scope = typeof entry === "string" ? entry.trim() : "";
    if (scope.length === 0) {
      errors.push(`${position}: 'requiredScopes' contains a blank entry.`);
      continue;
    }
    if (scopes.includes(scope)) {
      errors.push(`${position}: 'requiredScopes' repeats '${scope}'.`);
      continue;
    }
    scopes.push(scope);
  }
  return scopes;
}

/**
 * `parameters` has to be a JSON Schema object of the shape a function-calling API accepts, which
 * is narrower than "is valid JSON".
 */
function validateParameters(
  value: unknown,
  position: string,
  errors: string[],
): Record<string, unknown> | null {
  if (!isPlainRecord(value)) {
    errors.push(`${position}: 'parameters' is required and must be a JSON Schema object.`);
    return null;
  }

  if (value.type !== "object") {
    errors.push(
      `${position}: 'parameters.type' must be "object" (got ${
        value.type === undefined ? "nothing" : JSON.stringify(value.type)
      }).`,
    );
    return value;
  }

  if (!isPlainRecord(value.properties)) {
    errors.push(
      `${position}: 'parameters.properties' must be an object. Use {} for a tool that takes no arguments.`,
    );
    return value;
  }

  const properties = value.properties;
  for (const [key, property] of Object.entries(properties)) {
    if (!isPlainRecord(property)) {
      errors.push(`${position}: 'parameters.properties.${key}' must be an object.`);
    }
  }

  if (value.required !== undefined) {
    if (!Array.isArray(value.required)) {
      errors.push(`${position}: 'parameters.required' must be an array of property names.`);
    } else {
      for (const entry of value.required) {
        const propertyName = typeof entry === "string" ? entry.trim() : "";
        if (propertyName.length === 0) {
          errors.push(`${position}: 'parameters.required' contains a blank entry.`);
        } else if (!Object.prototype.hasOwnProperty.call(properties, propertyName)) {
          // The manifest bug that costs the most to find: the model is told an argument is
          // mandatory and given no schema for it, so it invents one and the gateway rejects.
          errors.push(
            `${position}: 'parameters.required' names '${propertyName}', which is not declared in 'properties'.`,
          );
        }
      }
    }
  }

  return value;
}

/**
 * The manifest as the editor should first show it: the stored tools minus `pluginKey`, which the
 * server stamps from the route and refuses to take from the body.
 */
export function formatToolManifest(tools: readonly unknown[]): string {
  const stripped = tools.map((tool) => {
    if (!isPlainRecord(tool)) return tool;
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tool)) {
      if (key !== "pluginKey") rest[key] = value;
    }
    return rest;
  });
  return `${JSON.stringify(stripped, null, 2)}\n`;
}
