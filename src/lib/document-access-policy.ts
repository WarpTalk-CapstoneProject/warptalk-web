export interface DocumentAccessPolicyLike {
  subjectType?: string | null;
  subjectKey?: string | null;
  permission?: string | null;
  effect?: string | null;
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function isExternalViewPolicy(policy: DocumentAccessPolicyLike): boolean {
  return (
    normalize(policy.subjectType) === "membershiptype" &&
    normalize(policy.subjectKey) === "external" &&
    normalize(policy.permission) === "view" &&
    normalize(policy.effect) === "allow"
  );
}
