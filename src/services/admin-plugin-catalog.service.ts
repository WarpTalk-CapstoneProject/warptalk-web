import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  AdminPluginCatalogDetailDto,
  AdminPluginCatalogListItemDto,
  AdminPluginDeleteResultDto,
  AdminPluginToolAuditPageDto,
  AdminPluginToolAuditQuery,
  ReplaceAdminPluginToolsRequest,
  SetAdminPluginOAuthClientRequest,
  UpdateAdminPluginRequest,
} from "@/types/admin-plugin-catalog";

/**
 * The system-admin plugin catalog (WT-646). Every call here is platform-admin only.
 *
 * TWO THINGS THIS FILE IS RESPONSIBLE FOR, both of which are silent if got wrong.
 *
 * 1. THE `oAuth…` WIRE NAMES. `JsonSerializerDefaults.Web` lowercases only the leading run of
 *    capitals before another capital, so C#'s `OAuthClientSource` arrives as `oAuthClientSource`.
 *    `normalise*` below accepts that spelling and the two an editor would reach for by instinct,
 *    so a serialiser change on the service cannot turn the whole OAuth panel into `undefined`
 *    without anything failing. Reading a client source as undefined would render every row as
 *    "unresolved" and hide the very condition this screen exists to show.
 *
 * 2. THE TRI-STATE SECRET. `clientSecret` absent means "leave the stored secret alone", `""` means
 *    "clear it", and a value means "replace it". `undefined` in a JS object survives
 *    `JSON.stringify` as an ABSENT property, which is the behaviour we want — but only as long as
 *    nobody "helpfully" sends `null` instead, which the server reads as absent too and which would
 *    make the difference invisible in a network log. So the property is deleted outright below,
 *    and the request type has no `null` in it.
 */

type RawRecord = Record<string, unknown>;

/**
 * Reads the first spelling present. Deliberately not a general case-insensitive lookup: the point
 * is to pin the exact aliases that are plausible, so an unexpected key still surfaces as missing
 * data rather than being quietly absorbed.
 */
function pick(raw: RawRecord, ...names: string[]): unknown {
  for (const name of names) {
    if (raw[name] !== undefined) return raw[name];
  }
  return undefined;
}

function withOAuthAliases<T>(raw: RawRecord): T {
  const normalised: RawRecord = { ...raw };
  const aliases: Array<[canonical: string, ...spellings: string[]]> = [
    ["oAuthClientSource", "oauthClientSource", "OAuthClientSource"],
    ["oAuthClientId", "oauthClientId", "OAuthClientId"],
    ["oAuthAuthorizationEndpoint", "oauthAuthorizationEndpoint"],
    ["oAuthTokenEndpoint", "oauthTokenEndpoint"],
    ["oAuthRevokeEndpoint", "oauthRevokeEndpoint"],
    ["oAuthRegistrationEndpoint", "oauthRegistrationEndpoint"],
    ["oAuthTokenEndpointAuthMethod", "oauthTokenEndpointAuthMethod"],
  ];

  for (const [canonical, ...spellings] of aliases) {
    const value = pick(raw, canonical, ...spellings);
    if (value !== undefined) normalised[canonical] = value;
  }

  return normalised as T;
}

/**
 * Strips `undefined` so it cannot be serialised as anything else, and — for the secret — so
 * "leave it alone" stays a genuinely absent property.
 */
function withoutUndefined<T extends object>(body: T): T {
  const result: RawRecord = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) result[key] = value;
  }
  return result as T;
}

export const adminPluginCatalogService = {
  list: async (): Promise<AdminPluginCatalogListItemDto[]> => {
    const { data } = await apiClient.get<RawRecord[]>(API.adminPluginCatalog.base);
    return (data ?? []).map((row) => withOAuthAliases<AdminPluginCatalogListItemDto>(row));
  },

  get: async (pluginKey: string): Promise<AdminPluginCatalogDetailDto> => {
    const { data } = await apiClient.get<RawRecord>(API.adminPluginCatalog.detail(pluginKey));
    return withOAuthAliases<AdminPluginCatalogDetailDto>(data);
  },

  update: async (
    pluginKey: string,
    request: UpdateAdminPluginRequest,
  ): Promise<AdminPluginCatalogDetailDto> => {
    const { data } = await apiClient.patch<RawRecord>(
      API.adminPluginCatalog.detail(pluginKey),
      withoutUndefined(request),
    );
    return withOAuthAliases<AdminPluginCatalogDetailDto>(data);
  },

  /** Sets or rotates the pre-registered client. Refused by the server on a native row. */
  setOAuthClient: async (
    pluginKey: string,
    request: SetAdminPluginOAuthClientRequest,
  ): Promise<AdminPluginCatalogDetailDto> => {
    const { data } = await apiClient.put<RawRecord>(
      API.adminPluginCatalog.oauth(pluginKey),
      withoutUndefined(request),
    );
    return withOAuthAliases<AdminPluginCatalogDetailDto>(data);
  },

  /** Replaces `tools_json` wholesale. An empty array is a valid manifest. */
  replaceTools: async (
    pluginKey: string,
    request: ReplaceAdminPluginToolsRequest,
  ): Promise<AdminPluginCatalogDetailDto> => {
    const { data } = await apiClient.put<RawRecord>(
      API.adminPluginCatalog.tools(pluginKey),
      request,
    );
    return withOAuthAliases<AdminPluginCatalogDetailDto>(data);
  },

  /** Clears cached discovery so the registration ladder runs again. MCP rows only. */
  rediscover: async (pluginKey: string): Promise<AdminPluginCatalogDetailDto> => {
    const { data } = await apiClient.post<RawRecord>(
      API.adminPluginCatalog.rediscover(pluginKey),
      {},
    );
    return withOAuthAliases<AdminPluginCatalogDetailDto>(data);
  },

  /**
   * Soft by default. `hard` is refused with `plugin_in_use` while installations or connections
   * reference the row — the caller renders that refusal rather than retrying softly on its own,
   * because "retire instead" is a decision an operator makes, not one a client makes for them.
   */
  remove: async (pluginKey: string, hard: boolean): Promise<AdminPluginDeleteResultDto> => {
    const { data } = await apiClient.delete<AdminPluginDeleteResultDto>(
      API.adminPluginCatalog.detail(pluginKey),
      { params: hard ? { hard: true } : undefined },
    );
    return data;
  },

  audits: async (
    pluginKey: string,
    query: AdminPluginToolAuditQuery,
  ): Promise<AdminPluginToolAuditPageDto> => {
    const { data } = await apiClient.get<AdminPluginToolAuditPageDto>(
      API.adminPluginCatalog.audits(pluginKey),
      { params: withoutUndefined(query) },
    );
    return data;
  },
};
