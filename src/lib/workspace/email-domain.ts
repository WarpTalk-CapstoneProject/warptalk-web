export const PUBLIC_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "zoho.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "live.com",
  "yandex.com",
  "gmx.com",
] as const;

export function extractEmailDomain(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null;

  const domain = normalized.slice(atIndex + 1);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+$/.test(domain)) {
    return null;
  }

  return domain;
}

export function isPublicEmailDomain(domain?: string | null): boolean {
  return !!domain && PUBLIC_EMAIL_DOMAINS.includes(domain as (typeof PUBLIC_EMAIL_DOMAINS)[number]);
}

export function getDomainFromEmail(email?: string | null): string | null {
  const domain = extractEmailDomain(email);
  if (!domain || isPublicEmailDomain(domain)) return null;
  return domain;
}

export function slugPreviewFromName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

