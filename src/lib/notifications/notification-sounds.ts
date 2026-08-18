/**
 * Short audio cues for the three moments you need to notice without looking.
 *
 * SYNTHESISED, NOT SAMPLED
 *   No .mp3 files. Three cues at a few hundred bytes each would still be three binary assets in
 *   the repo that nobody can diff, review, or tell apart in a pull request — and they would be
 *   fetched over the network at the exact moment the tab is busy joining a meeting. The Web
 *   Audio API makes these shapes in a dozen lines, so what a cue sounds like is readable in the
 *   source and changeable without a designer.
 *
 * THE CUES ARE DELIBERATELY DIFFERENT SHAPES, NOT DIFFERENT PITCHES
 *   Three variations on one beep are indistinguishable in a noisy room, which makes them worse
 *   than one beep: you learn to ignore all of them. A rising two-note figure for something
 *   beginning, one soft note for somebody arriving, and a brighter two-note for translation
 *   going live are told apart by contour, which survives bad laptop speakers.
 *
 * MUTE IS A DEVICE PREFERENCE
 *   Kept in localStorage rather than in a store: whether this machine makes noise is a property
 *   of where you are sitting — an open-plan office, a shared room — not of who is signed in, and
 *   it must survive a reload without a round trip. That also keeps it out of the account-scoped
 *   reset, which is correct: signing in as somebody else should not un-mute the laptop.
 */

const MUTE_KEY = "warptalk.notification-sounds.muted";

export type NotificationCue =
  | "meeting-started"
  | "meeting-invited"
  | "participant-joined"
  | "translation-started";

/** Frequency (Hz) and duration (s) per note, played in sequence. */
const CUES: Record<NotificationCue, { hz: number; seconds: number }[]> = {
  // Rising, two notes: something is beginning and wants you.
  "meeting-started": [
    { hz: 587.33, seconds: 0.12 },
    { hz: 880.0, seconds: 0.18 },
  ],
  // Three notes, and the last one FALLS. An invitation is a question, not a summons: the meeting
  // is usually still hours away and the only thing being asked for is an answer. The contour is
  // what tells it apart from "meeting-started" across the room — a rising figure would be heard
  // as "it is starting now" and send people looking for a meeting that has not opened yet.
  "meeting-invited": [
    { hz: 523.25, seconds: 0.1 },
    { hz: 698.46, seconds: 0.1 },
    { hz: 587.33, seconds: 0.16 },
  ],
  // One soft note. Somebody arriving is information, not a summons — in a twelve-person meeting
  // this fires eleven times, and anything more assertive becomes the thing people mute.
  "participant-joined": [{ hz: 659.25, seconds: 0.09 }],
  // Brighter and higher: the product's actual function just switched on.
  "translation-started": [
    { hz: 784.0, seconds: 0.1 },
    { hz: 1046.5, seconds: 0.16 },
  ],
};

/** Quiet on purpose. A notification that makes people jump gets switched off within the hour. */
const PEAK_GAIN = 0.06;

let audioContext: AudioContext | null = null;

export function areNotificationSoundsMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "true";
  } catch {
    // Private mode, or storage blocked. Audible is the better default: a cue nobody asked to
    // silence is a smaller problem than silence nobody asked for.
    return false;
  }
}

export function setNotificationSoundsMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // Nothing to do — the preference simply does not survive this reload.
  }
}

/**
 * Play one cue. Safe to call from anywhere, including a SignalR callback.
 *
 * Never throws and never blocks. A browser that refuses to make noise — no Web Audio, or a tab
 * that has not been interacted with, which is autoplay policy in every modern browser — is an
 * ordinary state, not an error worth surfacing: the popup carries the same news visually.
 */
export function playNotificationCue(cue: NotificationCue): void {
  if (areNotificationSoundsMuted()) return;
  if (typeof window === "undefined") return;

  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    audioContext ??= new Ctor();
    const context = audioContext;

    // Autoplay policy suspends the context until the page has been interacted with. Resuming is
    // a no-op when it is already running, and the failure case is simply a silent cue.
    if (context.state === "suspended") void context.resume().catch(() => {});

    let startAt = context.currentTime;
    for (const note of CUES[cue]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      // Sine, not square or sawtooth: those carry harmonics that read as an error buzzer, which
      // is the wrong emotional register for "your colleague arrived".
      oscillator.type = "sine";
      oscillator.frequency.value = note.hz;

      // A ramp at both ends. A gain that jumps from 0 produces an audible click — the artefact
      // that makes a synthesised cue sound cheap next to a sampled one.
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.seconds);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + note.seconds + 0.02);

      startAt += note.seconds;
    }
  } catch {
    // Audio is a courtesy. It must never be able to break the notification that carries the
    // actual information.
  }
}
