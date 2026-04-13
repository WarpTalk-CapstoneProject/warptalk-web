# WarpTalk — Frontend ↔ Backend Contract Mapping

> Tài liệu này chứa toàn bộ nội dung cần mapping giữa Frontend (Next.js) và Backend (.NET microservices).

---

## 1. Gateway Routing

Frontend gọi tất cả qua **Gateway** (`NEXT_PUBLIC_API_URL`). Gateway dùng YARP reverse proxy.

| Frontend Path (client gọi) | Gateway Route | Backend Service | Backend Path |
|---|---|---|---|
| `/api/v1/auth/{endpoint}` | `auth-public-route` | AuthService `:5101` | `/api/auth/{endpoint}` |
| `/api/v1/auth/{**catch-all}` | `auth-secure-route` (JWT) | AuthService `:5101` | `/api/auth/{**catch-all}` |
| `/api/v1/translationRooms/{**catch-all}` | `translation-room-route` | TranslationRoomService `:5102` | `/api/v1/translationRooms/{**catch-all}` |
| `/api/v1/transcripts/{**catch-all}` | `transcript-route` | TranscriptService `:5103` | `/api/v1/transcripts/{**catch-all}` |
| `/api/v1/notifications/{**catch-all}` | `notification-route` | NotificationService `:5104` | `/api/v1/notifications/{**catch-all}` |

> [!IMPORTANT]
> Auth service dùng prefix `/api/auth/` nhưng Gateway map lại thành `/api/v1/auth/`. Các service khác giữ nguyên `/api/v1/`.

---

## 2. REST API Endpoints

### 2.1 Auth Service

| Method | Gateway Endpoint | Auth | Request Body | Success Response | Error Response |
|---|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | ✗ | `RegisterRequest` | `200` → `AuthResponse` | `400` → `ApiErrorResponse` |
| `POST` | `/api/v1/auth/login` | ✗ | `LoginRequest` | `200` → `AuthResponse` | `401` → `ApiErrorResponse` |
| `POST` | `/api/v1/auth/google-login` | ✗ | `GoogleLoginRequest` | `200` → `AuthResponse` | `401` → `ApiErrorResponse` |
| `POST` | `/api/v1/auth/refresh` | ✗ | `RefreshTokenRequest` | `200` → `AuthResponse` | `401` → `ApiErrorResponse` |
| `POST` | `/api/v1/auth/logout` | ✓ JWT | `LogoutRequest` | `204` No Content | `400` → `ApiErrorResponse` |
| `GET` | `/api/v1/auth/me` | ✓ JWT | — | `200` → `UserDto` | `404` → `ApiErrorResponse` |
| `PUT` | `/api/v1/auth/me` | ✓ JWT | `UpdateProfileRequest` | `200` → `UserDto` | `400` → `ApiErrorResponse` |
| `POST` | `/api/v1/auth/change-password` | ✓ JWT | `ChangePasswordRequest` | `204` No Content | `400` → `ApiErrorResponse` |

### 2.2 TranslationRoom Service

| Method | Gateway Endpoint | Auth | Request Body | Success Response |
|---|---|---|---|---|
| `POST` | `/api/v1/translationRooms` | ✓ JWT | `CreateTranslationRoomRequest` | `200` → `TranslationRoomDto` |
| `GET` | `/api/v1/translationRooms/{id}` | ✓ JWT | — | `200` → `TranslationRoomDto` |
| `POST` | `/api/v1/translationRooms/{id}/join` | ✓ JWT | `JoinTranslationRoomRequest` | `200` → `TranslationRoomParticipantDto` |
| `POST` | `/api/v1/translationRooms/{id}/end` | ✓ JWT | — | `204` No Content |

### 2.3 Transcript Service

