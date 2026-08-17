/**
 * What the voice-clone pipeline is doing to YOUR microphone, said out loud.
 *
 * WHY IT EXISTS
 *   The TTS worker has always known whether it is capturing a reference clip, how far along it
 *   is, whether the clip passed the quality gate and — when it did not — which bar it missed. All
 *   of it went to a structured log.
 *
 *   On 15 Aug the whole team tried to hear a cloned voice, could not, and concluded the feature
 *   was broken. The worker was logging `voice_clone_sample_accepted` with `score: 1.0` at the
 *   same moment. Nobody in a meeting can read a worker log, so from inside the product a healthy
 *   clone and a dead one look exactly alike:
 *
 *     "có tự thu nhưng mà nó ngầm với hình như lỗi mà do chạy ngầm nên kh ai biết"
 *
 * WHY THE WORDING MATTERS MORE THAN THE BAR
 *   Three of these states are not failures at all — "nobody is listening in another language yet"
 *   is the most common one and reads as a fault if you phrase it as one. The upload page already
 *   solved the same problem for the same gate (lib/voice/voice-sample-quality.ts), so the refusal
 *   messages here deliberately echo its vocabulary rather than inventing a second dialect for the
 *   identical rejection.
 */

export type CloneCaptureEvent = {
  speakerId: string;
  /** See VoiceCloneStateDto in the gateway — mirrors base_worker's reason codes. */
  reason: string;
  seconds?: number | null;
  requiredSeconds?: number | null;
  score?: number | null;
  activeSpeechRatio?: number | null;
};

export type CloneCaptureView = {
  /** "working" fills a bar, "done" is settled, "blocked" needs the user, "idle" says nothing. */
  tone: "idle" | "working" | "done" | "blocked";
  title: string;
  detail: string;
  /** 0..1 for the bar, or null when there is no progress to draw. */
  progress: number | null;
  /** Coarse quality of the accepted clip, or null when nothing has been graded. */
  quality: "good" | "fair" | "weak" | null;
};

/** Above this an accepted clip covers enough pitch and speech to sound like the person. */
const GOOD_SCORE = 0.75;
const FAIR_SCORE = 0.45;

/**
 * The refusal messages, keyed by the worker's own reason suffix.
 *
 * Each one names an action, because each cause is a different conversation: "too quiet" is a
 * microphone, "too little speech" is a room, "clipped" is a gain setting. A single generic
 * "sample rejected" would collapse three fixes into one shrug.
 */
const REJECTION_ADVICE: Record<string, string> = {
  "too quiet": "Your microphone is very quiet. Move closer or raise the input level.",
  clipped: "The audio is distorted. Lower your microphone gain and keep speaking.",
  "too little speech": "Mostly background so far. Keep talking and it will try again.",
  "no speech pattern": "That sounded like steady noise rather than speech. Keep talking.",
  "too short to frame": "Not enough audio yet. Keep talking.",
  "empty audio": "No audio is reaching the pipeline from your microphone.",
};

