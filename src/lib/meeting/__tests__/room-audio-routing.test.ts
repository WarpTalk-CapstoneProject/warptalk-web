import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dubbedHistoryScope,
  EMPTY_DUBBED_HISTORY,
  findOutboundDubIdentity,
  mergeDubbedHistory,
  ORIGINAL_UNDER_DUB_VOLUME,
  outboundDubHistoryScope,
  routeRoomAudio,
  type RoomAudioRoutingInput,
} from "../room-audio-routing.ts";

const VI = "vi";
const EN = "en";
const HOST = "11111111-1111-1111-1111-111111111111";
const ALICE = "22222222-2222-2222-2222-222222222222";
const BOB = "33333333-3333-3333-3333-333333333333";
// The shape of ExternalBridgeConstants.ParticipantUserId. Only a fixture: the production value
// arrives from the bridge-token response and is never spelled in the web tier.
const STAND_IN = "00000000-0000-0000-0000-00000000b21d";
const HOSTS_VOICE = "aabbccdd-9999-0000-0000-000000000000";

const dub = (lang: string, speaker: string) => `ai-interpreter-${lang}-${speaker}`;
const voiceDub = (lang: string, voice: string, speaker: string) =>
  `ai-interpreter-${lang}-voice-${voice.slice(0, 8)}-${speaker}`;

/** A host who speaks and listens in Vietnamese, bridged to a far side in English. */
function bridgeRoom(overrides: Partial<RoomAudioRoutingInput> = {}): RoomAudioRoutingInput {
  return {
    identities: [STAND_IN, dub(EN, HOST), dub(VI, STAND_IN)],
    targetLanguageNormalized: VI,
    speakerLanguageByUserId: { [HOST]: VI, [STAND_IN]: EN },
    voicePreference: null,
    voiceEnabled: true,
    translationActive: true,
    localUserId: HOST,
    bridgeOutboundReady: true,
    bridgeStandInIdentity: STAND_IN,
    ...overrides,
  };
}

function ordinaryRoom(overrides: Partial<RoomAudioRoutingInput> = {}): RoomAudioRoutingInput {
  return {
    identities: [ALICE, BOB, dub(VI, ALICE)],
    targetLanguageNormalized: VI,
    speakerLanguageByUserId: { [HOST]: VI, [ALICE]: EN, [BOB]: VI },
    voicePreference: null,
    voiceEnabled: true,
    translationActive: true,
    localUserId: HOST,
    ...overrides,
  };
}

const wanted = (input: RoomAudioRoutingInput) => [...routeRoomAudio(input).wanted].sort();

