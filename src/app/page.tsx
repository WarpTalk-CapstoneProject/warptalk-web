import Link from "next/link";
import { Languages, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <Languages className="h-20 w-20 text-primary" />
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">WarpTalk</h1>
        <p className="mt-4 max-w-lg text-lg text-muted-foreground">
          Nền tảng dịch thuật cuộc họp thời gian thực bằng AI cho các nhóm toàn cầu
        </p>
      </div>
      <div className="flex gap-4">
        <Link href="/register">
          <Button size="lg">
            Bắt đầu miễn phí
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
        <Link href="/login">
          <Button size="lg" variant="outline">
            Đăng nhập
          </Button>
        </Link>
      </div>
    </div>
  );
}
