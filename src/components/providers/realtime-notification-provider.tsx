"use client";

import { Button } from "@/components/ui/button";
import {
  BROADCAST_CHANNELS,
  QUERY_KEYS,
  REALTIME_TIMINGS,
  SIGNALR_EVENTS,
  SIGNALR_HUBS,
} from "@/constants/realtime";
import { WORKSPACE_KEYS } from "@/hooks/use-workspace";
import { endDeadSession, isSessionEnded } from "@/lib/api/client";
import { createHubConnection, isUnauthorizedHubError } from "@/lib/signalr";
import { useAuthStore } from "@/stores/auth-store";
import { usePresenceStore } from "@/stores/presence-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { liveMeetingPath } from "@/lib/workspace-routes";
import type { PresenceChangedEvent } from "@/types/presence";
import * as signalR from "@microsoft/signalr";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Calendar, FileText, Settings, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

interface RealtimeContextType {
  connection: signalR.HubConnection | null;
  isConnected: boolean;
}

interface NotificationEventPayload {
  title?: string;
  content?: string;
  message?: string;
  type?: string;
  actionUrl?: string;
  data?: { actionUrl?: string };
}

interface WorkspaceSettingsEventPayload {
  message?: string;
}

interface DocumentEventPayload {
  workspaceId?: string;
  documentId?: string;
  id?: string;
  title?: string;
  documentTitle?: string;
  ingestionStatus?: string;
  status?: string;
  newStatus?: string;
}

interface MeetingEventPayload {
  title?: string;
  roomTitle?: string;
  eventType?: string;
  status?: string;
  newStatus?: string;
  roomId?: string;
  id?: string;
}

const RealtimeContext = createContext<RealtimeContextType>({
  connection: null,
  isConnected: false,
});

export const useRealtime = () => useContext(RealtimeContext);