| Method | Gateway Endpoint | Auth | Request Body | Success Response |
|---|---|---|---|---|
| `POST` | `/api/v1/transcripts` | ✓ JWT | `CreateTranscriptRequest` | `200` → `TranscriptDto` |
| `GET` | `/api/v1/transcripts/{id}` | ✓ JWT | — | `200` → `TranscriptDto` |
| `POST` | `/api/v1/transcripts/{id}/audio` | ✓ JWT | `ProcessAudioChunkRequest` | `202` Accepted |
| `POST` | `/api/v1/transcripts/{id}/finalize` | ✓ JWT | — | `204` No Content |

### 2.4 Notification Service

| Method | Gateway Endpoint | Auth | Request Body | Success Response |
|---|---|---|---|---|
| `GET` | `/api/v1/notifications/test` | ✗ | — | `200` → `{ message }` |
| `GET` | `/api/v1/notifications/preferences` | ✓ JWT | — | `200` → `NotificationPreferenceDto[]` |
| `PUT` | `/api/v1/notifications/preferences` | ✓ JWT | `UpdateNotificationPreferenceRequest` | `200` → `NotificationPreferenceDto` |

---

## 3. Backend DTOs (C# Source) & Frontend Mapping (TypeScript)

### 3.1 Shared DTOs

**Backend C# — `WarpTalk.Shared`:**

```csharp
// File: shared/WarpTalk.Shared/ApiErrorResponse.cs
public record ApiErrorResponse(string? Error, string? Code);

// File: shared/WarpTalk.Shared/Result.cs
public class Result<T>
{
    public bool IsSuccess { get; }
    public T? Value { get; }
    public string Error { get; }
    public string ErrorCode { get; }
}
```

**Frontend TypeScript mapping:**

```typescript
interface ApiErrorResponse {
  error?: string;
  code?: string;
}
```

---

### 3.2 Auth DTOs

**Backend C# — `WarpTalk.AuthService.Application.DTOs.AuthDtos`:**

```csharp
// File: auth/src/WarpTalk.AuthService.Application/DTOs/AuthDtos.cs

public record RegisterRequest(string Email, string Password, string FullName);

public record LoginRequest(string Email, string Password, string? IpAddress, string? DeviceInfo);

public record GoogleLoginRequest(string IdToken, string? IpAddress, string? DeviceInfo);

public record RefreshTokenRequest(string RefreshToken, string? IpAddress, string? DeviceInfo);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record UpdateProfileRequest(string? FullName, string? Phone, string? PreferredLanguage, string? Timezone);

public record AuthResponse(string AccessToken, string RefreshToken, DateTime ExpiresAt, UserDto User);

public record UserDto(
    Guid Id,
    string Email,
    string FullName,
    string? AvatarUrl,
    string? Phone,
    string? PreferredLanguage,
    string? Timezone,
    bool EmailVerified,
    IReadOnlyList<string> Roles
);

public record GoogleAuthPayload(string Subject, string Email, string? Name, string? Picture, bool EmailVerified);
```

**Frontend TypeScript mapping:**

```typescript
// ── Requests ──────────────────────────────────
interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;            // ⚠️ Backend = "FullName" (single field, NOT firstName/lastName)
}

interface LoginRequest {
  email: string;
  password: string;
  // ipAddress, deviceInfo → auto-injected by backend controller
}

interface GoogleLoginRequest {
  idToken: string;
  // ipAddress, deviceInfo → auto-injected by backend controller
}

interface RefreshTokenRequest {
  refreshToken: string;
  // ipAddress, deviceInfo → auto-injected by backend controller
}

interface LogoutRequest {
  refreshToken: string;
}

interface UpdateProfileRequest {
  fullName?: string;           // ⚠️ Backend = "FullName" (NOT firstName/lastName/displayName)
  phone?: string;              // ⚠️ Backend = "Phone" (NOT phoneNumber)
  preferredLanguage?: string;  // ⚠️ exists on backend, missing from current frontend
  timezone?: string;           // ⚠️ exists on backend, missing from current frontend
}

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  // ⚠️ NO confirmPassword on backend (validate on frontend only)
}

// ── Responses ─────────────────────────────────
interface AuthResponse {
  accessToken: string;         // ⚠️ flat structure, NOT nested under "tokens"
  refreshToken: string;
  expiresAt: string;           // ⚠️ ISO DateTime string (NOT expiresIn number)
  user: UserDto;
}

interface UserDto {
  id: string;                  // Guid → string
  email: string;
  fullName: string;            // ⚠️ single field (NOT firstName + lastName)
  avatarUrl?: string;
  phone?: string;              // ⚠️ "phone" (NOT "phoneNumber")
  preferredLanguage?: string;
  timezone?: string;
  emailVerified: boolean;
  roles: string[];             // ⚠️ array of role names (NOT single "role" field)
}
```

