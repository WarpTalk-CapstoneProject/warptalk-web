"use client";

/**
 * The billing hub, finally bound to something.
 *
 * WHAT ARRIVES HERE, AND WHAT DOES NOT
 *   The Gateway relays every `billing.*` notification to `user:{id}` on `/hubs/billing` under the
 *   name `BillingNotification`. In practice that is subscription created / cancelled / changed,
 *   plan edits, rate changes, a processed payment, and overage starting.
 *
 *   It is NOT credit consumption. `BillingNotificationHelper.PublishCreditUpdateAsync` and the
 *   `billing.credits_updated` constant both exist in the billing service with no caller, so
 *   nothing publishes when credits are spent. A screen that must follow spending has to poll as
 *   well — this hook deliberately does not pretend otherwise, and Usage does both.
 *
 * WHY A HOOK RATHER THAN THE NOTIFICATION PROVIDER
 *   The provider holds one connection for the whole app and would have to keep it for every
 *   screen. Billing is two pages that a workspace owner opens occasionally; the socket lives as
 *   long as one of them is mounted and closes with it.
 */

import { useEffect, useRef } from "react";

import { SIGNALR_EVENTS, SIGNALR_HUBS } from "@/constants/realtime";
import { endDeadSession, isSessionEnded } from "@/lib/api/client";
import { createHubConnection, isUnauthorizedHubError } from "@/lib/realtime/signalr";
import { useAuthStore } from "@/stores/auth-store";

export function useBillingRealtime(onBillingEvent: () => void) {
  const accessToken = useAuthStore((state) => state.accessToken);

  // The callback is re-created on every render of the page that owns it. Reading it through a ref
  // keeps it current without tearing the connection down and renegotiating each time.
  const handler = useRef(onBillingEvent);
  useEffect(() => {
    handler.current = onBillingEvent;
  }, [onBillingEvent]);

  useEffect(() => {
    // No token, or a session already known to be dead, means negotiation can only 401.
    if (!accessToken || isSessionEnded()) return;

    const connection = createHubConnection(SIGNALR_HUBS.BILLING);

    connection.on(SIGNALR_EVENTS.BILLING_NOTIFICATION, () => {
      handler.current();
    });

    connection.start().catch((error) => {
      // A 401 on negotiation is the same dead session the REST calls are seeing. Ending it here
      // stops the tab retrying instead of waiting for a query to notice.
      if (isUnauthorizedHubError(error)) {
        endDeadSession();
      }
    });

    return () => {
      connection.off(SIGNALR_EVENTS.BILLING_NOTIFICATION);
      connection.stop();
    };
  }, [accessToken]);
}