describe("bridge room: the outbound dub", () => {
  it("is found in the far side's language, not the host's listen language", () => {
    // The regression this pins: the outbound leg was looked up through the listener's own
    // language filter, so a vi/vi host never matched `ai-interpreter-en-{host}` at all.
    const routing = routeRoomAudio(bridgeRoom());
    assert.equal(routing.outboundIdentity, dub(EN, HOST));
    assert.ok(routing.wanted.has(dub(EN, HOST)));
  });

  it("is still sent when the host has voice turned off", () => {
    // Flow 2 (desktop offer → activateBridgeRoom) never goes through /join, so voiceEnabled
    // starts false. The far side must not hear silence because of what the host chose to hear.
    const routing = routeRoomAudio(bridgeRoom({ voiceEnabled: false }));
    assert.equal(routing.outboundIdentity, dub(EN, HOST));
    assert.ok(routing.wanted.has(dub(EN, HOST)));
  });

  it("voice off still drops the far side's dub from the host's own ears", () => {
    const routing = routeRoomAudio(bridgeRoom({ voiceEnabled: false }));
    assert.ok(!routing.wanted.has(dub(VI, STAND_IN)));
  });

  it("voice on plays the far side's dub to the host", () => {
    assert.ok(routeRoomAudio(bridgeRoom()).wanted.has(dub(VI, STAND_IN)));
  });

  it("is not sent once translation has stopped", () => {
    // A lingering bot is not swept until the next synthesis, so it may still be in the room.
    const routing = routeRoomAudio(bridgeRoom({ translationActive: false }));
    assert.equal(routing.outboundIdentity, null);
    assert.ok(!routing.wanted.has(dub(EN, HOST)));
  });

  it("is not kept with no device to carry it — it would otherwise reach nobody", () => {
    const routing = routeRoomAudio(bridgeRoom({ bridgeOutboundReady: false }));
    assert.equal(routing.outboundIdentity, null);
    assert.ok(!routing.wanted.has(dub(EN, HOST)));
  });

  it("is still found before the stand-in identity is known", () => {
    // No inbound source (consent declined, say) means no bridge token and no stand-in identity.
    // The outbound leg does not depend on the inbound one.
    const routing = routeRoomAudio(
      bridgeRoom({ bridgeStandInIdentity: null, identities: [dub(EN, HOST)] }),
    );
    assert.equal(routing.outboundIdentity, dub(EN, HOST));
  });

  it("is the default voice, not a variant rendered for some listener's pick", () => {
    const routing = routeRoomAudio(
      bridgeRoom({
        identities: [STAND_IN, voiceDub(EN, HOSTS_VOICE, HOST), dub(EN, HOST)],
      }),
    );
    assert.equal(routing.outboundIdentity, dub(EN, HOST));
    assert.ok(!routing.wanted.has(voiceDub(EN, HOSTS_VOICE, HOST)));
  });

  it("works for a host whose listen language equals the far side's too", () => {
    const routing = routeRoomAudio(
      bridgeRoom({
        targetLanguageNormalized: EN,
        identities: [STAND_IN, dub(EN, HOST)],
      }),
    );
    assert.equal(routing.outboundIdentity, dub(EN, HOST));
  });

  it("the host's own dub in their OWN listen language is never played, and never sent", () => {
    // Host speaks vi, listens fr, far side en: two dubs of the host exist. Only the en one is the
    // outbound leg; the fr one is a copy of the host for the host.
    const routing = routeRoomAudio(
      bridgeRoom({
        targetLanguageNormalized: "fr",
        identities: [STAND_IN, dub("fr", HOST), dub(EN, HOST), dub("fr", STAND_IN)],
      }),
    );
    assert.equal(routing.outboundIdentity, dub(EN, HOST));
    assert.ok(!routing.wanted.has(dub("fr", HOST)));
    assert.ok(routing.wanted.has(dub("fr", STAND_IN)));
  });
});