export function RealtimeNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [connection, setConnection] = useState<signalR.HubConnection | null>(
    null,
  );
  const [isConnected, setIsConnected] = useState(false);
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );
  const router = useRouter();
  const queryClient = useQueryClient();

  // Request Native Browser Desktop OS Notification permissions on load
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  const triggerNativeDesktopNotification = (
    title: string,
    options?: NotificationOptions,
  ) => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      document.hidden
    ) {
      try {
        new Notification(title, options);
      } catch {
        // Ignored
      }
    }
  };

  useEffect(() => {
    // No token, or a session already known to be dead, means negotiation can only 401.
    if (!accessToken || isSessionEnded()) {
      return;
    }

    const hubConn = createHubConnection(SIGNALR_HUBS.NOTIFICATION);

    hubConn.onreconnecting(() => {
      setIsConnected(false);
    });

    hubConn.onreconnected(() => {
      setIsConnected(true);
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      if (workspaceId) {
        hubConn.invoke("SubscribeWorkspace", workspaceId).catch(() => {});
      }
    });

    // 1. Handle New Notifications
    hubConn.on(
      SIGNALR_EVENTS.NEW_NOTIFICATION,
      (notif: NotificationEventPayload) => {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });

        const title = notif.title || "New Notification";
        const message =
          notif.content || notif.message || "You have a new update.";
        const actionUrl = notif.actionUrl || notif.data?.actionUrl;
        const isMeetingInvite =
          notif.type === "MeetingInvite" ||
          notif.type === "MeetingInvitation" ||
          (actionUrl && actionUrl.includes("/room/"));

        triggerNativeDesktopNotification(title, { body: message });

        if (isMeetingInvite) {
          toast.custom(
            (t) => (
              <div className="flex flex-col gap-2 p-4 bg-surface-1 border border-primary/30 rounded-xl shadow-xl max-w-sm w-full">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Video className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                      Meeting Invitation
                    </p>
                    <h4 className="text-sm font-medium text-ink truncate mt-0.5">
                      {title}
                    </h4>
                    <p className="text-xs text-ink-muted line-clamp-2 mt-1">
                      {message}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-hairline">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-ink-muted hover:text-ink"
                    onClick={() => toast.dismiss(t)}
                  >
                    Dismiss
                  </Button>
                  {actionUrl && (
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-primary hover:bg-primary/90 text-white gap-1"
                      onClick={() => {
                        toast.dismiss(t);
                        router.push(actionUrl);
                      }}
                    >
                      <Video className="h-3 w-3" />
                      Join Meeting
                    </Button>
                  )}
                </div>
              </div>
            ),
            { duration: REALTIME_TIMINGS.TOAST_DURATION_MS },
          );
        } else {
          toast(title, {
            description: message,
            icon: <Bell className="h-4 w-4 text-primary" />,
            action: actionUrl
              ? {
                  label: "View",
                  onClick: () => router.push(actionUrl),
                }
              : undefined,
          });
        }
      },
    );

    // 2. Handle Read & Cross-Tab Sync Events
    const syncBroadcast =
      typeof window !== "undefined" && "BroadcastChannel" in window
        ? new BroadcastChannel(BROADCAST_CHANNELS.NOTIFICATIONS_SYNC)
        : null;

    if (syncBroadcast) {
      syncBroadcast.onmessage = (event) => {
        if (event.data === "REFRESH_NOTIFICATIONS") {
          queryClient.invalidateQueries({
            queryKey: [QUERY_KEYS.NOTIFICATIONS],
          });
        }
      };
    }

    hubConn.on(SIGNALR_EVENTS.NOTIFICATION_READ, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
      syncBroadcast?.postMessage("REFRESH_NOTIFICATIONS");
    });

    hubConn.on(SIGNALR_EVENTS.ALL_NOTIFICATIONS_READ, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
      syncBroadcast?.postMessage("REFRESH_NOTIFICATIONS");
    });

    // 3. Handle Workspace, Member & Settings Events
    hubConn.on(SIGNALR_EVENTS.MEMBER_ROLE_UPDATED, () => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.WORKSPACE_MEMBERS],
      });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACES] });
      toast.info("Workspace Permissions Updated", {
        description: `Your workspace role or permissions have been updated.`,
      });
    });

    hubConn.on(SIGNALR_EVENTS.MEMBER_REMOVED, () => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.WORKSPACE_MEMBERS],
      });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACES] });
    });

    // Presence lands in its own store rather than invalidating the member list: the member DTO
    // carries no presence field, so a refetch would cost a round-trip per dot and still not
    // change what came back.
    hubConn.on(
      SIGNALR_EVENTS.USER_PRESENCE_CHANGED,
      (payload: PresenceChangedEvent) => {
        if (!payload?.userId || !payload.state) return;
        usePresenceStore.getState().setState(payload.userId, payload.state);
      },
    );

    hubConn.on(
      SIGNALR_EVENTS.WORKSPACE_SETTINGS_UPDATED,
      (payload: WorkspaceSettingsEventPayload) => {
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.WORKSPACE_SETTINGS],
        });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACES] });
        toast("Workspace Settings Updated", {
          description:
            payload?.message || "Workspace settings have been updated.",
          icon: <Settings className="h-4 w-4 text-primary" />,
        });
      },
    );

    hubConn.on(SIGNALR_EVENTS.USER_PROFILE_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_PROFILE] });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.WORKSPACE_MEMBERS],
      });
    });

    // 4. Handle Document Life-cycle & Status Events
    const invalidateDocumentQueries = (payload: DocumentEventPayload) => {
      const currentWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      const eventWorkspaceId = payload?.workspaceId || currentWorkspaceId;
      if (
        !eventWorkspaceId ||
        (currentWorkspaceId && eventWorkspaceId !== currentWorkspaceId)
      ) {
        return;
      }

      queryClient.invalidateQueries({
        queryKey: WORKSPACE_KEYS.documentLists(eventWorkspaceId),
      });

      const documentId = payload?.documentId || payload?.id;
      if (documentId) {
        queryClient.invalidateQueries({
          queryKey: WORKSPACE_KEYS.documentDetail(eventWorkspaceId, documentId),
        });
      }
    };

    hubConn.on(
      SIGNALR_EVENTS.DOCUMENT_STATUS_CHANGED,
      (payload: DocumentEventPayload) => {
        invalidateDocumentQueries(payload);

        const title = payload?.title || payload?.documentTitle || "Document";
        const status = (
          payload?.ingestionStatus ||
          payload?.status ||
          payload?.newStatus ||
          ""
        ).toLowerCase();

        if (status === "ready" || status === "completed") {
          toast.success("Document Ready", {
            description: `"${title}" has finished processing and is ready to view.`,
            icon: <FileText className="h-4 w-4 text-emerald-500" />,
          });
        }
      },
    );

    hubConn.on(
      SIGNALR_EVENTS.DOCUMENT_COMMENT_ADDED,
      (payload: DocumentEventPayload) => {
        invalidateDocumentQueries(payload);
      },
    );

    hubConn.on(
      SIGNALR_EVENTS.DOCUMENT_DELETED,
      (payload: DocumentEventPayload) => {
        invalidateDocumentQueries(payload);
      },
    );

    hubConn.on(SIGNALR_EVENTS.AI_SUMMARY_PROGRESS, () => {
      // The summary and its file arrive on the room-history payload, which is what the
      // meeting's Summary and Artifacts tabs read. Invalidating only the old AI_SUMMARIES
      // key would leave a freshly generated summary invisible until a reload — that key
      // belonged to the Transcripts page, and nothing reads it now.
      queryClient.invalidateQueries({ queryKey: ["room-history"] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.AI_SUMMARIES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SUMMARY] });
    });

    // 5. Handle Meeting Events (Created, Status Changed, Started)
    const handleMeetingUpdate = (eventPayload: MeetingEventPayload) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ROOMS] });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.TRANSLATION_ROOMS],
      });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACE_ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.MEETINGS] });

      const title =
        eventPayload?.title || eventPayload?.roomTitle || "Meeting Update";
      const eventType = eventPayload?.eventType || "StatusChanged";
      const status = eventPayload?.status || eventPayload?.newStatus;
      const roomId = eventPayload?.roomId || eventPayload?.id;

      if (eventType === SIGNALR_EVENTS.MEETING_CREATED) {
        toast("New Meeting Created", {
          description: `"${title}" has been scheduled in your workspace.`,
          icon: <Calendar className="h-4 w-4 text-blue-500" />,
        });
      } else if (
        status === "Live" ||
        eventType === SIGNALR_EVENTS.MEETING_STARTED
      ) {
        toast.success(`Meeting is now Live!`, {
          description: `"${title}" has started.`,
          action: roomId
            ? {
                label: "Join Now",
                onClick: () =>
                  router.push(
                    liveMeetingPath(
                      useWorkspaceStore.getState().activeWorkspaceSlug,
                      roomId,
                    ),
                  ),
              }
            : undefined,
        });
      }
    };

    hubConn.on(SIGNALR_EVENTS.MEETING_EVENT, handleMeetingUpdate);
    hubConn.on(SIGNALR_EVENTS.MEETING_CREATED, handleMeetingUpdate);
    hubConn.on(SIGNALR_EVENTS.MEETING_STATUS_CHANGED, handleMeetingUpdate);
    hubConn.on(SIGNALR_EVENTS.MEETING_STARTED, handleMeetingUpdate);
    hubConn.on(SIGNALR_EVENTS.MEETING_DELETED, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.MEETINGS] });
    });

    hubConn
      .start()
      .then(() => {
        setIsConnected(true);
        const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
        if (workspaceId) {
          hubConn.invoke("SubscribeWorkspace", workspaceId).catch(() => {});
        }
      })
      .catch((err) => {
        console.warn("RealtimeNotificationProvider connection failed:", err);
        // A 401 on negotiation is the same dead session the REST calls are seeing. Ending it
        // here means the tab stops retrying rather than waiting for a query to notice.
        if (isUnauthorizedHubError(err)) {
          endDeadSession();
        }
      });

    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) setConnection(hubConn);
    });

    return () => {
      disposed = true;
      hubConn.stop();
    };
  }, [accessToken, queryClient, router]);

  // Subscribe/Unsubscribe workspace when active workspace changes
  useEffect(() => {
    if (connection && isConnected && activeWorkspaceId) {
      connection
        .invoke("SubscribeWorkspace", activeWorkspaceId)
        .catch(() => {});
    }
  }, [connection, isConnected, activeWorkspaceId]);

  return (
    <RealtimeContext.Provider
      value={{
        connection: accessToken ? connection : null,
        isConnected: Boolean(accessToken && isConnected),
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}
