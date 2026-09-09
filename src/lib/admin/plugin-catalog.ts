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
 *
 * `validateNewPlugin` mirrors `CreateMcpPluginAsync` for a harder reason: that endpoint answers a
 * reserved key, a duplicate key and a provider collision with one 400 and one error code, so a
 * refusal arrives as a sentence with no field attached. Checking here is what lets the form point
 * at the box that is wrong.
 */

import type {
  AdminPluginCatalogListItemDto,
  AdminPluginKind,
  AdminPluginOAuthClientSource,
  AdminPluginToolManifestEntry,
  CreateAdminMcpPluginRequest,
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

    // Only these six. `resourceKey`, `resourceLabel` and `resourceAvatarUrl` used to be copied
    // across here, which meant every manifest save wrote three dead keys back into `tools_json` —
    // the last trace of the client-side tile split, whose grouping migration 20260907100000
    // deleted when google_workspace became three real rows. The server still accepts them, so
    // nothing would have failed; the manifest would simply have kept regrowing them.
    tools.push({
      name,
      label,
      description,
      effect,
      requiredScopes: scopes,
      parameters: parameters ?? {},
    });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, tools };
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
 * Keys the editor never shows and never sends.
 *
 * `pluginKey` because the server stamps it from the route and refuses to take it from the body.
 * The three `resource…` keys because they are dead: the C# tool record still declares them with a
 * null default, so the wire carries `"resourceKey": null` on every tool, and rendering those in
 * the textarea would show an operator three fields that mean nothing and invite them to fill one
 * in.
 */
const MANIFEST_KEYS_NOT_AUTHORED = new Set([
  "pluginKey",
  "resourceKey",
  "resourceLabel",
  "resourceAvatarUrl",
]);

/** The manifest as the editor should first show it: the stored tools, minus what nobody authors. */
export function formatToolManifest(tools: readonly unknown[]): string {
  const stripped = tools.map((tool) => {
    if (!isPlainRecord(tool)) return tool;
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tool)) {
      if (!MANIFEST_KEYS_NOT_AUTHORED.has(key)) rest[key] = value;
    }
    return rest;
  });
  return `${JSON.stringify(stripped, null, 2)}\n`;
}

// ── Adding a row ─────────────────────────────────────────────────────────────

/**
 * Plugin keys the server refuses outright, and the reason it refuses them.
 *
 * `mcp` and `catalog` are literal route segments sitting where `{pluginKey}` sits, and ASP.NET
 * gives a literal precedence over a parameter. A row keyed either one is not rejected by routing —
 * it is silently answered by the wrong controller, so an ordinary member asking for their
 * connection status gets a 403 from an admin endpoint. The list is mirrored from
 * `PluginConstants.ReservedPluginKeys`, and there is a `plugins_plugin_key_not_reserved` CHECK
 * behind both.
 */
export const RESERVED_PLUGIN_KEYS = ["mcp", "catalog"] as const;

export function isReservedPluginKey(pluginKey: string): boolean {
  const trimmed = pluginKey.trim().toLowerCase();
  return RESERVED_PLUGIN_KEYS.some((reserved) => reserved === trimmed);
}

/** Mirrors the `plugin_key` column. */
const MAX_PLUGIN_KEY = 100;
const MAX_PLUGIN_LABEL = 150;
const MAX_PLUGIN_DESCRIPTION = 500;
const MAX_AVATAR_URL = 1000;
const MAX_MCP_SERVER_URL = 1000;

/**
 * Stricter than the server, on purpose and only here.
 *
 * The server takes any 100 characters the CHECK constraint allows. But the key becomes the row's
 * route segment AND its `provider` — the identity a user's OAuth grant is keyed by — so a key with
 * a slash or a space in it is a row whose own admin URL has to be escaped to be addressed and
 * whose provider reads as a typo forever. Every row in the catalog is already `[a-z0-9_]`. This is
 * the one place the form is narrower than the API, and it is narrower in the direction an operator
 * would have wanted anyway.
 */