describe("bridge room: the host's raw voice into Meet (native listener semantics)", () => {
  // Host speaks vi, the far side (the stand-in) speaks en. Whatever a native en listener would
  // hear of the host is what goes into Meet's microphone.
  const out = (overrides: Partial<RoomAudioRoutingInput> = {}) => {
    const routing = routeRoomAudio(bridgeRoom(overrides));
    return { raw: routing.outboundRawMic, dub: routing.outboundIdentity };
  };

  it("before Start (no translation running) sends the host's raw voice", () => {
    assert.deepEqual(out({ translationActive: false }), { raw: true, dub: null });
  });

  it("before Start sends raw even with a lingering bot in the room", () => {
    // A bot from a previous run is not swept until the next synthesis — it must not be sent, and
    // it must not hold the raw voice off either.
    assert.deepEqual(out({ translationActive: false, previouslyDubbedOutbound: true }), {
      raw: true,
      dub: null,
    });
  });

  it("with the dub on the wire sends the dub only, the raw voice fully off", () => {
    assert.deepEqual(out(), { raw: false, dub: dub(EN, HOST) });
  });

  it("the first sentence, before the interpreter bot has ever appeared, fails open to raw", () => {
    assert.deepEqual(out({ identities: [STAND_IN] }), { raw: true, dub: null });
  });

  it("between sentences / after the idle reap, once dubbed, sends silence rather than raw (WT-874)", () => {
    assert.deepEqual(out({ identities: [STAND_IN], previouslyDubbedOutbound: true }), {
      raw: false,
      dub: null,
    });
  });

  it("sends raw when the host speaks the far side's language, even with history", () => {
    assert.deepEqual(
      out({
        identities: [STAND_IN],
        speakerLanguageByUserId: { [HOST]: EN, [STAND_IN]: EN },
        previouslyDubbedOutbound: true,
      }),
      { raw: true, dub: null },
    );
  });

  it("sends raw when the far side's language is unknown and no dub exists", () => {
    assert.deepEqual(
      out({ identities: [], bridgeStandInIdentity: null, previouslyDubbedOutbound: true }),
      { raw: true, dub: null },
    );
    assert.deepEqual(
      out({ identities: [STAND_IN], speakerLanguageByUserId: { [HOST]: VI } }),
      { raw: true, dub: null },
    );
  });

  it("sends raw when the host's own language is unknown and no dub exists", () => {
    assert.deepEqual(
      out({
        identities: [STAND_IN],
        speakerLanguageByUserId: { [STAND_IN]: EN },
        previouslyDubbedOutbound: true,
      }),
      { raw: true, dub: null },
    );
  });

  it("is independent of what the host chose to hear", () => {
    for (const translationActive of [true, false]) {
      for (const identities of [[STAND_IN], [STAND_IN, dub(EN, HOST)]]) {
        assert.deepEqual(
          out({ voiceEnabled: false, translationActive, identities }),
          out({ voiceEnabled: true, translationActive, identities }),
        );
      }
    }
  });

  it("never plays raw and dub into the device at the same time", () => {
    for (const translationActive of [true, false]) {
      for (const previouslyDubbedOutbound of [true, false]) {
        for (const identities of [[STAND_IN], [STAND_IN, dub(EN, HOST)], [dub(EN, HOST)]]) {
          const { raw, dub: outbound } = out({ translationActive, previouslyDubbedOutbound, identities });
          assert.ok(!(raw && outbound), `both with ${JSON.stringify({ translationActive, previouslyDubbedOutbound, identities })}`);
        }
      }
    }
  });

  it("is never sent without a bridge device, and never in an ordinary room", () => {
    assert.equal(routeRoomAudio(bridgeRoom({ bridgeOutboundReady: false, translationActive: false })).outboundRawMic, false);
    assert.equal(routeRoomAudio(ordinaryRoom({ translationActive: false })).outboundRawMic, false);
    assert.equal(routeRoomAudio(ordinaryRoom()).outboundRawMic, false);
  });

  it("does not change what the host hears", () => {
    for (const previouslyDubbedOutbound of [true, false]) {
      assert.deepEqual(
        [...routeRoomAudio(bridgeRoom({ previouslyDubbedOutbound })).wanted].sort(),
        [...routeRoomAudio(bridgeRoom()).wanted].sort(),
      );
    }
  });
});

describe("bridge room: the outbound dub history scope", () => {
  const scopeOf = (overrides: Partial<RoomAudioRoutingInput> = {}) => outboundDubHistoryScope(bridgeRoom(overrides));

  it("is the far side's language while translation runs over a bridge device", () => {
    assert.equal(scopeOf(), EN);
  });

  it("is not affected by the host's own voice choice", () => {
    assert.equal(scopeOf({ voiceEnabled: false }), EN);
  });

  it("is empty — no history applies — when translation stops, there is no device, or the far side is unknown", () => {
    assert.equal(scopeOf({ translationActive: false }), "");
    assert.equal(scopeOf({ bridgeOutboundReady: false }), "");
    assert.equal(scopeOf({ bridgeStandInIdentity: null }), "");
    assert.equal(scopeOf({ speakerLanguageByUserId: { [HOST]: VI } }), "");
  });

  it("remembers the host across an idle bot and starts over when the far side's language changes", () => {
    const first = mergeDubbedHistory(EMPTY_DUBBED_HISTORY, scopeOf(), new Set([HOST]));
    assert.ok(first.ids.has(HOST));
    assert.equal(mergeDubbedHistory(first, scopeOf(), new Set()), first);
    const frScope = scopeOf({ speakerLanguageByUserId: { [HOST]: VI, [STAND_IN]: "fr" } });
    assert.equal(mergeDubbedHistory(first, frScope, new Set()).ids.size, 0);
  });
});

