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
