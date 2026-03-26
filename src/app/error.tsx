"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <AlertCircle className="h-16 w-16 text-destructive" />
      <div className="text-center">
        <h1 className="text-2xl font-bold">Đã xảy ra lỗi</h1>
        <p className="mt-2 text-muted-foreground">
          Vui lòng thử lại hoặc liên hệ hỗ trợ
        </p>
      </div>
      <Button onClick={reset}>Thử lại</Button>
    </div>
  );
}