describe("bridge room: the stand-in's raw track", () => {
  it("is never kept, under any combination of voice and translation state", () => {
    for (const voiceEnabled of [true, false]) {
      for (const translationActive of [true, false]) {
        const routing = routeRoomAudio(bridgeRoom({ voiceEnabled, translationActive }));
        assert.ok(
          !routing.wanted.has(STAND_IN),
          `stand-in raw track kept with voiceEnabled=${voiceEnabled}, translationActive=${translationActive}`,
        );
      }
    }
  });

  it("is not kept before its first dub exists", () => {
    // For an ordinary speaker this is the fallback to the original over dead air. For the far
    // side there is no dead air: the host is hearing them in Meet.
    const routing = routeRoomAudio(bridgeRoom({ identities: [STAND_IN, dub(EN, HOST)] }));
    assert.ok(!routing.wanted.has(STAND_IN));
  });

  it("is not kept when the far side's language matches the host's", () => {
    const routing = routeRoomAudio(
      bridgeRoom({ speakerLanguageByUserId: { [HOST]: VI, [STAND_IN]: VI } }),
    );
    assert.ok(!routing.wanted.has(STAND_IN));
  });

  it("is never chosen as the outbound track", () => {
    assert.notEqual(routeRoomAudio(bridgeRoom()).outboundIdentity, STAND_IN);
  });
});

describe("ordinary room: unchanged", () => {
  it("keeps the dub and drops the mismatched speaker's raw mic once the dub exists", () => {
    assert.deepEqual(wanted(ordinaryRoom()), [BOB, dub(VI, ALICE)].sort());
  });

  it("falls back to the raw mic before the dub exists", () => {
    assert.deepEqual(wanted(ordinaryRoom({ identities: [ALICE, BOB] })), [ALICE, BOB].sort());
  });

  it("voice off drops the dubs and keeps every person", () => {
    assert.deepEqual(wanted(ordinaryRoom({ voiceEnabled: false })), [ALICE, BOB].sort());
  });

  it("with no pipeline running, plays every person and no lingering bot", () => {
    assert.deepEqual(wanted(ordinaryRoom({ translationActive: false })), [ALICE, BOB].sort());
  });

  it("never plays your own dub back to you", () => {
    const routing = routeRoomAudio(ordinaryRoom({ identities: [ALICE, dub(VI, HOST)] }));
    assert.ok(!routing.wanted.has(dub(VI, HOST)));
    assert.equal(routing.outboundIdentity, null);
  });

  it("has no outbound leg without a bridge device, whatever else is passed", () => {
    // bridgeOutboundReady, not the stand-in identity, is what opens the outbound leg.
    const routing = routeRoomAudio(
      ordinaryRoom({ identities: [ALICE, dub(EN, HOST)], bridgeStandInIdentity: STAND_IN }),
    );
    assert.equal(routing.outboundIdentity, null);
    assert.ok(!routing.wanted.has(dub(EN, HOST)));
  });
});

describe("findOutboundDubIdentity", () => {
  it("with the far side's language known, takes only a dub in that language", () => {
    assert.equal(
      findOutboundDubIdentity({
        identities: [dub("fr", HOST)],
        localUserId: HOST,
        farSideLanguage: EN,
        listenerLanguage: VI,
      }),
      null,
    );
  });

  it("with it unknown, prefers a dub not in the listener's own language", () => {
    assert.equal(
      findOutboundDubIdentity({
        identities: [dub("fr", HOST), dub(EN, HOST)],
        localUserId: HOST,
        farSideLanguage: null,
        listenerLanguage: "fr",
      }),
      dub(EN, HOST),
    );
  });

  it("ignores somebody else's dub", () => {
    assert.equal(
      findOutboundDubIdentity({
        identities: [dub(EN, ALICE)],
        localUserId: HOST,
        listenerLanguage: VI,
      }),
      null,
    );
  });

  it("ignores the speaker's raw microphone", () => {
    assert.equal(
      findOutboundDubIdentity({ identities: [HOST], localUserId: HOST, listenerLanguage: VI }),
      null,
    );
  });
});

