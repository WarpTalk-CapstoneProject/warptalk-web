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
 *
 * WT-910: A BRIDGE ROOM RECORDS THE GOOGLE MEET WINDOW
 *   A bridged call happens in Google Meet; WarpTalk's own participants have no cameras there. The
 *   host's client publishes the Meet window as a video track named `meet-window`
 *   (egress-participants.ts), and while that track is subscribed it fills the frame and nobody is
 *   drawn as a tile. Every recordable participant's AUDIO is still mounted and mixed exactly as in
 *   the grid — the layout changes the picture, never who is heard. Still read off the LiveKit room
 *   alone: no WarpTalk API, no session, the same public page.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

import {
  isMeetWindowTrack,
  isRecordableParticipant,
  resolveEgressDisplayName,
  resolveEgressLayout,
} from "@/lib/meeting/egress-participants";
import { getInitials } from "@/lib/meeting/participant-identity";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Tile {
  identity: string;
  element: HTMLMediaElement;
  kind: Track.Kind;
  /** WT-910: the Google Meet window of a bridge room, published under MEET_WINDOW_TRACK_NAME. */
  meetWindow: boolean;
}

/** What overlays a video tile — everything here comes straight off the LiveKit `Room`. */
interface ParticipantOverlay {
  name: string;
  micMuted: boolean;
  camMuted: boolean;
  /** From the participant's LiveKit metadata (`{"avatarUrl": "https://…"}`), when the client set one. */
  avatarUrl?: string;
}

