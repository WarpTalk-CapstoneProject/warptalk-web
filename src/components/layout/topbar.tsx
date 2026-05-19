"use client";

import { usePathname } from "next/navigation";
import { Bell, HelpCircle, Moon, ChevronRight, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Topbar() {
  const pathname = usePathname();

  // Build breadcrumbs from pathname
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((seg, i) => ({
    label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "),
    isLast: i === segments.length - 1,
  }));

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-100 bg-white px-6 shrink-0">
      {/* Breadcrumbs */}
      <div className="flex items-center text-sm">
        <span className="text-[#000000] hover:text-[#003476] cursor-pointer font-medium">WarpTalk</span>
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center">
            <ChevronRight className="h-4 w-4 text-[#000000] mx-1" />
            <span className={crumb.isLast ? "text-[#003476] font-semibold" : "text-[#000000] hover:text-[#003476] cursor-pointer font-medium"}>
              {crumb.label}
            </span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-[#000000] hover:bg-[#fdfcf6] transition-colors">
          <HelpCircle className="h-4 w-4" />
        </button>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-[#000000] hover:bg-[#fdfcf6] transition-colors">
          <Bell className="h-4 w-4" />
        </button>
        <button className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-[#000000] hover:bg-[#fdfcf6] transition-colors">
          <Moon className="h-4 w-4" />
        </button>

        <div className="ml-2 flex items-center gap-2 rounded-full border border-slate-200 p-1 pr-3 cursor-pointer hover:bg-[#fdfcf6] transition-colors">
          <Avatar className="h-7 w-7 bg-[#003476]">
            <AvatarFallback className="bg-[#003476] text-white text-xs font-semibold">H</AvatarFallback>
          </Avatar>
          <span className="text-sm font-semibold text-[#003476]">Host</span>
          <ChevronDown className="h-4 w-4 text-[#000000]" />
        </div>
      </div>
    </header>
  );
}
