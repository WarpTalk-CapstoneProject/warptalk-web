import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  NotificationPreferenceDto,
  UpdateNotificationPreferenceRequest,
} from "@/types/notification";

/** Notification service — maps to NotificationsController endpoints */
export const notificationService = {
  getPreferences() {
    return apiClient.get<NotificationPreferenceDto[]>(
      API.notifications.preferences
    );
  },

  updatePreferences(data: UpdateNotificationPreferenceRequest) {
    return apiClient.put<NotificationPreferenceDto>(
      API.notifications.preferences,
      data
    );
  },
};