---

### 3.3 TranslationRoom DTOs

**Backend C# — `WarpTalk.TranslationRoomService.Application.DTOs.TranslationRoomDtos`:**

```csharp
// File: translationRoom/src/WarpTalk.TranslationRoomService.Application/DTOs/TranslationRoomDtos.cs

public record CreateTranslationRoomRequest(
    Guid? WorkspaceId,
    string Title,
    string? Description,
    string TranslationRoomType,        // "instant" | "scheduled"
    int MaxParticipants,
    string SourceLanguage,
    string TargetLanguages,
    DateTime? ScheduledAt
);

public record JoinTranslationRoomRequest(
    string DisplayName,
    string ListenLanguage,
    string SpeakLanguage
);

public record TranslationRoomDto(
    Guid Id,
    Guid WorkspaceId,
    Guid HostId,
    string Title,
    string? Description,
    string TranslationRoomCode,
    string Status,              // "scheduled" | "active" | "completed" | "cancelled"
    string TranslationRoomType,
    int MaxParticipants,
    DateTime? ScheduledAt,
    DateTime? StartedAt,
    DateTime? EndedAt,
    DateTime CreatedAt
);

public record TranslationRoomParticipantDto(
    Guid Id,
    Guid TranslationRoomId,
    Guid UserId,
    string DisplayName,
    string Role,                // "host" | "participant" | "interpreter"
    string ListenLanguage,
    string SpeakLanguage,
    string Status,              // "joined" | "left" | "removed"
    DateTime? JoinedAt
);
```

**Frontend TypeScript mapping:**

```typescript
interface CreateTranslationRoomRequest {
  workspaceId?: string;        // optional Guid
  title: string;
  description?: string;
  translationRoomType: "instant" | "scheduled";
  maxParticipants: number;
  sourceLanguage: string;      // e.g. "vi", "en"
  targetLanguages: string;     // comma-separated or JSON
  scheduledAt?: string;        // ISO DateTime
}

interface JoinTranslationRoomRequest {
  displayName: string;
  listenLanguage: string;
  speakLanguage: string;
}

interface TranslationRoomDto {
  id: string;
  workspaceId: string;
  hostId: string;
  title: string;
  description?: string;
  translationRoomCode: string;         // unique join code
  status: string;              // "scheduled" | "active" | "completed" | "cancelled"
  translationRoomType: string;
  maxParticipants: number;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

interface TranslationRoomParticipantDto {
  id: string;
  translationRoomId: string;
  userId: string;
  displayName: string;
  role: string;                // "host" | "participant" | "interpreter"
  listenLanguage: string;
  speakLanguage: string;
  status: string;              // "joined" | "left" | "removed"
  joinedAt?: string;
}
```

---

### 3.4 Transcript DTOs

**Backend C# — `WarpTalk.TranscriptService.Application.DTOs.TranscriptDtos`:**

