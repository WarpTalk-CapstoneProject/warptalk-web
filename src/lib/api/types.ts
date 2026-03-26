/**
 * API response/error types matching backend WarpTalk.Shared contracts.
 *
 * Backend returns DTOs directly (no wrapper envelope).
 * Errors use ApiErrorResponse record.
 */

/** Matches WarpTalk.Shared.ApiErrorResponse */
export interface ApiErrorResponse {
  error?: string;
  code?: string;
}

/** Pagination (for future list endpoints) */
export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface PaginationParams {
  pageNumber?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  search?: string;
}
