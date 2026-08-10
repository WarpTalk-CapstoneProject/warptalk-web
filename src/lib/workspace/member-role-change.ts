import type {
  ApplyWorkspaceRoleChangeRequest,
  WorkspaceRoleChangePreview,
} from "@/types/workspace";

export type EditableWorkspaceRole = "Admin" | "Member";

export interface MemberRoleChangeIntent {
  preview: WorkspaceRoleChangePreview;
  idempotencyKey: string;
  correlationId: string;
}

interface PromotionCooldown {
  deadlineMs: number;
  remainingSeconds: number;
}

export function getMemberRoleConfirmationValue(email: string, fullName: string): string {
  return email.trim() || fullName.trim();
}

export function matchesMemberRoleConfirmation(
  confirmation: string,
  email: string,
  fullName: string,
): boolean {
  const expected = getMemberRoleConfirmationValue(email, fullName).toLowerCase();
  return expected.length > 0 && confirmation.trim().toLowerCase() === expected;
}

export function getPromotionCooldown(
  coolingOffUntil: string | null | undefined,
  nowMs: number,
): PromotionCooldown | null {
  const deadlineMs = getPromotionCooldownDeadline(coolingOffUntil);
  if (deadlineMs === null) return null;

  return {
    deadlineMs,
    remainingSeconds: Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000)),
  };
}

export function getPromotionCooldownDeadline(
  coolingOffUntil: string | null | undefined,
): number | null {
  if (!coolingOffUntil) return null;

  const deadlineMs = Date.parse(coolingOffUntil);
  return Number.isFinite(deadlineMs) ? deadlineMs : null;
}

export function isRoleChangePreviewForTarget(
  preview: WorkspaceRoleChangePreview,
  targetUserId: string,
  targetRole: EditableWorkspaceRole,
): boolean {
  return (
    preview.targetUserId === targetUserId &&
    preview.targetRole.trim().toLowerCase() === targetRole.toLowerCase() &&
    Boolean(preview.previewToken?.trim())
  );
}

export function createMemberRoleChangeIntent(
  preview: WorkspaceRoleChangePreview,
  createId: () => string,
): MemberRoleChangeIntent {
  return {
    preview,
    idempotencyKey: createId(),
    correlationId: createId(),
  };
}

export function buildMemberRoleChangeRequest(
  intent: MemberRoleChangeIntent,
  targetRole: EditableWorkspaceRole,
): ApplyWorkspaceRoleChangeRequest {
  return {
    targetRole,
    idempotencyKey: intent.idempotencyKey,
    previewToken: intent.preview.previewToken!.trim(),
    correlationId: intent.correlationId,
  };
}