export function describeCloneCapture(event?: CloneCaptureEvent | null): CloneCaptureView {
  if (!event) {
    return { tone: "idle", title: "", detail: "", progress: null, quality: null };
  }

  const { reason } = event;

  if (reason === "capturing") {
    const captured = event.seconds ?? 0;
    const required = event.requiredSeconds ?? 0;
    return {
      tone: "working",
      title: "Listening to your voice",
      detail: required
        ? `${Math.floor(captured)}s of ${Math.round(required)}s collected.`
        : "Collecting a reference clip.",
      // Guarded rather than trusted: a required of 0 would divide to Infinity and render a bar
      // that overflows its track.
      progress: required > 0 ? Math.min(1, Math.max(0, captured / required)) : null,
      quality: null,
    };
  }

  if (reason === "cloning") {
    return {
      tone: "done",
      title: "Building your voice",
      detail: "Listeners in other languages will hear your translated speech in your own voice.",
      progress: 1,
      quality: gradeScore(event.score),
    };
  }

  if (reason.startsWith("clip_rejected:")) {
    const cause = reason.slice("clip_rejected:".length).trim();
    return {
      tone: "blocked",
      title: "That clip could not be used",
      // Falls back to naming the raw cause rather than hiding it: an unmapped reason is a reason
      // somebody added upstream, and printing it is how they find out this table needs a row.
      detail: REJECTION_ADVICE[cause] ?? `The sample was refused: ${cause}.`,
      progress: null,
      quality: null,
    };
  }

  // Not failures. "Nobody is listening in another language" is the most common state in a
  // single-language room and reads as a fault the moment it is phrased as one.
  if (reason === "no_route_for_speaker") {
    return {
      tone: "idle",
      title: "Nothing to clone yet",
      detail: "Nobody is listening in another language, so your speech is not being dubbed.",
      progress: null,
      quality: null,
    };
  }

  if (reason === "no_routes" || reason === "routes_unknown") {
    return {
      tone: "idle",
      title: "Translation is not running",
      detail: "Start translation to have your speech dubbed for other languages.",
      progress: null,
      quality: null,
    };
  }

  if (reason === "not_opted_in") {
    return {
      tone: "blocked",
      title: "Your voice is not being cloned",
      detail: "Choose “My voice” in Voice settings to be dubbed in your own voice.",
      progress: null,
      quality: null,
    };
  }

  // The clone is live. WHICH clone is the part this used to leave out.
  //
  // `cloned`, `cloned_best_possible` and `cloned_upgrades_exhausted` all used to render the
  // identical sentence "Your voice is ready" with `quality: null` — so a reference clip that
  // covers the speaker's full range and one that barely covers a single note were reported in
  // the same words, with no grade beside them. That is the bug: "luôn hiển thị voice ready
  // trong khi voice chưa acceptable".
  //
  // Acceptance and quality are separate gates upstream and stay separate here. A clip is
  // ACCEPTED on hard floors (level, speech ratio, energy variation); a monotone or narrow
  // delivery clears all of them and is scored low on purpose rather than refused, because a
  // narrow clone of your own voice still beats a stranger's. So "accepted" never meant "good",
  // and only the score can tell them apart.
  if (reason.startsWith("cloned")) {
    const grade = gradeScore(event.score);
    // A weak likeness is said plainly and names the way out. It is not toned "blocked" — the
    // clone IS in use and listeners do hear it — but it must not read as a finished success
    // either, or nobody ever learns there was something to improve.
    if (grade === "weak" || grade === "fair") {
      return {
        tone: "working",
        title: "Your voice is cloned, but it is a weak match",
        detail:
          "The reference clip covers little of your range, so the dub will sound flat. Keep talking with your natural intonation and it will re-clone from a better sample.",
        progress: 1,
        quality: grade,
      };
    }
    return {
      tone: "done",
      title: "Your voice is ready",
      detail: "Listeners in other languages hear your translated speech in your own voice.",
      progress: 1,
      // Null when the worker had no score to send — `cloned_elsewhere_kept` is a clone made by
      // another replica, which this process genuinely cannot grade. Absent, not zero: see the
      // DTO's note on why a fabricated 0 would be worse than a gap.
      quality: grade,
    };
  }

  // An unrecognised state is shown, not swallowed. Silence is the failure mode this whole module
  // was written to remove, and reproducing it for the one case nobody anticipated would be a poor
  // joke.
  return {
    tone: "idle",
    title: "Voice clone status",
    detail: reason,
    progress: null,
    quality: null,
  };
}

function gradeScore(score?: number | null): "good" | "fair" | "weak" | null {
  if (typeof score !== "number") return null;
  if (score >= GOOD_SCORE) return "good";
  if (score >= FAIR_SCORE) return "fair";
  return "weak";
}
