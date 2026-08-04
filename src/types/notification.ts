/**
 * Notification domain types — aligned with backend NotificationService DTOs
 * and Gateway NotificationHub models.
 * Sources:
 *   - WarpTalk.NotificationService.Application.DTOs.NotificationDtos
 *   - WarpTalk.Gateway.Hubs.HubModels (NotificationDto)
 */

// ── REST DTOs (NotificationService) ───────────

export interface NotificationPreferenceDto {
  id: string;
  userId: string;
  notificationType: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: string;
}

export interface UpdateNotificationPreferenceRequest {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
}

export interface NotificationMessageDto {
  id: string;
  type: string;
  title: string;
  content: string;
  actionUrl?: string | null;
  payloadJson: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

export interface CreateAdminNotificationDto {
  title: string;
  content: string;
  type: string; // 'PROMOTION', 'SYSTEM', 'ANNOUNCEMENT', 'MAINTENANCE'
  targetMode: string; // 'BROADCAST', 'SEGMENT', 'SPECIFIC_USERS'
  targetSegmentId?: string;
  targetUserIds?: string[];
  payload?: string;
}

// ── Realtime DTO (Gateway Hub) ────────────────

export interface NotificationDto {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  priority: "low" | "normal" | "high";
  data?: unknown;
  createdAt: string;
}
