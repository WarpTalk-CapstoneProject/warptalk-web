import { toast } from "sonner";

import { assistantService } from "@/services/assistant.service";
import { useAssistantWidgetStore } from "@/stores/assistant-widget-store";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { buildMeetingHandoffSeed } from "@/lib/assistant/meeting-handoff";

/**
 * Move this meeting's WarpBot thread into the viewer's own WarpBot widget and open it there.
 *
 * TWO DOORS, ONE PATH
 *     The "Continue in widget" button under WarpBot's latest answer, and WarpBot's own
 *     continue_in_widget tool (relayed as ChatAssistantHandoff, addressed to whoever asked). Both
 *     land here, so the two cannot drift into seeding different threads.
 *
 * Reads the stores at call time rather than taking the thread as an argument: the SignalR
 * handler that calls this is registered once per room, and a thread it closed over would be the
 * thread as it stood when the meeting opened.
 *
 * The meeting stays exactly where it is. The widget is mounted in the app shell beside it, so
 * nothing navigates, and the call is not interrupted.
 */
export async function continueMeetingChatInWidget({
  roomId,
  roomTitle,
}: {
  roomId: string;
  roomTitle?: string | null;
}): Promise<boolean> {
  const widget = useAssistantWidgetStore.getState();
  if (widget.handoffInFlight) return false;

  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
  if (!workspaceId) {
    toast.error("Open a workspace to continue in the WarpBot widget.");
    return false;
  }

  const seed = buildMeetingHandoffSeed({
    messages: useTranslationRoomStore.getState().chatMessages,
    roomId,
    roomTitle,
    currentUserId: useAuthStore.getState().user?.id ?? null,
  });

  widget.setHandoffInFlight(true);
  try {
    const { data } = await assistantService.createConversation(workspaceId, seed);
    useAssistantWidgetStore.getState().openConversation(data.id);
    return true;
  } catch {
    toast.error("Couldn't move this conversation to the WarpBot widget. Try again.");
    return false;
  } finally {
    useAssistantWidgetStore.getState().setHandoffInFlight(false);
  }
}
