"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spinner } from "@phosphor-icons/react";

export default function WorkspacePaymentPlansRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params?.workspaceSlug as string) || "workspace";

  useEffect(() => {
    router.replace(`/${slug}/billing`);
  }, [router, slug]);

  return (
    <div className="flex h-full items-center justify-center bg-canvas text-ink-muted">
      <Spinner className="mr-2 h-4 w-4 animate-spin" />
      Redirecting to Enterprise billing
    </div>
  );
}
