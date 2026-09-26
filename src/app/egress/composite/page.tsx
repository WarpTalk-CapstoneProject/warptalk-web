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
 *   The recorder is a headless Chrome with no session, so this route must pass the session gate.
 *   It is not a hole — the page grants nothing. It can only join the room the egress-minted token
 *   already names, and it reads no WarpTalk API at all.
 *
 *   WT-686: this comment used to say "there is no middleware in this app". There is — src/proxy.ts
 *   — and it redirected the recorder to /login, so startRecording() never ran and LiveKit aborted
 *   every recording with "Start signal not received". "/egress" is now in its PUBLIC_ROUTES, and
 *   scripts/check-egress-template-public-contract.mjs fails CI if it is ever taken out again.
 *
 * WHAT IT DELIBERATELY IS NOT
 *   An interactive page. This is a recording surface: no controls, nothing clickable, nothing
 *   that could animate and burn a spinner into an hour of video. The audio is the reason it
 *   exists; the tiles carry a name and a mute badge, drawn from the LiveKit room itself, so the
 *   file is watchable.
 *
 *   A fuller mockup for this page also showed a per-tile language badge, a live caption strip and
 *   a control bar mirroring meeting state (translation active, CC on, ...). None of those three
 *   exist anywhere in the LiveKit `Room` this page can see — no participant metadata carries a
 *   language, no data track broadcasts captions into the room, and "translation active"/"CC on"
 *   are React state in the live meeting UI, not anything the room publishes. This page has no
 *   session and must keep reading no WarpTalk API (see WHY IT IS PUBLIC above), so those three stay
 *   out rather than being faked. See the change's PR description for what each would need on the
 *   backend before a future pass can add them for real.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication,
} from "livekit-client";
import EgressHelper from "@livekit/egress-sdk";

import { isRecordableParticipant, resolveEgressDisplayName } from "@/lib/meeting/egress-participants";

interface Tile {
  identity: string;
  element: HTMLMediaElement;
  kind: Track.Kind;
}

/** What overlays a video tile — everything here comes straight off the LiveKit `Room`. */
interface ParticipantOverlay {
  name: string;
  micMuted: boolean;
  camMuted: boolean;
}

function readOverlay(participant: RemoteParticipant): ParticipantOverlay {
  return {
    name: resolveEgressDisplayName(participant.name, participant.identity),
    // `isMicrophoneEnabled`/`isCameraEnabled` are the same LiveKit signal MicStatusIcon already
    // draws on in the live meeting UI — a published, unmuted track publication for that source.
    micMuted: !participant.isMicrophoneEnabled,
    camMuted: !participant.isCameraEnabled,
  };
}

export default function EgressCompositePage() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [overlays, setOverlays] = useState<Record<string, ParticipantOverlay>>({});
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const room = new Room({ adaptiveStream: false, dynacast: false });

    function refreshOverlay(participant: RemoteParticipant) {
      if (!isRecordableParticipant(participant.identity)) return;
      setOverlays((current) => ({
        ...current,
        [participant.identity]: readOverlay(participant),
      }));
    }

    function dropOverlay(identity: string) {
      setOverlays((current) => {
        if (!(identity in current)) return current;
        const next = { ...current };
        delete next[identity];
        return next;
      });
    }

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
      refreshOverlay(participant);
    }

    function detach(track: RemoteTrack) {
      track.detach().forEach((element) => element.remove());
      setTiles((current) => current.filter((tile) => tile.element.isConnected));
    }

    function handleMuteChange(_publication: TrackPublication, participant: Participant) {
      refreshOverlay(participant as RemoteParticipant);
    }

    room
      .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => attach(track, participant))
      .on(RoomEvent.TrackUnsubscribed, (track) => detach(track))
      // Mic/camera badges follow these two directly — no polling, no assumption that a mute
      // toggle also (un)subscribes a track.
      .on(RoomEvent.TrackMuted, handleMuteChange)
      .on(RoomEvent.TrackUnmuted, handleMuteChange)
      .on(RoomEvent.ParticipantDisconnected, (participant) => dropOverlay(participant.identity))
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
          refreshOverlay(participant);
        });
        room.on(RoomEvent.ParticipantConnected, (participant) => {
          subscribeIfHuman(participant);
          refreshOverlay(participant);
        });
        room.on(RoomEvent.TrackPublished, (_pub, participant) => {
          subscribeIfHuman(participant);
          refreshOverlay(participant);
        });

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
        gap: "8px",
        padding: "8px",
        boxSizing: "border-box",
      }}
    >
      {error ? (
        <p style={{ color: "#fff", fontFamily: "sans-serif", padding: "2rem" }}>{error}</p>
      ) : null}
      {tiles.map((tile, index) => (
        <MediaTile
          key={`${tile.identity}-${index}`}
          tile={tile}
          overlay={tile.kind === Track.Kind.Video ? overlays[tile.identity] : undefined}
        />
      ))}
    </main>
  );
}

/**
 * One attached media element, parked in the DOM.
 *
 * Audio elements are mounted too, and hidden rather than skipped: an audio track that is attached
 * but not in the document is not guaranteed to play, and this page exists to capture audio.
 *
 * A video tile gets a rounded, dark panel instead of a raw black square, with the participant's
 * name pinned to the bottom-left and a mute badge in the top-right when the LiveKit room reports
 * their mic or camera as off — the same two facts MicStatusIcon and the camera-off placeholder
 * already draw on in the live meeting UI, just laid out for a fixed recording frame instead of an
 * interactive one.
 */
function MediaTile({ tile, overlay }: { tile: Tile; overlay?: ParticipantOverlay }) {
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    holder.appendChild(tile.element);
    return () => {
      if (tile.element.parentElement === holder) holder.removeChild(tile.element);
    };
  }, [tile.element]);

  if (tile.kind === Track.Kind.Audio) {
    return (
      <div
        ref={holderRef}
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      />
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#1c1c1e",
        borderRadius: "14px",
        overflow: "hidden",
      }}
    >
      <div ref={holderRef} style={{ width: "100%", height: "100%" }} />
      {overlay ? (
        <>
          <div
            style={{
              position: "absolute",
              left: "12px",
              bottom: "12px",
              maxWidth: "calc(100% - 24px)",
              padding: "5px 12px",
              borderRadius: "999px",
              background: "rgba(17,17,20,0.72)",
              color: "#fff",
              fontFamily: "sans-serif",
              fontSize: "14px",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {overlay.name}
          </div>
          {overlay.micMuted || overlay.camMuted ? (
            <div style={{ position: "absolute", right: "10px", top: "10px", display: "flex", gap: "6px" }}>
              {overlay.micMuted ? <MuteBadge label="Microphone muted" icon="mic" /> : null}
              {overlay.camMuted ? <MuteBadge label="Camera off" icon="camera" /> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** A small filled circle carrying one static glyph — no animation, matches the mockup's badges. */
function MuteBadge({ label, icon }: { label: string; icon: "mic" | "camera" }) {
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      style={{
        width: "26px",
        height: "26px",
        borderRadius: "50%",
        background: "#dc2626",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {icon === "mic" ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
          <path d="M17 11a5 5 0 0 1-8.9 3.1M5 5l14 14" />
          <path d="M12 19v3" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 10l6-3v10l-6-3" />
          <rect x="3" y="7" width="12" height="10" rx="2" />
          <path d="M4 5l16 14" />
        </svg>
      )}
    </div>
  );
}