describe("WT-874: a speaker already dubbed stays dubbed across an idle bot", () => {
  it("fails open on the first utterance, before any dub has existed", () => {
    // ALICE speaks en, the listener hears vi, and no interpreter bot has joined yet.
    assert.ok(wanted(ordinaryRoom({ identities: [ALICE, BOB] })).includes(ALICE));
  });

  it("keeps the raw mic off while the bot reconnects after the 60s idle timeout", () => {
    // The regression: tts_worker drops the bot after a pause, the raw mic came back, and the next
    // sentence was heard as the original and then again as the dub.
    const routing = wanted(
      ordinaryRoom({ identities: [ALICE, BOB], previouslyDubbedSpeakerIds: new Set([ALICE]) }),
    );
    assert.ok(!routing.includes(ALICE));
    assert.ok(routing.includes(BOB), "a same-language speaker is never affected");
  });

  it("does not mute a speaker who now speaks the listener's language", () => {
    const routing = wanted(
      ordinaryRoom({
        identities: [ALICE, BOB],
        speakerLanguageByUserId: { [HOST]: VI, [ALICE]: VI, [BOB]: VI },
        previouslyDubbedSpeakerIds: new Set([ALICE]),
      }),
    );
    assert.ok(routing.includes(ALICE));
  });

  it("does not mute anyone once voice is off or translation stops", () => {
    const history = new Set([ALICE]);
    assert.ok(
      wanted(ordinaryRoom({ identities: [ALICE], voiceEnabled: false, previouslyDubbedSpeakerIds: history })).includes(
        ALICE,
      ),
    );
    assert.ok(
      wanted(
        ordinaryRoom({ identities: [ALICE], translationActive: false, previouslyDubbedSpeakerIds: history }),
      ).includes(ALICE),
    );
  });

  it("reports who is dubbed right now", () => {
    assert.deepEqual([...routeRoomAudio(ordinaryRoom()).dubbedSpeakerIds], [ALICE]);
  });

  it("grows within a scope and starts over when the listen language changes", () => {
    const scope = dubbedHistoryScope({ targetLanguageNormalized: VI, translationActive: true, voiceEnabled: true });
    const first = mergeDubbedHistory(EMPTY_DUBBED_HISTORY, scope, new Set([ALICE]));
    assert.deepEqual([...first.ids], [ALICE]);
    // The bot is gone, the memory is not.
    assert.equal(mergeDubbedHistory(first, scope, new Set()), first);

    const enScope = dubbedHistoryScope({ targetLanguageNormalized: EN, translationActive: true, voiceEnabled: true });
    assert.deepEqual([...mergeDubbedHistory(first, enScope, new Set()).ids], []);
  });

  it("clears when voice or translation is off, and is stable so React state settles", () => {
    const first = mergeDubbedHistory(EMPTY_DUBBED_HISTORY, VI, new Set([ALICE]));
    const off = dubbedHistoryScope({ targetLanguageNormalized: VI, translationActive: false, voiceEnabled: true });
    assert.equal(off, "");
    const cleared = mergeDubbedHistory(first, off, new Set([ALICE]));
    assert.equal(cleared.ids.size, 0);
    assert.equal(mergeDubbedHistory(cleared, off, new Set([ALICE])), cleared);
  });
});

