import apiClient from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type {
  NotificationPreferenceDto,
  UpdateNotificationPreferenceRequest,
  NotificationMessageDto,
  PaginatedResponse,
  CreateAdminNotificationDto,
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

  async getNotifications(page = 1, pageSize = 50) {
    try {
      return await apiClient.get<PaginatedResponse<NotificationMessageDto>>(
        `${API.notifications.base}?page=${page}&pageSize=${pageSize}`
      );
    } catch {
      return {
        data: {
          items: [],
          pageIndex: page,
          pageSize,
          totalCount: 0,
          totalPages: 0,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      };
    }
  },

  markAsRead(id: string) {
    return apiClient.patch<void>(API.notifications.read(id));
  },

  markAllAsRead() {
    return apiClient.patch<void>(API.notifications.readAll);
  },

  createAdminNotification(data: CreateAdminNotificationDto) {
    return apiClient.post<{ id: string }>(
      API.notifications.adminBase,
      data
    );
  },
};