const PLUGIN_KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/;

/** What the create form holds. Every field is a string because every field is an input. */
export interface NewPluginDraft {
  pluginKey: string;
  label: string;
  description: string;
  mcpServerUrl: string;
  avatarUrl: string;
  /** One scope per line, or comma-separated. */
  requiredScopes: string;
  /** Blank unless the operator is hand-registering a client; see `toCreatePluginRequest`. */
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint: string;
}

export const EMPTY_NEW_PLUGIN_DRAFT: NewPluginDraft = {
  pluginKey: "",
  label: "",
  description: "",
  mcpServerUrl: "",
  avatarUrl: "",
  requiredScopes: "",
  clientId: "",
  clientSecret: "",
  authorizationEndpoint: "",
  tokenEndpoint: "",
  revokeEndpoint: "",
};

export type NewPluginFieldErrors = Partial<Record<keyof NewPluginDraft, string>>;

/** Splits a scope box into scopes. Shared by the form and the request builder. */
export function parseScopeList(text: string): string[] {
  const scopes: string[] = [];
  for (const entry of text.split(/[\n,]/)) {
    const scope = entry.trim();
    if (scope.length > 0 && !scopes.includes(scope)) scopes.push(scope);
  }
  return scopes;
}

/**
 * Every reason the server would refuse a new row, checked before the row is sent.
 *
 * Not politeness: the create endpoint answers a duplicate key, a reserved key and a provider
 * collision with the same 400 and the same `unknown_plugin` error code, so a rejected create is a
 * single red sentence with no field attached to it. An operator typing `catalog` should be told at
 * the box, not after pressing the button.
 *
 * `existing` is the catalog listing the screen already has loaded. The collision checks are
 * therefore only as fresh as that list — the server remains the authority and will still refuse a
 * row someone else created a second ago. Catching the common case here costs nothing and turns the
 * uncommon one into the same message either way.
 */
