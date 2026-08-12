/**
 * WT-358 — relabel the roster when host moves, without waiting for a refetch.
 *
 * The People panel prints `participant.role` verbatim, and those roles come from the API
 * participant list. The realtime presence payload carries NO role (see WT-192 and
 * `merge-participants.ts`), so nothing in the live merge could ever correct them. After a
 * Transfer Host the panel therefore went on showing the outgoing host as Host and the incoming
 * one as Participant until the user reloaded the page — which is the whole of WT-358.
 *
 * This lives here, next to `merge-participants`, for the reason that one does: it is a pure rule
 * about reconciling two sources of truth, and inlining it in `persistent-meeting-session.tsx`
 * would put it beyond the reach of a test.
 */

type ParticipantWithRole = {
  userId: string;
  role?: string | null;
};

/**
 * Apply the known live host to a participant list.
 *
 * ONE id is enough, deliberately. `hostUserId` names the host, so everyone else is not the host
 * — whatever their fetched row still says. That is self-correcting: it cannot leave two rows
 * labelled Host, which a promote-only rule can and did.
 *
 * `hostUserId` of null means nothing has told us the host moved, so the fetched roles stand.
 * That is the normal case for a meeting in which no transfer has happened, and the reason this
 * cannot invent a host for a room that is deliberately host-less after the host went offline
 * (WT-234).
 *
 * Rows are returned by reference when their label is already right, so an unchanged list stays
 * referentially stable for `useMemo` consumers downstream.
 */
export function applyLiveHostRole<T extends ParticipantWithRole>(
  participants: T[],
  hostUserId: string | null,
): T[] {
  if (!hostUserId) return participants;

  return participants.map((participant) => {
    const shouldBeHost = participant.userId === hostUserId;
    if (shouldBeHost === isLabelledHost(participant)) return participant;

    return { ...participant, role: shouldBeHost ? "host" : "participant" };
  });
}

/**
 * Case-insensitive on purpose: the backend enum is `HOST`, the frontend DTO's union is
 * lowercase `"host"`, and both spellings reach this list depending on which path wrote the row.
 * Comparing exactly would silently treat `HOST` as "not the host" and rewrite every row.
 */
function isLabelledHost(participant: ParticipantWithRole): boolean {
  return participant.role?.toUpperCase() === "HOST";
}