/** Only a Google-hosted or WarpTalk avatar https URL is drawn; anything else falls back to initials. */
function readAvatarUrl(metadata: string | undefined): string | undefined {
  if (!metadata) return undefined;
  try {
    const url = (JSON.parse(metadata) as { avatarUrl?: unknown }).avatarUrl;
    if (typeof url !== "string") return undefined;
    // Any participant can set their own metadata, and this page fetches whatever it names, so the
    // host is checked: Google-hosted pictures, or the API's own avatar route. The API origin is not
    // known to this page, so the route is matched by path.
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return undefined;
    const googleHost = parsed.hostname.endsWith(".googleusercontent.com");
    const ownRoute = parsed.pathname.startsWith("/api/v1/auth/profile/avatar/");
    return googleHost || ownRoute ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function readOverlay(participant: RemoteParticipant): ParticipantOverlay {
  return {
    name: resolveEgressDisplayName(participant.name, participant.identity),
    // `isMicrophoneEnabled`/`isCameraEnabled` are the same LiveKit signal MicStatusIcon already
    // draws on in the live meeting UI — a published, unmuted track publication for that source.
    micMuted: !participant.isMicrophoneEnabled,
    camMuted: !participant.isCameraEnabled,
    avatarUrl: readAvatarUrl(participant.metadata),
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

    function attach(
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) {
      // The filter, and the only line that matters. A bot's track is never subscribed, so its
      // audio never reaches the encoder.
      if (!isRecordableParticipant(participant.identity)) return;
      if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;

      const meetWindow =
        track.kind === Track.Kind.Video && isMeetWindowTrack(publication.trackName);
      const element = track.attach();
      if (element instanceof HTMLVideoElement) {
        element.style.width = "100%";
        element.style.height = "100%";
        // A face is cropped to fill its tile; a window is not. Cropping the Meet window would cut
        // off whoever sits at the edge of its grid, so it is letterboxed instead.
        element.style.objectFit = meetWindow ? "contain" : "cover";
      }
      setTiles((current) => [
        ...current,
        { identity: participant.identity, element, kind: track.kind, meetWindow },
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
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) =>
        attach(track, publication, participant),
      )
      .on(RoomEvent.TrackUnsubscribed, (track) => detach(track))
      // Mic/camera badges follow these two directly — no polling, no assumption that a mute
      // toggle also (un)subscribes a track.
      .on(RoomEvent.TrackMuted, handleMuteChange)
      .on(RoomEvent.TrackUnmuted, handleMuteChange)
      .on(RoomEvent.ParticipantMetadataChanged, (_metadata, participant) => {
        // The recorder is the only local participant and is never drawn; refreshOverlay filters it.
        refreshOverlay(participant as RemoteParticipant);
      })
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

  const participantIdentities = useMemo(() => {
    const set = new Set<string>();
    Object.keys(overlays).forEach((id) => set.add(id));
    tiles.forEach((t) => set.add(t.identity));
    return Array.from(set);
  }, [overlays, tiles]);

  // WT-910: the Meet window, when a bridge room publishes one, is the whole picture.
  const meetWindowTile =
    resolveEgressLayout(tiles) === "meet-window"
      ? tiles.find((tile) => tile.kind === Track.Kind.Video && tile.meetWindow)
      : undefined;

  if (meetWindowTile && !error) {
    return (
      <main
        ref={containerRef}
        style={{
          position: "relative",
          width: "100vw",
          height: "100vh",
          margin: 0,
          background: "#000",
          overflow: "hidden",
        }}
      >
        <MediaHolder tile={meetWindowTile} style={{ width: "100%", height: "100%" }} />
        {/* Everyone's audio, mounted exactly as the grid mounts it: headless Chrome only records
            what is in the DOM, and the layout must never decide who is heard. */}
        {tiles
          .filter((tile) => tile.kind === Track.Kind.Audio)
          .map((tile, index) => (
            <MediaHolder
              key={`${tile.identity}-audio-${index}`}
              tile={tile}
              style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
            />
          ))}
      </main>
    );
  }

  return (
    <main
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        margin: 0,
        background: STAGE_BG,
        display: "grid",
        // A square-ish grid that grows with the room participants (including camera-off participants).
        gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(Math.sqrt(participantIdentities.length || 1)))}, 1fr)`,
        gap: "8px",
        padding: "8px",
        boxSizing: "border-box",
      }}
    >
      {error ? (
        <p style={{ color: "#fff", fontFamily: "sans-serif", padding: "2rem" }}>{error}</p>
      ) : null}
      {participantIdentities.map((identity) => {
        const overlay = overlays[identity] || {
          name: resolveEgressDisplayName(undefined, identity),
          micMuted: false,
          camMuted: true,
        };
        // Not the Meet window: it is a screen-share track, and it is never somebody's camera tile.
        const videoTile = tiles.find(
          (t) => t.identity === identity && t.kind === Track.Kind.Video && !t.meetWindow,
        );
        const audioTile = tiles.find((t) => t.identity === identity && t.kind === Track.Kind.Audio);

        return (
          <ParticipantGridCell
            key={identity}
            overlay={overlay}
            videoTile={videoTile}
            audioTile={audioTile}
          />
        );
      })}
    </main>
  );
}

/** Mounts one attached media element, and takes it back out when the tile goes. WT-910. */
function MediaHolder({ tile, style }: { tile: Tile; style: CSSProperties }) {
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    holder.appendChild(tile.element);
    return () => {
      if (tile.element.parentElement === holder) holder.removeChild(tile.element);
    };
  }, [tile]);

  return <div ref={holderRef} style={style} />;
}

/* The live meeting's own tokens (globals.css, light theme), copied as literals because this page has
   no stylesheet and must read nothing from the app. The camera-off tile in the recording is the
   camera-off tile in the meeting: white face, grey avatar, grey "Camera is off" pill. */
const TILE_BG = "#ffffff";
const STAGE_BG = "#f0f1f4";
const AVATAR_BG = "#e4e6ea";
const INK = "#111214";
const INK_MUTED = "#5e6470";
const HAIRLINE = "#e3e5e9";
const FONT = "Inter, system-ui, -apple-system, sans-serif";

/**
 * One participant cell in the recording grid.
 *
 * Renders live video if published and unmuted, or a styled camera-off tile matching the real meeting UI
 * with a participant-specific background tone, avatar circle, name badge, and mute indicators.
 * Always mounts the audio element in the DOM so Chrome captures audio for all recordable participants.
 */
function ParticipantGridCell({
  overlay,
  videoTile,
  audioTile,
}: {
  overlay: ParticipantOverlay;
  videoTile?: Tile;
  audioTile?: Tile;
}) {
  const videoHolderRef = useRef<HTMLDivElement | null>(null);
  const hasVideo = Boolean(videoTile && !overlay.camMuted);
  const audioHolderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const holder = videoHolderRef.current;
    if (!holder || !videoTile) return;
    holder.appendChild(videoTile.element);
    return () => {
      if (videoTile.element.parentElement === holder) holder.removeChild(videoTile.element);
    };
    // `hasVideo` is a dependency because the holder <div> only exists while it is true. The track
    // subscribes before or after the camera-enabled flag settles, and a camera switched off and on
    // remounts the holder: an effect keyed on the tile alone ran once, found no holder, and never
    // ran again, so a camera that was on recorded as an empty tile.
  }, [videoTile, hasVideo]);

  useEffect(() => {
    const holder = audioHolderRef.current;
    if (!holder || !audioTile) return;
    holder.appendChild(audioTile.element);
    return () => {
      if (audioTile.element.parentElement === holder) holder.removeChild(audioTile.element);
    };
  }, [audioTile]);

  const initials = getInitials(overlay.name);
  const tileBgColor = hasVideo ? "#1c1c1e" : TILE_BG;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: tileBgColor,
        border: hasVideo ? "none" : `1px solid ${HAIRLINE}`,
        borderRadius: "12px",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Hidden audio element container so audio plays for headless Chrome recorder */}
      <div
        ref={audioHolderRef}
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      />

      {hasVideo ? (
        <div ref={videoHolderRef} style={{ width: "100%", height: "100%" }} />
      ) : (
        /* Camera-off tile, as the live meeting draws it: avatar, then a "Camera is off" pill. */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
          }}
        >
          {/* Through the app's AvatarImage like every other face (check-avatar-everywhere-contract):
              it resolves the src, and the fallback shows initials until the photo loads or when it
              fails, so a moved Google URL never records as a broken-image box. */}
          <Avatar style={{ width: "80px", height: "80px" }}>
            {overlay.avatarUrl ? <AvatarImage src={overlay.avatarUrl} alt="" /> : null}
            <AvatarFallback
              style={{
                background: AVATAR_BG,
                color: INK,
                fontSize: "24px",
                fontWeight: 600,
                fontFamily: FONT,
              }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div
            style={{
              padding: "2px 10px",
              borderRadius: "999px",
              background: STAGE_BG,
              color: INK_MUTED,
              fontFamily: FONT,
              fontSize: "12px",
              fontWeight: 500,
            }}
          >
            Camera is off
          </div>
        </div>
      )}

      {/* Name Overlay (Bottom-left) */}
      <div
        style={{
          position: "absolute",
          left: "12px",
          bottom: "12px",
          maxWidth: "calc(100% - 24px)",
          padding: "5px 12px",
          borderRadius: "999px",
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          fontFamily: FONT,
          fontSize: "14px",
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {overlay.name}
      </div>

      {/* Status cluster (top-right). The mic badge is always drawn, as in the live tile: an icon
          that disappears when live cannot be told from one that failed to render. */}
      <div style={{ position: "absolute", right: "12px", top: "12px", display: "flex", gap: "6px" }}>
        <MicBadge muted={overlay.micMuted} />
      </div>
    </div>
  );
}

/** The live tile's mic badge: a small white square, red icon when muted. No animation. */
function MicBadge({ muted }: { muted: boolean }) {
  const colour = muted ? "#e5484d" : INK_MUTED;
  return (
    <div
      role="img"
      aria-label={muted ? "Microphone muted" : "Microphone on"}
      style={{
        width: "24px",
        height: "24px",
        borderRadius: "6px",
        background: "rgba(255,255,255,0.9)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        {muted ? <path d="M4 4l16 16" /> : null}
      </svg>
    </div>
  );
}
