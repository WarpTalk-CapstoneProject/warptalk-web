"use client";

import { createContext, useContext, useMemo } from "react";

import {
  identityFor,
  type ParticipantIdentity,
} from "@/lib/meeting/participant-identity";

/**
 * Faces and languages, shared by everything inside a live meeting.
 *
 * A context rather than props because the three surfaces that need it — the video stage, the
 * caption lane and the transcript panel — sit on three different branches of the session tree, and
 * the transcript is two components deep inside the side panel. Threading one map through
 * MeetingSidePanel to reach TranscriptPanel would add a prop to a component that has no other
 * interest in it.
 *
 * Read-only by design: the map is built once per render of the session from the roster, the
 * workspace members and the auth store, and nothing below is allowed to invent an identity of
 * its own — that is how the same person ends up drawn two different ways in two panels.
 */
const MeetingIdentityContext = createContext<Record<string, ParticipantIdentity>>({});

export function MeetingIdentityProvider({
  identities,
  children,
}: {
  identities: Record<string, ParticipantIdentity>;
  children: React.ReactNode;
}) {
  return (
    <MeetingIdentityContext.Provider value={identities}>
      {children}
    </MeetingIdentityContext.Provider>
  );
}

export function useMeetingIdentities() {
  return useContext(MeetingIdentityContext);
}

/**
 * One person, resolved. Falls back to the name the caller already has rather than returning
 * undefined, so a call site never has to branch on "not in the roster yet".
 */
export function useMeetingIdentity(
  userId: string | null | undefined,
  fallbackName?: string | null,
): ParticipantIdentity {
  const identities = useMeetingIdentities();
  return useMemo(
    () => identityFor(identities, userId, fallbackName),
    [identities, userId, fallbackName],
  );
}
