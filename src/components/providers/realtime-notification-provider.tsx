"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createHubConnection } from "@/lib/signalr";
import { WORKSPACE_KEYS } from "@/hooks/use-workspace";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Bell, Video, Calendar, FileText, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SIGNALR_HUBS,
  SIGNALR_EVENTS,
  QUERY_KEYS,
  BROADCAST_CHANNELS,
  REALTIME_TIMINGS,
} from "@/constants/realtime";

interface RealtimeContextType {
  connection: signalR.HubConnection | null;
  isConnected: boolean;
}

const RealtimeContext = createContext<RealtimeContextType>({
  connection: null,
  isConnected: false,
});

export const useRealtime = () => useContext(RealtimeContext);

export function RealtimeNotificationProvider({ children }: { children: React.ReactNode }) {
  const [connection, setConnection] = useState<signalR.HubConnection | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
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

  const triggerNativeDesktopNotification = (title: string, options?: NotificationOptions) => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      document.hidden
    ) {
      try {
        new Notification(title, options);
      } catch (e) {
        // Ignored
      }
    }
  };

  // Cross-Tab Broadcast Channel Sync (Active across all tabs)
  useEffect(() => {
    const syncBroadcast = typeof window !== "undefined" && "BroadcastChannel" in window
      ? new BroadcastChannel(BROADCAST_CHANNELS.NOTIFICATIONS_SYNC)
      : null;

    if (syncBroadcast) {
      syncBroadcast.onmessage = (event) => {
        if (event.data === "REFRESH_NOTIFICATIONS") {
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
        }
        if (event.data === "REFRESH_PLANS") {
          queryClient.invalidateQueries({ queryKey: ["landing-plans"] });
          queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
          queryClient.invalidateQueries({ queryKey: ["billing", "plans"] });
          queryClient.invalidateQueries({ queryKey: ["plans"] });
        }
      };
    }

    return () => {
      syncBroadcast?.close();
    };
  }, [queryClient]);

  useEffect(() => {
    if (!accessToken) {
      if (connection) {
        connection.stop();
        setConnection(null);
        setIsConnected(false);
      }
      return;
    }

    const hubConn = createHubConnection(SIGNALR_HUBS.NOTIFICATION);

    hubConn.onreconnecting(() => {
      setIsConnected(false);
    });

    hubConn.onreconnected(() => {
      setIsConnected(true);
      if (activeWorkspaceId) {
        hubConn.invoke("SubscribeWorkspace", activeWorkspaceId).catch(() => {});
      }
    });

    // 1. Handle New Notifications
    hubConn.on(SIGNALR_EVENTS.NEW_NOTIFICATION, (notif: any) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });

      const notifType = notif?.type || notif?.Type;
      if (notifType === "billing.plan_changed" || (typeof notifType === "string" && notifType.startsWith("billing."))) {
        queryClient.invalidateQueries({ queryKey: ["landing-plans"] });
        queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
        queryClient.invalidateQueries({ queryKey: ["billing", "plans"] });
        queryClient.invalidateQueries({ queryKey: ["plans"] });

        if (typeof window !== "undefined" && "BroadcastChannel" in window) {
          try {
            const bc = new BroadcastChannel(BROADCAST_CHANNELS.NOTIFICATIONS_SYNC);
            bc.postMessage("REFRESH_PLANS");
            bc.close();
          } catch {
            // Ignored
          }
        }
      }

      const title = notif.title || "New Notification";
      const message = notif.content || notif.message || "You have a new update.";
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
                  <h4 className="text-sm font-medium text-ink truncate mt-0.5">{title}</h4>
                  <p className="text-xs text-ink-muted line-clamp-2 mt-1">{message}</p>
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
          { duration: REALTIME_TIMINGS.TOAST_DURATION_MS }
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
    });

    hubConn.on(SIGNALR_EVENTS.NOTIFICATION_READ, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        try {
          const bc = new BroadcastChannel(BROADCAST_CHANNELS.NOTIFICATIONS_SYNC);
          bc.postMessage("REFRESH_NOTIFICATIONS");
          bc.close();
        } catch {}
      }
    });

    hubConn.on(SIGNALR_EVENTS.ALL_NOTIFICATIONS_READ, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        try {
          const bc = new BroadcastChannel(BROADCAST_CHANNELS.NOTIFICATIONS_SYNC);
          bc.postMessage("REFRESH_NOTIFICATIONS");
          bc.close();
        } catch {}
      }
    });

    // 3. Handle Workspace, Member & Settings Events
    hubConn.on(SIGNALR_EVENTS.MEMBER_ROLE_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACE_MEMBERS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACES] });
      toast.info("Workspace Permissions Updated", {
        description: `Your workspace role or permissions have been updated.`,
      });
    });

    hubConn.on(SIGNALR_EVENTS.MEMBER_REMOVED, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACE_MEMBERS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACES] });
    });

    hubConn.on(SIGNALR_EVENTS.USER_PRESENCE_CHANGED, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACE_MEMBERS] });
    });

    hubConn.on(SIGNALR_EVENTS.WORKSPACE_SETTINGS_UPDATED, (payload: any) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACE_SETTINGS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACES] });
      toast("Workspace Settings Updated", {
        description: payload?.message || "Workspace settings have been updated.",
        icon: <Settings className="h-4 w-4 text-primary" />,
      });
    });

    hubConn.on(SIGNALR_EVENTS.USER_PROFILE_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_PROFILE] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACE_MEMBERS] });
    });

    // 4. Handle Document Life-cycle & Status Events
    const invalidateDocumentQueries = (payload: any) => {
      const currentWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      const eventWorkspaceId = payload?.workspaceId || currentWorkspaceId;
      if (!eventWorkspaceId || (currentWorkspaceId && eventWorkspaceId !== currentWorkspaceId)) {
        return;
      }

      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEYS.documentLists(eventWorkspaceId) });

      const documentId = payload?.documentId || payload?.id;
      if (documentId) {
        queryClient.invalidateQueries({
          queryKey: WORKSPACE_KEYS.documentDetail(eventWorkspaceId, documentId),
        });
      }
    };

    hubConn.on(SIGNALR_EVENTS.DOCUMENT_STATUS_CHANGED, (payload: any) => {
      invalidateDocumentQueries(payload);

      const title = payload?.title || payload?.documentTitle || "Document";
      const status = (payload?.ingestionStatus || payload?.status || payload?.newStatus || "").toLowerCase();

      if (status === "ready" || status === "completed") {
        toast.success("Document Ready", {
          description: `"${title}" has finished processing and is ready to view.`,
          icon: <FileText className="h-4 w-4 text-emerald-500" />,
        });
      }
    });

    hubConn.on(SIGNALR_EVENTS.DOCUMENT_COMMENT_ADDED, (payload: any) => {
      invalidateDocumentQueries(payload);
    });

    hubConn.on(SIGNALR_EVENTS.DOCUMENT_DELETED, (payload: any) => {
      invalidateDocumentQueries(payload);
    });

    hubConn.on(SIGNALR_EVENTS.AI_SUMMARY_PROGRESS, () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.AI_SUMMARIES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SUMMARY] });
    });

    // 5. Handle Meeting Events (Created, Status Changed, Started)
    const handleMeetingUpdate = (eventPayload: any) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.TRANSLATION_ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.WORKSPACE_ROOMS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.MEETINGS] });

      const title = eventPayload?.title || eventPayload?.roomTitle || "Meeting Update";
      const eventType = eventPayload?.eventType || "StatusChanged";
      const status = eventPayload?.status || eventPayload?.newStatus;
      const roomId = eventPayload?.roomId || eventPayload?.id;

      if (eventType === SIGNALR_EVENTS.MEETING_CREATED) {
        toast("New Meeting Created", {
          description: `"${title}" has been scheduled in your workspace.`,
          icon: <Calendar className="h-4 w-4 text-blue-500" />,
        });
      } else if (status === "Live" || eventType === SIGNALR_EVENTS.MEETING_STARTED) {
        toast.success(`Meeting is now Live!`, {
          description: `"${title}" has started.`,
          action: roomId
            ? {
                label: "Join Now",
                onClick: () => router.push(`/room/${roomId}`),
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
        if (activeWorkspaceId) {
          hubConn.invoke("SubscribeWorkspace", activeWorkspaceId).catch(() => {});
        }
      })
      .catch((err) => {
        console.warn("RealtimeNotificationProvider connection failed:", err);
        if (err?.message?.includes("401") || err?.message?.includes("Unauthorized") || err?.message?.includes("Status code '401'")) {
          useAuthStore.getState().logout();
          window.location.href = "/login";
        }
      });

    setConnection(hubConn);

    return () => {
      hubConn.stop();
    };
  }, [accessToken, queryClient, router]);

  // Subscribe/Unsubscribe workspace when active workspace changes
  useEffect(() => {
    if (connection && isConnected && activeWorkspaceId) {
      connection.invoke("SubscribeWorkspace", activeWorkspaceId).catch(() => {});
    }
  }, [connection, isConnected, activeWorkspaceId]);

  return (
    <RealtimeContext.Provider value={{ connection, isConnected }}>
      {children}
    </RealtimeContext.Provider>
  );
}