// Reported: Kỳ and Tuấn in one meeting. Kỳ turned voice clone on, and Tuấn heard Kỳ's clone only
// once Tuấn turned HIS switch on too. Every one of Kỳ's dubs was synthesised as "cloned" — the
// listener's switch decided playback. The speaker decides now.
describe("the speaker decides whether they are heard in their own voice", () => {
  const KY = ALICE; // speaks English, voice clone on
  const TUAN = BOB; // speaks Japanese, voice clone off
  const JA = "ja";

  /** HOST listens in Vietnamese; both speakers are dubbed into it. */
  function room(overrides: Partial<RoomAudioRoutingInput> = {}): RoomAudioRoutingInput {
    return {
      identities: [KY, TUAN, dub(VI, KY), dub(VI, TUAN)],
      targetLanguageNormalized: VI,
      speakerLanguageByUserId: { [HOST]: VI, [KY]: EN, [TUAN]: JA },
      voicePreference: null,
      voiceEnabled: true,
      translationActive: true,
      localUserId: HOST,
      dubVoiceKindByIdentity: { [dub(VI, KY)]: "cloned", [dub(VI, TUAN)]: "default" },
      ...overrides,
    };
  }

  it("plays the cloned dub and keeps the original audible, ducked beneath it", () => {
    const routing = routeRoomAudio(room());
    assert.ok(routing.wanted.has(dub(VI, KY)));
    assert.ok(routing.wanted.has(KY));
    assert.deepEqual([...routing.duckedSpeakerIds], [KY]);
    assert.ok(ORIGINAL_UNDER_DUB_VOLUME > 0 && ORIGINAL_UNDER_DUB_VOLUME < 1);
  });

  it("plays a speaker without a voice of their own as they sound, at full volume", () => {
    const routing = routeRoomAudio(room());
    assert.ok(!routing.wanted.has(dub(VI, TUAN)));
    assert.ok(routing.wanted.has(TUAN));
    assert.ok(!routing.duckedSpeakerIds.has(TUAN));
  });

  it("is the same whatever the listener's own switch says", () => {
    for (const voiceEnabled of [true, false]) {
      const routing = routeRoomAudio(room({ voiceEnabled }));
      assert.deepEqual([...routing.wanted].sort(), [KY, TUAN, dub(VI, KY)].sort());
    }
  });

  it("treats a voice the speaker picked for themselves as their own", () => {
    const routing = routeRoomAudio(
      room({ dubVoiceKindByIdentity: { [dub(VI, KY)]: "profile", [dub(VI, TUAN)]: "default" } }),
    );
    assert.ok(routing.wanted.has(dub(VI, KY)));
    assert.ok(routing.duckedSpeakerIds.has(KY));
  });

  it("follows the speaker when their stock voice becomes their clone", () => {
    const before = routeRoomAudio(
      room({ dubVoiceKindByIdentity: { [dub(VI, KY)]: "default", [dub(VI, TUAN)]: "default" } }),
    );
    assert.ok(!before.wanted.has(dub(VI, KY)));
    assert.ok(routeRoomAudio(room()).wanted.has(dub(VI, KY)));
  });

  it("never mutes the original while a cloned speaker's bot is reconnecting", () => {
    const routing = routeRoomAudio(
      room({ identities: [KY, TUAN, dub(VI, TUAN)], previouslyDubbedSpeakerIds: new Set([KY]) }),
    );
    assert.ok(routing.wanted.has(KY));
    assert.ok(!routing.duckedSpeakerIds.has(KY));
  });

  it("plays nothing synthetic once translation stops", () => {
    const routing = routeRoomAudio(room({ translationActive: false }));
    assert.ok(!routing.wanted.has(dub(VI, KY)));
    assert.equal(routing.duckedSpeakerIds.size, 0);
  });

  it("keeps the old rule for a pipeline that does not report voice kinds", () => {
    const routing = routeRoomAudio(room({ dubVoiceKindByIdentity: {} }));
    assert.ok(routing.wanted.has(dub(VI, KY)));
    assert.ok(!routing.wanted.has(KY));
    assert.equal(routing.duckedSpeakerIds.size, 0);
  });

  it("leaves bridge rooms on their own rules", () => {
    const routing = routeRoomAudio(
      bridgeRoom({ dubVoiceKindByIdentity: { [dub(VI, STAND_IN)]: "default", [dub(EN, HOST)]: "cloned" } }),
    );
    assert.ok(routing.wanted.has(dub(VI, STAND_IN)));
    assert.equal(routing.duckedSpeakerIds.size, 0);
  });
});
