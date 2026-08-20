"use client";

/**
 * The page LiveKit's recorder opens, so the recording contains the meeting and not the dubs.
 *
 * WHAT THIS FIXES
 *   `StartRoomCompositeEgress` records the MIXED room, and tts_worker publishes one bot per
 *   (speaker, target language) INTO that room. So every recording is the original speech with every
 *   translation layered over it — the file plays as a wall of simultaneous languages, and no
 *   setting on the egress request can filter it: RoomComposite has no include/exclude list
 *   (livekit/egress#923 is the open request for one).
 *
 *   A custom template is the supported answer. The egress opens Chrome on this URL, and whatever
 *   this page SUBSCRIBES to is what gets encoded. Subscribing only to people is the whole fix.
 *
 * THE CONTRACT
 *   The egress appends `url`, `token` and `layout`; the SDK's helpers read them. `setRoom` hands
 *   the connected room back so the recorder can observe it, and recording starts and ends on the
 *   console strings the SDK emits — not on anything this page renders.
 *
 * WHY IT IS PUBLIC
 *   There is no middleware in this app and this route sits outside the authenticated groups, which
 *   it must: the recorder is a headless Chrome with no session. It is not a hole — the page grants
 *   nothing. It can only join the room the egress-minted token already names, and it reads no
 *   WarpTalk API at all.
 *
 * WHAT IT DELIBERATELY IS NOT
 *   A nice-looking layout. This is a recording surface: black background, no chrome, no controls,
 *   nothing that could animate and burn a spinner into an hour of video. The audio is the reason
 *   it exists; the tiles are there so the file is watchable.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import EgressHelper from "@livekit/egress-sdk";

import { isRecordableParticipant } from "@/lib/meeting/egress-participants";

interface Tile {
  identity: string;
  element: HTMLMediaElement;
  kind: Track.Kind;
}

export default function EgressCompositePage() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const room = new Room({ adaptiveStream: false, dynacast: false });

    function attach(track: RemoteTrack, participant: RemoteParticipant) {
      // The filter, and the only line that matters. A bot's track is never subscribed, so its
      // audio never reaches the encoder.
      if (!isRecordableParticipant(participant.identity)) return;
      if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;

      const element = track.attach();
      if (element instanceof HTMLVideoElement) {
        element.style.width = "100%";
        element.style.height = "100%";
        element.style.objectFit = "cover";
      }
      setTiles((current) => [
        ...current,
        { identity: participant.identity, element, kind: track.kind },
      ]);
    }

    function detach(track: RemoteTrack) {
      track.detach().forEach((element) => element.remove());
      setTiles((current) => current.filter((tile) => tile.element.isConnected));
    }

    room
      .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => attach(track, participant))
      .on(RoomEvent.TrackUnsubscribed, (track) => detach(track))
      .on(RoomEvent.Disconnected, () => {
        // The recorder finalises the file on this, so it must fire on a normal room close as well
        // as on an error — otherwise a finished meeting leaves an egress running to its timeout.
        EgressHelper.endRecording();
      });

    async function connect() {
      try {
        await room.connect(EgressHelper.getLiveKitURL(), EgressHelper.getAccessToken(), {
          autoSubscribe: false,
        });
        EgressHelper.setRoom(room);

        // Subscribe by hand rather than with autoSubscribe: the point of this page is that a bot's
        // track is never subscribed at all, and autoSubscribe would have taken them before any
        // handler could refuse.
        room.remoteParticipants.forEach((participant) => {
          subscribeIfHuman(participant);
        });
        room.on(RoomEvent.ParticipantConnected, subscribeIfHuman);
        room.on(RoomEvent.TrackPublished, (_pub, participant) => subscribeIfHuman(participant));

        EgressHelper.startRecording();
      } catch (cause) {
        // Shown on the page as well as ended, so a failed recording is a black frame with a reason
        // on it rather than an hour of silent black nobody can explain afterwards.
        setError(cause instanceof Error ? cause.message : "Could not join the room to record it.");
        EgressHelper.endRecording();
      }
    }

    function subscribeIfHuman(participant: RemoteParticipant) {
      if (!isRecordableParticipant(participant.identity)) return;
      participant.trackPublications.forEach((publication: RemoteTrackPublication) => {
        publication.setSubscribed(true);
      });
    }

    void connect();

    return () => {
      void room.disconnect();
    };
  }, []);

  const videoTiles = useMemo(
    () => tiles.filter((tile) => tile.kind === Track.Kind.Video),
    [tiles],
  );

  return (
    <main
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        background: "#000",
        display: "grid",
        // A square-ish grid that grows with the room. No animation anywhere: a transition here is
        // burned into every frame of the file.
        gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(Math.sqrt(videoTiles.length || 1)))}, 1fr)`,
        gap: "2px",
      }}
    >
      {error ? (
        <p style={{ color: "#fff", fontFamily: "sans-serif", padding: "2rem" }}>{error}</p>
      ) : null}
      {tiles.map((tile, index) => (
        <MediaTile key={`${tile.identity}-${index}`} tile={tile} />
      ))}
    </main>
  );
}

/**
 * One attached media element, parked in the DOM.
 *
 * Audio elements are mounted too, and hidden rather than skipped: an audio track that is attached
 * but not in the document is not guaranteed to play, and this page exists to capture audio.
 */
function MediaTile({ tile }: { tile: Tile }) {
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    holder.appendChild(tile.element);
    return () => {
      if (tile.element.parentElement === holder) holder.removeChild(tile.element);
    };
  }, [tile.element]);

  return (
    <div
      ref={holderRef}
      style={
        tile.kind === Track.Kind.Audio
          ? { position: "absolute", width: 0, height: 0, overflow: "hidden" }
          : { width: "100%", height: "100%", background: "#000" }
      }
    />
  );
}
