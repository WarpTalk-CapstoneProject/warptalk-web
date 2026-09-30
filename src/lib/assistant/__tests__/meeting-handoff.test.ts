import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ChatMessageDto } from "../../../types/realtime.ts";
import {
  HANDOFF_MAX_TITLE_CHARS,
  HANDOFF_MAX_TURNS,
  buildMeetingHandoffSeed,
  isWarpBotThreadMessage,
} from "../meeting-handoff.ts";

const ME = "user-me";
const ROOM = "0192f0d1-7a3b-7c4d-8e9f-0a1b2c3d4e5f";

let clock = 0;
function msg(partial: Partial<ChatMessageDto>): ChatMessageDto {
  clock += 1;
  return {
    id: `m${clock}`,
    meetingRoomId: "mr",
    senderDisplayName: "Someone",
    senderType: "user",
    messageType: "text",
    originalLanguage: "vi",
    originalText: "",
    translationEnabled: false,
    createdAt: new Date(Date.UTC(2026, 8, 23, 9, 0, clock)).toISOString(),
    ...partial,
  };
}

describe("continuing a meeting's WarpBot thread in the widget", () => {
  test("only the WarpBot thread travels, not the side chat", () => {
    const messages = [
      msg({ senderUserId: "u2", senderDisplayName: "Tuấn", originalText: "Ăn trưa ở đâu?" }),
      msg({ senderUserId: ME, originalText: "@WarpBot tóm tắt quyết định", containsWarpbotMention: true }),
      msg({ senderType: "assistant", messageType: "assistant_response", originalText: "Chọn nhà cung cấp A." }),
      msg({ senderUserId: ME, originalText: "@WarpBot chuyển qua widget", mentions: [{ id: "bot", display: "WarpBot", type: "agent" } as never] }),
    ];

    const seed = buildMeetingHandoffSeed({ messages, roomId: ROOM, roomTitle: "Weekly sync", currentUserId: ME });

    assert.deepEqual(
      seed.seedMessages.slice(1),
      [
        { role: "user", content: "@WarpBot tóm tắt quyết định" },
        { role: "assistant", content: "Chọn nhà cung cấp A." },
        { role: "user", content: "@WarpBot chuyển qua widget" },
      ],
    );
    assert.equal(seed.title, "Weekly sync · WarpBot");
  });

  test("the opening turn names the meeting and its id, so the widget stays about it", () => {
    const seed = buildMeetingHandoffSeed({ messages: [], roomId: ROOM, roomTitle: "Weekly sync" });
    assert.equal(seed.seedMessages[0].role, "assistant");
    assert.match(seed.seedMessages[0].content, /Weekly sync/);
    assert.ok(seed.seedMessages[0].content.includes(ROOM));
  });

  test("a question somebody else asked WarpBot is attributed, never passed off as mine", () => {
    const messages = [
      msg({ senderUserId: "u2", senderDisplayName: "Nhi", originalText: "@WarpBot rủi ro?", containsWarpbotMention: true }),
    ];
    const seed = buildMeetingHandoffSeed({ messages, roomId: ROOM, currentUserId: ME });
    assert.equal(seed.seedMessages[1].content, "Nhi (in the meeting): @WarpBot rủi ro?");
  });

  test("files and blank messages are not turns", () => {
    assert.equal(isWarpBotThreadMessage(msg({ messageType: "file", containsWarpbotMention: true })), false);
    const seed = buildMeetingHandoffSeed({
      messages: [msg({ senderType: "assistant", originalText: "   " })],
      roomId: ROOM,
    });
    assert.equal(seed.seedMessages.length, 1);
  });

  test("only the recent thread travels, and the title fits the service's cap", () => {
    const messages = Array.from({ length: HANDOFF_MAX_TURNS + 10 }, (_, i) =>
      msg({ senderType: "assistant", originalText: `answer ${i}` }),
    );
    const seed = buildMeetingHandoffSeed({ messages, roomId: ROOM, roomTitle: "x".repeat(200) });
    assert.equal(seed.seedMessages.length, HANDOFF_MAX_TURNS + 1);
    assert.equal(seed.seedMessages.at(-1)?.content, `answer ${HANDOFF_MAX_TURNS + 9}`);
    assert.ok(seed.title.length <= HANDOFF_MAX_TITLE_CHARS);
  });
});
