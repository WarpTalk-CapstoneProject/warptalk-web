import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findOutboundDubIdentity,
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
