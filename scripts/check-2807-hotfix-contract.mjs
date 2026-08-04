import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const invite = read("src/components/rooms/create/invite-people-picker.tsx");
const chatbot = read("src/components/layout/global-chatbot.tsx");
const room = read("src/app/(app)/room/[id]/page.tsx");
const persistentMeeting = read("src/components/rooms/live/persistent-meeting-session.tsx");
const liveRoom = `${room}\n${persistentMeeting}`;
const documents = read("src/app/(app)/[workspaceSlug]/documents/page.tsx");
const glossary = read("src/app/(app)/admin/global-glossary/page.tsx");

const checks = [
  ["invite suggestions exclude the signed-in user id", invite.includes("m.userId !== user?.id")],
  ["invite suggestions exclude the signed-in user email", invite.includes("m.email?.toLowerCase() !== user?.email.toLowerCase()")],
  ["Ask WarpBot trigger uses the new product label", chatbot.includes('aria-label="Ask WarpBot"') && chatbot.includes("Ask WarpBot")],
  ["Ask WarpBot trigger resets to a new conversation", chatbot.includes("startNewConversation") && chatbot.includes("setConversationId(null)") && chatbot.includes("setMessages([])")],
  ["active meeting assistant context reports live", liveRoom.includes('status: "live"')],
  ["meeting top bar only exposes host end controls to the actual room host", liveRoom.includes("isHost={isRoomHost}")],
  ["ended-room realtime event notifies and redirects participants", liveRoom.includes('connection.on("TranslationRoomEnded"') && liveRoom.includes('toast.info("This meeting has ended.")') && liveRoom.includes('router.replace(`/${activeWorkspaceSlug || "workspace"}/rooms`)')],
  ["document list renders uploader identity", documents.includes("Uploader") && documents.includes("doc.uploadedBy")],
  ["document list renders approver identity", documents.includes("Approver") && documents.includes("doc.approvedBy")],
  ["document upload help only advertises backend-supported formats", documents.replace(/\s+/g, " ").includes("Supported: PDF, DOCX, XLSX, MD, PNG, JPG, JPEG, WEBP, BMP, GIF")],
  ["global glossary CRUD screen remains available", glossary.includes("useCreateGlobalGlossaryTerm") && glossary.includes("useUpdateGlobalGlossaryTerm") && glossary.includes("useDeleteGlobalGlossaryTerm") && glossary.includes("useBulkImportGlobalGlossaryTerms")],
];

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
