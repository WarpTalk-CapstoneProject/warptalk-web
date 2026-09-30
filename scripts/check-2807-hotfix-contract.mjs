import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const invite = read("src/components/rooms/create/invite-people-picker.tsx");
const chatbot = read("src/components/layout/global-chatbot.tsx");
const room = read("src/app/(app)/[workspaceSlug]/rooms/[id]/live/page.tsx");
const persistentMeeting = read("src/components/rooms/live/persistent-meeting-session.tsx");
const liveRoom = `${room}\n${persistentMeeting}`;
const documents = read("src/app/(app)/[workspaceSlug]/documents/page.tsx");
const glossary = read("src/app/(app)/admin/global-glossary/page.tsx");
// i18n: the uploader/approver labels and the supported-formats sentence now live in the
// translation catalog rather than as literal source text — see documents.json.
const documentsMessagesEn = JSON.parse(read("messages/en/documents.json"));
// i18n: the trigger's aria-label and visible text are now translated via t("askWarpBot")
// rather than a literal string — see common.json for the English wording this asserts.
const commonMessagesEn = JSON.parse(read("messages/en/common.json"));

const checks = [
  ["invite suggestions exclude the signed-in user id", invite.includes("m.userId !== user?.id")],
  ["invite suggestions exclude the signed-in user email", invite.includes("m.email?.toLowerCase() !== user?.email.toLowerCase()")],
  [
    "Ask WarpBot trigger uses the new product label",
    chatbot.includes('aria-label={t("askWarpBot")}') &&
      chatbot.includes('{t("askWarpBot")}') &&
      commonMessagesEn.chatbot?.askWarpBot === "Ask WarpBot",
  ],
  ["Ask WarpBot trigger resets to a new conversation", chatbot.includes("startNewConversation") && chatbot.includes("setConversationId(null)") && chatbot.includes("setMessages([])")],
  ["active meeting assistant context reports live", liveRoom.includes('status: "live"')],
  ["meeting top bar only exposes host end controls to the actual room host", liveRoom.includes("isHost={isRoomHost}")],
  ["ended-room realtime event notifies and redirects participants", liveRoom.includes('connection.on("TranslationRoomEnded"') && liveRoom.includes('toast.info("This meeting has ended.")') && liveRoom.includes('router.replace(`/${activeWorkspaceSlug || "workspace"}/rooms`)')],
  ["document list renders uploader identity", documents.includes('kind="uploader"') && documents.includes("doc.uploadedBy")],
  ["document list renders approver identity", documents.includes('kind="approver"') && documents.includes("doc.approvedBy")],
  ["document upload help only advertises backend-supported formats", documentsMessagesEn.uploadDialog.supportedFormats.includes("Supported: PDF, DOCX, XLSX, MD, PNG, JPG, JPEG, WEBP, BMP, GIF")],
  ["global glossary CRUD screen remains available", glossary.includes("useCreateGlobalGlossaryTerm") && glossary.includes("useUpdateGlobalGlossaryTerm") && glossary.includes("useDeleteGlobalGlossaryTerm") && glossary.includes("useBulkImportGlobalGlossaryTerms")],
];

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
