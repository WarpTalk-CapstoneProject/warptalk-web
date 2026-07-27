export const PaymentType = {
  CreditTopUp: "CreditTopUp",
  Subscription: "Subscription",
  SubscriptionRenewal: "SubscriptionRenewal",
  SubscriptionUpdate: "SubscriptionUpdate",
  InvoicePayment: "InvoicePayment",
} as const;

export type PaymentTypeValue = (typeof PaymentType)[keyof typeof PaymentType];