```csharp
// File: transcript/src/WarpTalk.TranscriptService.Application/DTOs/TranscriptDtos.cs

public record CreateTranscriptRequest(
    Guid TranslationRoomId,
    string SourceLanguage
);

public record UpdateTranscriptStatusRequest(
    string Status,
    int TotalSegments,
    int TotalDurationMs
);

public record ProcessAudioChunkRequest(
    string Base64AudioData
);

public record TranscriptDto(
    Guid Id,
    Guid TranslationRoomId,
    int Version,
    string Status,              // "recording" | "processing" | "completed" | "failed"
    string SourceLanguage,
    int TotalSegments,
    int TotalDurationMs,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? FinalizedAt
);
```

**Frontend TypeScript mapping:**

```typescript
interface CreateTranscriptRequest {
  translationRoomId: string;
  sourceLanguage: string;
}

interface UpdateTranscriptStatusRequest {
  status: string;
  totalSegments: number;
  totalDurationMs: number;
}

interface ProcessAudioChunkRequest {
  base64AudioData: string;
}

interface TranscriptDto {
  id: string;
  translationRoomId: string;
  version: number;
  status: string;              // "recording" | "processing" | "completed" | "failed"
  sourceLanguage: string;
  totalSegments: number;
  totalDurationMs: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
}
```

---

### 3.5 Notification DTOs

**Backend C# — `WarpTalk.NotificationService.Application.DTOs.NotificationDtos`:**

```csharp
// File: notification/src/WarpTalk.NotificationService.Application/DTOs/NotificationDtos.cs

public record NotificationPreferenceDto(
    Guid Id,
    Guid UserId,
    string NotificationType,
    bool EmailEnabled,
    bool PushEnabled,
    bool InAppEnabled,
    DateTime UpdatedAt
);

public record UpdateNotificationPreferenceRequest(
    bool? EmailEnabled,
    bool? PushEnabled,
    bool? InAppEnabled
);
```

**Frontend TypeScript mapping:**

```typescript
interface NotificationPreferenceDto {
  id: string;
  userId: string;
  notificationType: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: string;
}

interface UpdateNotificationPreferenceRequest {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
}
```

---

### 3.6 Gateway SignalR Hub DTOs

**Backend C# — `WarpTalk.Gateway.Hubs.HubModels`:**

```csharp
// File: gateway/src/WarpTalk.Gateway/Hubs/HubModels.cs

// ── TranslationRoom Hub DTOs ──────────────────────────────────────

public record ParticipantInfoDto(
    Guid UserId,
    string DisplayName,
    string SpeakLanguage,
    string ListenLanguage,
    bool IsMuted,
    DateTime JoinedAt);

public record TranscriptSegmentDto(
    Guid SegmentId,
    Guid SpeakerId,
    string SpeakerName,
    string OriginalText,
    string OriginalLanguage,
    string? TranslatedText,
    string? TargetLanguage,
    float Confidence,
    int StartTimeMs,
    int EndTimeMs);

public record ChatMessageDto(
    Guid MessageId,
    Guid SenderId,
    string SenderName,
    string Content,
    DateTime SentAt);

public record TranslationRoomStateDto(
    Guid TranslationRoomId,
    string TranslationRoomCode,
    string Status,
    List<ParticipantInfoDto> Participants);

// ── Notification Hub DTOs ─────────────────────────────────

public record NotificationDto(
    Guid NotificationId,
    string Type,
    string Title,
    string Body,
    string Priority,
    object? Data,
    DateTime CreatedAt);
```

**Frontend TypeScript mapping:**

```typescript
interface ParticipantInfoDto {
  userId: string;
  displayName: string;
  speakLanguage: string;
  listenLanguage: string;
  isMuted: boolean;
  joinedAt: string;
}

interface TranscriptSegmentDto {
  segmentId: string;
  speakerId: string;
  speakerName: string;
  originalText: string;
  originalLanguage: string;
  translatedText?: string;
  targetLanguage?: string;
  confidence: number;          // 0.0 → 1.0
  startTimeMs: number;
  endTimeMs: number;
}

interface ChatMessageDto {
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  sentAt: string;
}

interface TranslationRoomStateDto {
  translationRoomId: string;
  translationRoomCode: string;
  status: string;
  participants: ParticipantInfoDto[];
}

interface NotificationDto {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  priority: string;            // "low" | "normal" | "high"
  data?: unknown;
  createdAt: string;
}
```