export function validateNewPlugin(
  draft: NewPluginDraft,
  existing: readonly Pick<AdminPluginCatalogListItemDto, "pluginKey" | "provider" | "label">[] = [],
): NewPluginFieldErrors {
  const errors: NewPluginFieldErrors = {};

  const key = draft.pluginKey.trim();
  if (key.length === 0) {
    errors.pluginKey = "A plugin key is required. It is the row's identity everywhere else.";
  } else if (isReservedPluginKey(key)) {
    errors.pluginKey = `'${key}' is a reserved key: it is a literal route segment, so a row named it would have its own calls answered by the wrong endpoint. Reserved: ${RESERVED_PLUGIN_KEYS.join(", ")}.`;
  } else if (key.length > MAX_PLUGIN_KEY) {
    errors.pluginKey = `A plugin key must be at most ${MAX_PLUGIN_KEY} characters.`;
  } else if (!PLUGIN_KEY_PATTERN.test(key)) {
    errors.pluginKey =
      "Use lower-case letters, digits, '_', '.' or '-', starting with a letter or digit. The key becomes this row's URL and its OAuth provider name.";
  } else if (existing.some((row) => row.pluginKey.toLowerCase() === key.toLowerCase())) {
    errors.pluginKey = `A plugin keyed '${key}' already exists.`;
  } else if (existing.some((row) => row.provider.toLowerCase() === key.toLowerCase())) {
    // An MCP row takes its key as its provider, and a provider is the identity of a user's OAuth
    // grant. A row keyed 'google' would be handed the existing Google connection — refresh token
    // and all — and would run its tools against that grant.
    const owner = existing.find((row) => row.provider.toLowerCase() === key.toLowerCase());
    errors.pluginKey = `'${key}' is already in use as a provider by ${owner?.label ?? "another plugin"}. An MCP row takes its key as its provider, and a provider owns an OAuth grant — sharing one would hand this row that connection.`;
  }

  const label = draft.label.trim();
  if (label.length === 0) {
    errors.label = "A label is required — it is what every user sees in the plugin catalog.";
  } else if (label.length > MAX_PLUGIN_LABEL) {
    errors.label = `A label must be at most ${MAX_PLUGIN_LABEL} characters.`;
  }

  const description = draft.description.trim();
  if (description.length === 0) {
    errors.description = "A description is required.";
  } else if (description.length > MAX_PLUGIN_DESCRIPTION) {
    errors.description = `A description must be at most ${MAX_PLUGIN_DESCRIPTION} characters.`;
  }

  const serverUrl = draft.mcpServerUrl.trim();
  if (serverUrl.length === 0) {
    errors.mcpServerUrl = "An MCP server URL is required.";
  } else if (!isAbsoluteHttpsUrl(serverUrl)) {
    // The server checks the scheme, not just the shape: http is refused even on localhost,
    // because the OAuth tokens this row will carry travel over it.
    errors.mcpServerUrl = "An MCP plugin needs an absolute https:// server URL.";
  } else if (serverUrl.length > MAX_MCP_SERVER_URL) {
    errors.mcpServerUrl = `An MCP server URL must be at most ${MAX_MCP_SERVER_URL} characters.`;
  }

  const avatarUrl = draft.avatarUrl.trim();
  if (avatarUrl.length > MAX_AVATAR_URL) {
    errors.avatarUrl = `An avatar URL must be at most ${MAX_AVATAR_URL} characters.`;
  }

  // The OAuth block is optional as a whole, and any part of it filled in commits to the client id:
  // endpoints without one would be written and then ignored, because only a client id moves the
  // row off `unresolved`.
  const clientId = draft.clientId.trim();
  const oauthTouched =
    clientId.length > 0
    || draft.clientSecret.length > 0
    || draft.authorizationEndpoint.trim().length > 0
    || draft.tokenEndpoint.trim().length > 0
    || draft.revokeEndpoint.trim().length > 0;
  if (oauthTouched && clientId.length === 0) {
    errors.clientId =
      "A client id is required once anything else in this section is filled in — without one the row stays 'unresolved' and everything typed here is ignored.";
  }

  for (const field of ["authorizationEndpoint", "tokenEndpoint", "revokeEndpoint"] as const) {
    const value = draft[field].trim();
    if (value.length > 0 && !isAbsoluteHttpsUrl(value)) {
      errors[field] = "An OAuth endpoint must be an absolute https:// URL.";
    }
  }

  return errors;
}

function isAbsoluteHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The draft as the API takes it.
 *
 * Blank optional fields are dropped rather than sent as empty strings: `avatarUrl: ""` would be
 * stored as an empty avatar rather than as no avatar, and an empty `oAuth.clientId` is the exact
 * value that put a `client_id=` consent URL into production.
 */
export function toCreatePluginRequest(draft: NewPluginDraft): CreateAdminMcpPluginRequest {
  const clientId = draft.clientId.trim();
  const avatarUrl = draft.avatarUrl.trim();
  const scopes = parseScopeList(draft.requiredScopes);

  const request: CreateAdminMcpPluginRequest = {
    pluginKey: draft.pluginKey.trim(),
    label: draft.label.trim(),
    description: draft.description.trim(),
    mcpServerUrl: draft.mcpServerUrl.trim(),
  };

  if (avatarUrl.length > 0) request.avatarUrl = avatarUrl;
  if (scopes.length > 0) request.requiredScopes = scopes;

  if (clientId.length > 0) {
    request.oAuth = {
      clientId,
      // Unlike the edit screen's tri-state, there is nothing to keep or clear on a row that does
      // not exist yet: a blank box simply means this client has no secret.
      clientSecret: draft.clientSecret.length > 0 ? draft.clientSecret : undefined,
      authorizationEndpoint: draft.authorizationEndpoint.trim() || undefined,
      tokenEndpoint: draft.tokenEndpoint.trim() || undefined,
      revokeEndpoint: draft.revokeEndpoint.trim() || undefined,
    };
  }

  return request;
}
