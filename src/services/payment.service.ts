import apiClient from "@/lib/api/client";

export interface CreateCheckoutSessionRequest {
  userId: string;
  workspaceId: string;
  amount: number;
  currency: string;
  paymentType: string;
}

export const paymentService = {
  /**
   * Create a Stripe Checkout Session for Top-up or Subscription.
   * Returns the Stripe Checkout URL.
   */
  createCheckoutSession: async (request: CreateCheckoutSessionRequest): Promise<string> => {
    const { data } = await apiClient.post<{ url: string }>("/payments/checkout", request);
    return data.url;
  },
};
