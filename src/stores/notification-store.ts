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
}));
