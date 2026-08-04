import apiClient from "@/lib/api/client";
import type { PresenceQueryResponse, PresenceState } from "@/types/presence";

export const presenceService = {
  /**
   * Current presence for a set of members, so a list can paint the right dots on first render
   * instead of waiting for someone's state to happen to change.
   *
   * POST rather than GET: a member list can be long, and user ids in a query string end up in
   * access logs.
   */
  async query(userIds: string[]): Promise<Record<string, PresenceState>> {
    if (userIds.length === 0) return {};

    const { data } = await apiClient.post<PresenceQueryResponse>(
      "/api/v1/presence/query",
      { userIds },
    );
    return data.states ?? {};
  },
};