---

## 4. Error Response Format

Tất cả lỗi từ backend đều dùng chung format:

```typescript
interface ApiErrorResponse {
  error?: string;   // Human-readable message
  code?: string;    // Machine-readable error code
}
```

### Error Codes (from `ErrorCodes.cs`)

| Code | Domain | Mô tả |
|---|---|---|
| `NOT_FOUND` | Common | Không tìm thấy resource |
| `UNAUTHORIZED` | Common | Chưa xác thực |
| `INVALID_STATE` | Common | Object ở trạng thái không hợp lệ |
| `VALIDATION_ERROR` | Common | Dữ liệu đầu vào sai |
| `EMAIL_EXISTS` | Auth | Email đã được đăng ký |
| `INVALID_CREDENTIALS` | Auth | Sai email hoặc mật khẩu |
| `ACCOUNT_INACTIVE` | Auth | Tài khoản chưa kích hoạt |
| `ACCOUNT_LOCKED` | Auth | Tài khoản đã bị khóa |
| `INVALID_TOKEN` | Auth | Token không hợp lệ/hết hạn |
| `USER_INACTIVE` | Auth | User bị vô hiệu hóa |
| `USER_NOT_FOUND` | Auth | User không tồn tại |
| `INVALID_PASSWORD` | Auth | Mật khẩu không đúng yêu cầu |
| `MEETING_NOT_ACTIVE` | TranslationRoom | Cuộc họp chưa/hết active |
| `PREFERENCES_NOT_FOUND` | Notification | Chưa có preferences |

---

## 5. SignalR Realtime Hubs

### 5.1 TranslationRoom Hub — `/hubs/translationRoom`

Kết nối yêu cầu JWT qua query string: `?access_token=<jwt>`

**Client → Server (invoke):**

| Method | Params | Mô tả |
|---|---|---|
| `JoinTranslationRoom` | `translationRoomId: string, displayName: string, speakLanguage: string, listenLanguage: string` | Tham gia phòng họp |
| `LeaveTranslationRoom` | `translationRoomId: string` | Rời phòng họp |
| `ToggleMute` | `translationRoomId: string, isMuted: boolean` | Bật/tắt mic |
| `SendTranscriptSegment` | `translationRoomId: string, segment: TranscriptSegmentDto` | Gửi transcript segment |
| `SendChatMessage` | `translationRoomId: string, content: string` | Gửi tin nhắn chat |
| `EndTranslationRoom` | `translationRoomId: string` | Kết thúc cuộc họp (host only) |

**Server → Client (on):**

| Event | Payload | Mô tả |
|---|---|---|
| `ParticipantJoined` | `ParticipantInfoDto` | Có người tham gia |
| `ParticipantLeft` | `userId: string` | Có người rời đi |
| `ParticipantMuteChanged` | `userId: string, isMuted: boolean` | Đổi trạng thái mic |
| `TranscriptSegmentReceived` | `TranscriptSegmentDto` | Nhận transcript realtime |
| `ChatMessageReceived` | `ChatMessageDto` | Nhận tin nhắn chat |
| `TranslationRoomEnded` | `translationRoomId: string` | Cuộc họp đã kết thúc |

### 5.2 Notification Hub — `/hubs/notification`

Kết nối yêu cầu JWT qua query string. Tự động join group `user:{userId}`.

**Client → Server (invoke):**

| Method | Params | Mô tả |
|---|---|---|
| `MarkAsRead` | `notificationId: string` | Đánh dấu đã đọc |
| `MarkAllAsRead` | — | Đánh dấu tất cả đã đọc |

