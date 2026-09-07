import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(source, token, message) {
  if (!source.includes(token)) {
    throw new Error(message);
  }
}

const questionCard = read("src/components/layout/assistant-question-card.tsx");
assertIncludes(
  questionCard,
  "value?: string",
  "AssistantQuestionCard options must support a hidden value for confirmation tokens.",
);
assertIncludes(
  questionCard,
  "option?.value?.trim() || answer",
  "AssistantQuestionCard must submit the hidden option value instead of only the button label.",
);

const globalWidget = read("src/components/layout/global-chatbot.tsx");
assertIncludes(
  globalWidget,
  "\"AssistantQuestion\"",
  "Global WarpBot widget must listen for AssistantQuestion events.",
);
assertIncludes(
  globalWidget,
  "<AssistantQuestionCard",
  "Global WarpBot widget must render confirmation/question cards.",
);
assertIncludes(
  globalWidget,
  "useAssistantPlugins",
  "Global WarpBot Skills menu must read plugin state from the backend.",
);
assertIncludes(
  globalWidget,
  "usePluginConnectUrl",
  "Global WarpBot Skills menu must expose a connect CTA for plugins.",
);

const aiChat = read("src/app/(app)/[workspaceSlug]/ai-chat/page.tsx");
assertIncludes(
  aiChat,
  "\"AssistantQuestion\"",
  "/ai-chat must listen for AssistantQuestion events.",
);
assertIncludes(
  aiChat,
  "<AssistantQuestionCard",
  "/ai-chat must render confirmation/question cards.",
);

const roomHub = read("src/components/rooms/live/persistent-meeting-session.tsx");
assertIncludes(
  roomHub,
  "\"ChatAssistantQuestion\"",
  "Room SignalR session must receive ChatAssistantQuestion events.",
);
assertIncludes(
  roomHub,
  "setAssistantQuestionsJson",
  "Room SignalR session must store assistant question payloads for the chat panel.",
);

const roomChat = read("src/components/rooms/live/chat-panel.tsx");
assertIncludes(
  roomChat,
  "<AssistantQuestionCard",
  "Room chat must render confirmation/question cards.",
);
assertIncludes(
  roomChat,
  "sendMessage(answer)",
  "Room chat confirmation answers must be sent back through the WarpBot path.",
);
assertIncludes(
  roomChat,
  'id: "bot-warpbot"',
  "Room chat confirmation answers must carry the hidden WarpBot agent mention.",
);

console.log("Plugin confirmation surfaces contract passed.");
