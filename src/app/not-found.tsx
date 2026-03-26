import Link from "next/link";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <Languages className="h-16 w-16 text-muted-foreground" />
      <div className="text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">
          Trang bạn tìm không tồn tại
        </p>
      </div>
      <Link href="/dashboard">
        <Button>Về trang chủ</Button>
      </Link>
    </div>
  );
}
