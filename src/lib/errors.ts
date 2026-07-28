import axios from "axios";

interface ApiErrorBody {
  error?: string;
  message?: string;
  Message?: string;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    return (
      body?.message ?? body?.Message ?? body?.error ?? error.message ?? fallback
    );
  }

  return error instanceof Error ? error.message : fallback;
}
