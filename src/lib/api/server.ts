"use server";

import { cookies } from "next/headers";

/**
 * Server-side fetch wrapper for use in Server Components and Server Actions.
 * Automatically attaches auth token from cookies.
 */
export async function serverFetch<T>(
  endpoint: string,
  options?: {
    method?: string;
    body?: unknown;
    revalidate?: number | false;
    tags?: string[];
    cache?: RequestCache;
  }
): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;

  const baseUrl = process.env.API_GATEWAY_URL || "http://localhost:5000";
  const url = `${baseUrl}/api/v1${endpoint}`;

  const res = await fetch(url, {
    method: options?.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
    next: {
      revalidate: options?.revalidate,
      tags: options?.tags,
    },
    cache: options?.cache,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({
      message: `API Error: ${res.status} ${res.statusText}`,
      statusCode: res.status,
    }));
    throw error;
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}