**Server → Client (on):**

| Event | Payload | Mô tả |
|---|---|---|
| `NotificationReceived` | `NotificationDto` | Nhận thông báo mới |
| `NotificationRead` | `notificationId: string` | Sync trạng thái đọc |
| `AllNotificationsRead` | — | Tất cả đã đọc |

> Xem đầy đủ C# + TypeScript definitions tại [Section 3.6 — Gateway SignalR Hub DTOs](#36-gateway-signalr-hub-dtos).

---

## 6. Domain Entity Models (DB Columns)

### 6.1 User (AuthService)

| Column | Type | Nullable | Note |
|---|---|---|---|
| `id` | `uuid` | ✗ | PK |
| `email` | `string` | ✗ | unique |
| `password_hash` | `string` | ✗ | |
| `full_name` | `string` | ✗ | |
| `avatar_url` | `string` | ✓ | |
| `phone` | `string` | ✓ | |
| `preferred_language` | `string` | ✓ | |
| `timezone` | `string` | ✓ | |
| `is_active` | `bool` | ✗ | |
| `is_locked` | `bool` | ✗ | |
| `failed_login_attempts` | `int` | ✗ | |
| `locked_until` | `datetime` | ✓ | |
| `email_verified` | `bool` | ✗ | |
| `email_verified_at` | `datetime` | ✓ | |
| `google_id` | `string` | ✓ | OAuth |
| `last_login_at` | `datetime` | ✓ | |
| `last_login_ip` | `string` | ✓ | |
| `created_at` | `datetime` | ✗ | |
| `updated_at` | `datetime` | ✗ | |
| `deleted_at` | `datetime` | ✓ | Soft delete |

**Relations:** RefreshTokens, UserRoles, UserSetting, WorkspaceInvitations, Workspaces

### 6.2 Workspace (AuthService)

| Column | Type | Nullable | Note |
|---|---|---|---|
| `id` | `uuid` | ✗ | PK |
| `name` | `string` | ✗ | |
| `slug` | `string` | ✗ | unique |
| `owner_id` | `uuid` | ✗ | FK → User |
| `logo_url` | `string` | ✓ | |
| `plan_tier` | `string` | ✗ | "free" / "pro" / "enterprise" |
| `settings` | `json` | ✗ | |
| `is_active` | `bool` | ✗ | |
| `created_at` | `datetime` | ✗ | |
| `updated_at` | `datetime` | ✗ | |
| `deleted_at` | `datetime` | ✓ | Soft delete |

### 6.3 TranslationRoom (TranslationRoomService)

| Column | Type | Nullable | Note |
|---|---|---|---|
| `id` | `uuid` | ✗ | PK |
| `workspace_id` | `uuid` | ✗ | |
| `host_id` | `uuid` | ✗ | |
| `title` | `string` | ✗ | |
| `description` | `string` | ✓ | |
| `translation_room_code` | `string` | ✗ | unique join code |
| `status` | `string` | ✗ | |
| `translation_room_type` | `string` | ✗ | "instant" / "scheduled" |
| `max_participants` | `int` | ✗ | |
| `source_language` | `string` | ✗ | |
| `target_languages` | `string` | ✗ | |
| `settings` | `json` | ✗ | |
| `scheduled_at` | `datetime` | ✓ | |
| `started_at` | `datetime` | ✓ | |
| `ended_at` | `datetime` | ✓ | |
| `duration_seconds` | `int` | ✓ | |
| `created_at` | `datetime` | ✗ | |
| `updated_at` | `datetime` | ✗ | |
| `deleted_at` | `datetime` | ✓ | |

**Relations:** TranslationRoomParticipants, TranslationRoomAudioRoutes, TranslationRoomFeedbacks, TranslationRoomRecordings, TranslationRoomSummary

### 6.4 Transcript (TranscriptService)

