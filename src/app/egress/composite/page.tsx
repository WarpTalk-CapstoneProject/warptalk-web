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
 *
 *   A BRIDGE ROOM NEVER FALLS BACK TO THE GRID (production recording, 03 Oct). The first 3.4 s (the
 *   subscription still landing) and everything after the window went away at 0:34 were recorded
 *   as the native grid — "External Meeting" and the host, both "Camera is off" — because the layout
 *   followed the track alone. Now the room is recognised as a bridge room (isBridgeRecording: the
 *   stand-in is in the room, or a `meet-window` track was published) and that is latched for the
 *   whole file: the Meet stage stays, showing the live window, else the last Meet frame kept from
 *   before the loss (pickHeldMeetFrame — never one from the seconds in which the window may already
 *   have shown another tab), else the slate.
 *
 * BRIDGE AUDIO: THE CALL ITSELF, AND ITS DUBS
 *   A bridge recording was silent from 1.1 s to the end while the user talked in Meet: the mix was
 *   WarpTalk's own STT tracks, and the user's WarpTalk mic was muted while Meet's was on. The
 *   capturer now publishes the call's sound as `meet-audio`; when a person publishes it, it replaces
 *   every other human audio track (they are already inside it). And a bridge recording carries the
 *   translation too (product decision 2026-10-03): each speaker's DEFAULT dub per language is
 *   mixed in at its published level, never as a tile. A native meeting still records no dubs. The
 *   rules are egress-participants.ts `shouldRecordAudio`; this page only applies them.
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
  isMeetAudioTrack,
  isMeetWindowTrack,
  isRecordableParticipant,
  isRecordedBridgeDub,
  meetWindowSlateAudioLine,
  resolveEgressAudioContext,
  shouldRecordAudio,
  MEET_WINDOW_FIRST_FRAME_TIMEOUT_MS,
  MEET_WINDOW_SNAPSHOT_INTERVAL_MS,
  MEET_WINDOW_SNAPSHOT_RING,
  meetWindowStage,
  pickHeldMeetFrame,
  resolveEgressDisplayName,
  resolveEgressLayout,
  shouldResubscribeMeetWindow,
} from "@/lib/meeting/egress-participants";
import { getInitials } from "@/lib/meeting/participant-identity";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Tile {
  identity: string;
  /** The subscription this tile draws; tiles are removed by it, not by whether they are mounted. */
  track: RemoteTrack;
  element: HTMLMediaElement;
  kind: Track.Kind;
  /** WT-910: the Google Meet window of a bridge room, published under MEET_WINDOW_TRACK_NAME. */
  meetWindow: boolean;
  /** A bridge room's `meet-audio`: the Google Meet call's own sound (MEET_AUDIO_TRACK_NAME). */
  meetAudio?: boolean;
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
  /** Meet-window elements that have decoded a frame. See meetWindowShowsPicture. */
  const [framedElements, setFramedElements] = useState<ReadonlySet<HTMLMediaElement>>(new Set());
  const [meetWindowMuted, setMeetWindowMuted] = useState(false);
  /** Latched: once this is a bridge room's recording, it stays one. See isBridgeRecording. */
  const [bridge, setBridge] = useState(false);
  /** The Meet frame shown while the window is away. See pickHeldMeetFrame. */
  const [heldFrame, setHeldFrame] = useState<HTMLCanvasElement | null>(null);
  /** Copies of the live Meet window, taken every MEET_WINDOW_SNAPSHOT_INTERVAL_MS. */
  const snapshotsRef = useRef<Array<{ canvas: HTMLCanvasElement; atMs: number }>>([]);
  /**
   * Audio that is mixed but never drawn: a bridge room's `meet-audio` and its dubs. Mounted hidden
   * in both layouts; a dub is not a person and gets no tile.
   */
  const [callAudio, setCallAudio] = useState<Tile[]>([]);
  /** A `meet-audio` publisher says its own microphone is not in it (MEET_AUDIO_MIC_ATTRIBUTE). */
  const [meetAudioWithoutMic, setMeetAudioWithoutMic] = useState(false);
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

    /** Publications whose subscription was already renewed once for a missing picture. */
    const resubscribed = new Set<string>();

    /**
     * The one bridge latch, shared by the layout (`bridge` state -> resolveEgressLayout) and the
     * audio (shouldRecordAudio). Once true it stays true for the file. See isBridgeRecording.
     */
    let bridgeLatched = false;
    function latchBridge() {
      if (bridgeLatched) return;
      bridgeLatched = true;
      setBridge(true);
    }

    /** What this page last asked for, per audio publication; isSubscribed lags the request. */
    const audioRequested = new Map<string, boolean>();
    let audioSources = "";

    /**
     * Reads the room once and applies it: latches `bridge` (stand-in present, or a `meet-window` /
     * `meet-audio` track published: resolveEgressAudioContext -> isBridgeRecording), then applies
     * shouldRecordAudio to every audio publication. Re-run on every change to who publishes what,
     * because one publication (`meet-audio`, the stand-in) changes the answer for the others.
     */
    function noteBridge() {
      const participants = Array.from(room.remoteParticipants.values());
      const context = resolveEgressAudioContext(
        participants.map((participant) => ({
          identity: participant.identity,
          trackNames: Array.from(participant.trackPublications.values()).map((pub) => pub.trackName),
          attributes: participant.attributes,
        })),
        { latched: bridgeLatched },
      );
      if (context.bridge) latchBridge();
      setMeetAudioWithoutMic(context.meetAudioWithoutMic.length > 0);
      const sources = `bridge=${context.bridge} meetAudio=${context.meetAudio} withoutMic=${context.meetAudioWithoutMic.join(",") || "-"}`;
      if (sources !== audioSources) {
        audioSources = sources;
        // The egress logs see this page's console and nothing else.
        console.log(`RECORDING_AUDIO_SOURCES ${sources}`);
      }
      participants.forEach((participant) => {
        participant.trackPublications.forEach((publication: RemoteTrackPublication) => {
          if (publication.kind !== Track.Kind.Audio) return;
          const wanted = shouldRecordAudio(
            { identity: participant.identity, trackName: publication.trackName, source: publication.source },
            context,
          );
          if (audioRequested.get(publication.trackSid) === wanted) return;
          audioRequested.set(publication.trackSid, wanted);
          publication.setSubscribed(wanted);
        });
      });
    }

    /**
     * WT-910 follow-up: when the Meet window's first frame arrives, and what to do if it never does.
     *
     * Logged to the console on purpose: it is the only output of this page that reaches the egress
     * logs, and "subscribed but never decoded a frame" was invisible until a recording came out
     * black from start to end.
     */
    function watchMeetWindow(
      element: HTMLVideoElement,
      track: RemoteTrack,
      publication: RemoteTrackPublication,
    ) {
      const subscribedAtMs = Date.now();
      let firstFrameSeen = false;
      const onFirstFrame = () => {
        if (firstFrameSeen) return;
        firstFrameSeen = true;
        console.log(
          `MEET_WINDOW_FIRST_FRAME after ${Date.now() - subscribedAtMs}ms ${element.videoWidth}x${element.videoHeight}`,
        );
        setFramedElements((current) => new Set(current).add(element));
      };
      element.requestVideoFrameCallback?.(() => onFirstFrame());
      element.addEventListener("loadeddata", onFirstFrame, { once: true });
      if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onFirstFrame();

      window.setTimeout(() => {
        // Gone already: unsubscribed, or replaced by a newer subscription of the same window.
        if (firstFrameSeen || publication.track !== track) return;
        const retry = shouldResubscribeMeetWindow({
          firstFrameSeen,
          subscribedAtMs,
          nowMs: Date.now(),
          alreadyRetried: resubscribed.has(publication.trackSid),
        });
        console.warn(
          `MEET_WINDOW_NO_FRAME after ${Date.now() - subscribedAtMs}ms muted=${publication.isMuted} retry=${retry}`,
        );
        if (!retry) return;
        // A fresh subscription is a fresh downtrack, and with it a fresh keyframe request.
        resubscribed.add(publication.trackSid);
        publication.setSubscribed(false);
        window.setTimeout(() => publication.setSubscribed(true), 500);
      }, MEET_WINDOW_FIRST_FRAME_TIMEOUT_MS);
    }

    function attach(
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) {
      // Bridge audio that is mixed but never drawn. Only subscribed when shouldRecordAudio said so
      // (noteBridge), so this only decides where it is mounted.
      if (
        track.kind === Track.Kind.Audio &&
        (isMeetAudioTrack(publication.trackName) || isRecordedBridgeDub(participant.identity))
      ) {
        const element = track.attach();
        console.log(`RECORDING_AUDIO_ATTACHED ${participant.identity} ${publication.trackName || "-"}`);
        setCallAudio((current) => [
          ...current,
          {
            identity: participant.identity,
            track,
            element,
            kind: track.kind,
            meetWindow: false,
            meetAudio: isMeetAudioTrack(publication.trackName),
          },
        ]);
        return;
      }
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
        if (meetWindow) {
          latchBridge();
          setMeetWindowMuted(publication.isMuted);
          watchMeetWindow(element, track, publication);
        }
      }
      setTiles((current) => [
        ...current,
        { identity: participant.identity, track, element, kind: track.kind, meetWindow },
      ]);
      refreshOverlay(participant);
    }

    function detach(track: RemoteTrack) {
      track.detach().forEach((element) => element.remove());
      // By the track, not by `isConnected`: a subscribed tile the current layout does not mount (a
      // camera under the Meet window) is still subscribed and must survive somebody else leaving.
      setTiles((current) => current.filter((tile) => tile.track !== track));
      setCallAudio((current) => current.filter((tile) => tile.track !== track));
    }

    function handleMuteChange(publication: TrackPublication, participant: Participant) {
      if (isMeetWindowTrack(publication.trackName)) setMeetWindowMuted(publication.isMuted);
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
        // Before startRecording: the stand-in is already here in a bridge room, so the file's first
        // frame is the Meet slate rather than the grid, and the first second is already mixed right.
        noteBridge();
        room.on(RoomEvent.ParticipantConnected, (participant) => {
          subscribeIfHuman(participant);
          refreshOverlay(participant);
          noteBridge();
        });
        room.on(RoomEvent.TrackPublished, (_pub, participant) => {
          subscribeIfHuman(participant);
          refreshOverlay(participant);
          noteBridge();
        });
        // `meet-audio` going away hands the mix back to everyone's own tracks.
        room.on(RoomEvent.TrackUnpublished, () => noteBridge());
        room.on(RoomEvent.ParticipantDisconnected, () => noteBridge());
        // MEET_AUDIO_MIC_ATTRIBUTE: the meet-audio publisher's microphone came or went.
        room.on(RoomEvent.ParticipantAttributesChanged, () => noteBridge());

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
        // Audio is noteBridge's call: whose audio is mixed depends on the whole room.
        if (publication.kind === Track.Kind.Audio) return;
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

  // WT-910: the Meet window, when a bridge room publishes one, is the whole picture. The newest
  // one: a re-published window replaces the last.
  const meetWindowTiles = tiles.filter((tile) => tile.kind === Track.Kind.Video && tile.meetWindow);
  const meetWindowTile: Tile | undefined = meetWindowTiles[meetWindowTiles.length - 1];
  const meetStage = resolveEgressLayout(tiles, { bridge }) === "meet-window";
  const stage = meetWindowStage({
    hasTrack: Boolean(meetWindowTile),
    firstFrameSeen: meetWindowTile ? framedElements.has(meetWindowTile.element) : false,
    muted: meetWindowMuted,
    hasHeldFrame: heldFrame !== null,
  });
  const live = stage === "live";
  const liveElement = live && meetWindowTile ? meetWindowTile.element : null;

  const slateAudioLine = meetWindowSlateAudioLine({
    meetAudio: callAudio.some((tile) => tile.meetAudio === true),
    meetAudioWithoutMic,
    otherAudio:
      callAudio.length > 0 || tiles.some((tile) => tile.kind === Track.Kind.Audio),
  });

  // Keep copies of the live window, so there is a Meet frame to hold when it goes away.
  useEffect(() => {
    if (!(liveElement instanceof HTMLVideoElement)) return;
    const video = liveElement;
    const timer = window.setInterval(() => {
      if (!video.videoWidth || !video.videoHeight) return;
      const ring = snapshotsRef.current;
      // Reuse the oldest canvas once the ring is full: this runs for the length of the meeting.
      const recycled = ring.length >= MEET_WINDOW_SNAPSHOT_RING ? ring.shift() : undefined;
      const canvas = recycled?.canvas ?? document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      try {
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        return;
      }
      ring.push({ canvas, atMs: Date.now() });
    }, MEET_WINDOW_SNAPSHOT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [liveElement]);

  // The live picture went away (unpublished, muted, a new track with no frame yet): hold a safe
  // frame from before the loss. Logged, because it is the only trace the egress logs will carry.
  const wasLiveRef = useRef(false);
  useEffect(() => {
    const wasLive = wasLiveRef.current;
    wasLiveRef.current = live;
    if (live || !wasLive) return;
    const lostAtMs = Date.now();
    const { held, keep } = pickHeldMeetFrame(snapshotsRef.current, lostAtMs);
    snapshotsRef.current = keep;
    if (!held) {
      console.warn(`MEET_WINDOW_LOST holding=${heldFrame ? "previous-frame" : "slate"}`);
      return;
    }
    // A copy of its own: the ring recycles its canvases.
    const frame = document.createElement("canvas");
    frame.width = held.canvas.width;
    frame.height = held.canvas.height;
    frame.getContext("2d")?.drawImage(held.canvas, 0, 0);
    // Letterboxed like the live window (see attach): cropping would cut off the edge of Meet's grid.
    frame.style.width = "100%";
    frame.style.height = "100%";
    frame.style.objectFit = "contain";
    frame.style.display = "block";
    console.warn(`MEET_WINDOW_LOST holding=frame age=${lostAtMs - held.atMs}ms`);
    // Set in response to the picture going away: the frame is copied out of a canvas at that
    // moment, which is not a value render could derive.
    setHeldFrame(frame);
  }, [live, heldFrame]);

  if (meetStage && !error) {
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
        {/* Mounted while the slate or a held frame covers it: a <video> outside the document
            decodes nothing, and the first frame is exactly what the stage is waiting for. */}
        {meetWindowTile ? (
          <MediaHolder tile={meetWindowTile} style={{ width: "100%", height: "100%" }} />
        ) : null}
        {stage === "held" && heldFrame ? <HeldMeetFrame frame={heldFrame} audioLine={slateAudioLine} /> : null}
        {stage === "slate" ? <MeetWindowSlate audioLine={slateAudioLine} /> : null}
        {/* Everyone's audio, mounted exactly as the grid mounts it: headless Chrome only records
            what is in the DOM, and the layout must never decide who is heard. */}
        {[...tiles.filter((tile) => tile.kind === Track.Kind.Audio), ...callAudio]
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
      {/* Bridge audio without a tile (meet-audio, dubs): mounted, because headless Chrome only
          records what is in the DOM; out of flow, so it takes no grid cell. */}
      {callAudio.map((tile, index) => (
        <MediaHolder
          key={`${tile.identity}-call-audio-${index}`}
          tile={tile}
          style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        />
      ))}
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

/**
 * What the recording shows while the Meet window has no picture: the grid's light ground and one
 * line, never a black rectangle. Static on purpose - this page is recorded, and anything that
 * moves here would move for the length of the meeting.
 */
function MeetWindowSlate({ audioLine }: { audioLine: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        background: STAGE_BG,
        color: INK_MUTED,
        fontFamily: FONT,
      }}
    >
      <p style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: INK }}>Google Meet</p>
      <p style={{ margin: 0, fontSize: "15px" }}>Waiting for the meeting window. {audioLine}</p>
    </div>
  );
}

/**
 * The last safe Meet frame, while the window is away (see pickHeldMeetFrame). The meeting's audio
 * carries on underneath; the one static line says so, so a still picture over moving speech is not
 * mistaken for a frozen file.
 */
function HeldMeetFrame({ frame, audioLine }: { frame: HTMLCanvasElement; audioLine: string }) {
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    holder.appendChild(frame);
    return () => {
      if (frame.parentElement === holder) holder.removeChild(frame);
    };
  }, [frame]);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000" }}>
      <div ref={holderRef} style={{ width: "100%", height: "100%" }} />
      <p
        style={{
          position: "absolute",
          left: "16px",
          bottom: "16px",
          margin: 0,
          padding: "5px 12px",
          borderRadius: "999px",
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          fontFamily: FONT,
          fontSize: "13px",
          fontWeight: 500,
        }}
      >
        Meeting window paused. {audioLine}
      </p>
    </div>
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
