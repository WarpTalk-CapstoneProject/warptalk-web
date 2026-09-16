/**
 * A sales lead as billing stores it (`subscription.sales_inquiries`, `SalesInquiryDto`).
 *
 * The five statuses are the table's CHECK constraint — anything else is refused with a 400, so
 * the UI offers exactly these and nothing it would have to translate.
 */
export const SALES_LEAD_STATUSES = ["new", "reviewing", "quoted", "converted", "closed"] as const;

export type SalesLeadStatus = (typeof SALES_LEAD_STATUSES)[number];

export interface SalesLeadDto {
  id: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  company: string;
  requestType: string;
  featureInterests: string[];
  targetLanguages: string[];
  currentMonthlyMeetingVolume: string;
  expectedMonthlyMeetingVolumeInSixMonths: string | null;
  useCaseNotes: string | null;
  /** Free-form JSON the form sent. Only known numeric keys are ever read from it. */
  pricingEstimate: Record<string, unknown> | null;
  consent: boolean;
  source: string;
  status: SalesLeadStatus;
  workspaceId: string | null;
  subscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
  convertedAt: string | null;
  closedAt: string | null;
}

/** Billing's own `PaginatedResponse<T>` — not the admin-workspace `AdminPagedResult` shape. */
export interface SalesLeadPage {
  items: SalesLeadDto[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface SalesLeadQuery {
  page: number;
  pageSize: number;
  status?: SalesLeadStatus;
  search?: string;
}