| Column | Type | Nullable | Note |
|---|---|---|---|
| `id` | `uuid` | ✗ | PK |
| `translation_room_id` | `uuid` | ✗ | |
| `version` | `int` | ✗ | |
| `status` | `string` | ✗ | default: "recording" |
| `source_language` | `string` | ✗ | |
| `total_segments` | `int` | ✗ | |
| `total_duration_ms` | `int` | ✗ | |
| `created_at` | `datetime` | ✗ | |
| `updated_at` | `datetime` | ✗ | |
| `finalized_at` | `datetime` | ✓ | |
| `deleted_at` | `datetime` | ✓ | |

---

## 7. ⚠️ Mismatches (Frontend hiện tại vs Backend thực tế)

> [!CAUTION]
> Các mismatch dưới đây CẦN FIX trước khi implement Phase 2.

### 7.1 User Model

| Field | Frontend hiện tại (`types/auth.ts`) | Backend thực tế (`UserDto`) | Action |
|---|---|---|---|
| Name | `firstName` + `lastName` + `displayName` | `fullName` (single field) | **FIX** → dùng `fullName` |
| Phone | `phoneNumber` | `phone` | **FIX** → rename |
| Role | `role: UserRole` (single enum) | `roles: string[]` (array) | **FIX** → dùng array |
| Language | *(missing)* | `preferredLanguage` | **ADD** |
| Timezone | *(missing)* | `timezone` | **ADD** |
| CreatedAt | `createdAt` | *(not in UserDto)* | **REMOVE** from FE type |
| LastLoginAt | `lastLoginAt` | *(not in UserDto)* | **REMOVE** from FE type |

### 7.2 Auth Response

| Field | Frontend hiện tại | Backend thực tế | Action |
|---|---|---|---|
| Structure | `{ user, tokens: { accessToken, refreshToken, expiresIn } }` | `{ accessToken, refreshToken, expiresAt, user }` | **FIX** → flat structure |
| Expiry | `expiresIn: number` (seconds) | `expiresAt: DateTime` (ISO string) | **FIX** → dùng `expiresAt` |

### 7.3 Endpoints (`endpoints.ts`)

| Frontend hiện tại | Backend thực tế | Action |
|---|---|---|
| `/auth/login` | `/api/v1/auth/login` | **FIX** → thêm prefix `/api/v1` |
| `/auth/refresh-token` | `/api/v1/auth/refresh` | **FIX** → rename |
| `/auth/profile` | `/api/v1/auth/me` | **FIX** → rename |
| `/auth/google` | `/api/v1/auth/google-login` | **FIX** → rename |
| `/auth/forgot-password` | *(not implemented on backend)* | **NOTE** → backend chưa có |
| `/auth/reset-password` | *(not implemented on backend)* | **NOTE** → backend chưa có |
| `/translationRooms` (no prefix) | `/api/v1/translationRooms` | **FIX** → thêm prefix |
| `/transcripts/search` | *(not implemented)* | **REMOVE** |
| `/transcripts/{id}/export` | *(not implemented)* | **REMOVE** |
| `/workspaces/*` | *(not implemented — chưa có controller)* | **NOTE** → backend chưa có |
| `/subscriptions/*` | *(not implemented)* | **NOTE** → backend chưa có |
| `/admin/*` | *(not implemented)* | **NOTE** → backend chưa có |

### 7.4 Register Request

| Frontend hiện tại | Backend thực tế | Action |
|---|---|---|
| `firstName + lastName + confirmPassword` | `email + password + fullName` | **FIX** → dùng `fullName`, bỏ `confirmPassword` (validate FE only) |

### 7.5 Update Profile Request

| Frontend hiện tại | Backend thực tế | Action |
|---|---|---|
| `firstName, lastName, displayName, phoneNumber, avatarUrl` | `fullName, phone, preferredLanguage, timezone` | **FIX** → align fields |
