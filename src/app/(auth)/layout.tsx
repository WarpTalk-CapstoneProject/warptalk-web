import type { ReactNode } from "react";
import Link from "next/link";
import { Languages } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2.5 text-2xl font-bold tracking-tight"
      >
        <Languages className="h-8 w-8 text-primary" />
        <span>WarpTalk</span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
