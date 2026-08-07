import { create } from "zustand";
import type { NotificationDto } from "@/types/notification";

interface NotificationState {
  notifications: NotificationDto[];
  unreadCount: number;

  setNotifications: (notifications: NotificationDto[]) => void;
  addNotification: (notification: NotificationDto) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  /**
   * Drop every notification without pretending they were read.
   *
   * `markAllAsRead` happens to leave the same empty state behind, but it means something
   * different, and a sign-out must not read as the departing account having seen anything.
   */
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.length, // all incoming realtime notifications are unread
    }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    })),

  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.filter(
        (n) => n.notificationId !== id
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  markAllAsRead: () =>
    set({
      notifications: [],
      unreadCount: 0,
    }),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter(
        (n) => n.notificationId !== id
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  clear: () => set({ notifications: [], unreadCount: 0 }),
}));
