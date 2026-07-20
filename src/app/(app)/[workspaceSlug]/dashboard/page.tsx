"use client";

import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useUIStore } from "@/stores/ui-store";
import { useTranslationRooms } from "@/hooks/use-translationRooms";
import { Button } from "@/components/ui/button";
import { 
  Sparkle, 
  Waveform, 
  SquaresFour, 
  ArrowRight,
  PlayCircle,
  Translate,
  Robot,
  Users
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "motion/react";

const popularServices = [
  {
    title: "Translation Rooms",
    description: "Host real-time meetings",
    icon: Translate,
    href: "/rooms",
    color: "from-blue-500/20 to-indigo-500/20",
    iconColor: "text-blue-500"
  },
  {
    title: "AI Summaries",
    description: "Review past meeting insights",
    icon: Sparkle,
    href: "/ai-summaries",
    color: "from-purple-500/20 to-pink-500/20",
    iconColor: "text-purple-500"
  },
  {
    title: "Workspace Members",
    description: "Manage your team",
    icon: Users,
    href: "/members",
    color: "from-emerald-500/20 to-teal-500/20",
    iconColor: "text-emerald-500"
  }
];

export default function WorkspaceDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const activeWorkspaceSlug = useWorkspaceStore((s) => s.activeWorkspaceSlug);
  const setCreateRoomModalOpen = useUIStore((s) => s.setCreateRoomModalOpen);

  const { data: roomsData, isLoading: isLoadingRooms } = useTranslationRooms({ pageSize: 6 });
  const recentRooms = roomsData?.rooms || [];

  const firstName = user?.fullName?.split(" ")[0] || "User";

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-10 scrollbar-hide bg-canvas text-ink">
      <div className="max-w-7xl mx-auto space-y-10 w-full">
      {/* Header & Greeting */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink flex items-center gap-2">
            Welcome, <span className="font-serif italic font-normal text-4xl">{firstName}</span> <span className="text-2xl animate-wave origin-bottom-right">👋</span>
          </h1>
          <p className="text-ink-muted mt-1">
            Manage your multilingual meetings, workspace members, and review AI summaries.
          </p>
        </div>
      </motion.div>

      {/* Hero Section */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Main CTA Card */}
        <div className="lg:col-span-1 bg-gradient-to-br from-[#0A102A] via-[#101940] to-indigo-950 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-500/10 group border border-white/5">
          {/* Noise texture overlay */}
          <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none" style={{backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')"}}></div>
          
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]"></div>

          {/* Landing Page Video Visual */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
            <video 
              className="absolute inset-0 size-full object-cover opacity-30 mix-blend-screen transition-opacity duration-1000 group-hover:opacity-50" 
              autoPlay 
              muted 
              loop 
              playsInline 
              preload="auto"
            >
              <source
                src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260503_104800_bc43ae09-f494-43e3-97d7-2f8c1692cfd7.mp4"
                type="video/mp4"
              />
            </video>
          </div>

          <div className="relative z-10 flex flex-col h-full justify-between gap-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-xl text-xs font-medium border border-white/10 shadow-inner">
                <Sparkle size={14} weight="fill" className="text-blue-400" />
                <span className="text-blue-50">WarpTalk Premium</span>
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold leading-tight font-serif tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70">
                Break Down Language <br/> Barriers Instantly
              </h2>
              <p className="text-indigo-100/70 text-sm max-w-sm">
                Host real-time multilingual meetings with live transcription and AI translation.
              </p>
            </div>
            
            <Button 
              onClick={() => setCreateRoomModalOpen(true)}
              className="bg-white/10 backdrop-blur-md text-white border border-white/20 hover:bg-white/20 hover:border-white/30 rounded-2xl px-6 py-5 font-semibold text-sm w-fit group-hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all flex items-center gap-2"
            >
              Start a Room <ArrowRight size={16} weight="bold" className="group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>

        {/* Popular Services */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">Popular Services</h3>
            <div className="flex gap-2">
              <button className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-2 hover:bg-surface-3 transition-colors text-ink-muted border border-border">
                <ArrowRight size={14} className="rotate-180" />
              </button>
              <button className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-2 hover:bg-surface-3 transition-colors text-ink border border-border">
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            {popularServices.map((service, i) => {
              const Icon = service.icon;
              return (
                <Link href={`/${activeWorkspaceSlug}${service.href}`} key={i} className="block h-full">
                  <div className="bg-surface-1/50 border border-border/40 rounded-3xl p-6 h-full flex flex-col items-center justify-center text-center hover:border-primary/30 hover:bg-surface-1 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300 group relative overflow-hidden backdrop-blur-sm">
                    {/* Abstract Hover Background */}
                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${service.color} opacity-0 group-hover:opacity-40 transition-opacity duration-500 rounded-full blur-2xl -mr-10 -mt-10`}></div>
                    
                    <div className="relative z-10 flex flex-col items-center">
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${service.color} border border-border/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm`}>
                        <Icon size={28} weight="duotone" className={service.iconColor} />
                      </div>
                      <h4 className="font-semibold text-ink text-sm">{service.title}</h4>
                      <p className="text-xs text-ink-muted mt-1">{service.description}</p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* Recent Rooms */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink flex items-center gap-1 group cursor-pointer hover:text-primary transition-colors">
            Recent & Upcoming Rooms <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -ml-2 group-hover:ml-0 transition-all" />
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoadingRooms ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-surface-1 border border-border rounded-2xl p-4 flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-surface-3"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-3 rounded w-3/4"></div>
                  <div className="h-3 bg-surface-3 rounded w-1/2"></div>
                </div>
              </div>
            ))
          ) : recentRooms.length > 0 ? (
            recentRooms.map((room, i) => {
              const bgColors = ["bg-blue-500", "bg-purple-500", "bg-teal-500", "bg-orange-500", "bg-pink-500", "bg-indigo-500"];
              const bgColor = bgColors[i % bgColors.length];
              const isLive = room.status === "in_progress";
              
              return (
                <Link href={`/${activeWorkspaceSlug}/rooms/${room.id}`} key={room.id} className="block h-full">
                  <div className="bg-surface-1/50 border border-border/40 rounded-3xl p-4 flex items-center gap-4 hover:border-primary/30 hover:bg-surface-1 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group h-full relative overflow-hidden backdrop-blur-sm">
                    {/* Hover Glow */}
                    <div className="absolute left-0 bottom-0 w-24 h-24 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-full blur-xl -ml-8 -mb-8 pointer-events-none"></div>
                    
                    <div className="relative z-10 flex items-center gap-4 w-full">
                      <div className="relative">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${bgColor} shadow-md ring-2 ring-canvas group-hover:ring-primary/20 transition-all`}>
                          {(room.title || "R").charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-ink text-sm truncate group-hover:text-primary transition-colors">{room.title || "Untitled"}</h4>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" : "bg-surface-4"}`} />
                          <span className="text-xs text-ink-muted truncate font-medium">
                            {isLive ? "Live now" : room.status}
                          </span>
                          <span className="text-xs text-ink-muted/50 mx-1">•</span>
                          <span className="text-xs text-ink-muted truncate">{room.sourceLanguage || "Multiple"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="col-span-full py-8 text-center text-ink-muted text-sm border border-dashed border-border rounded-2xl">
              No recent rooms found.
            </div>
          )}
        </div>
      </motion.div>

      {/* Feature Highlights */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="space-y-4 pb-8"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">WarpTalk Feature Highlights</h3>
          <div className="flex gap-2">
            <button className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-2 hover:bg-surface-3 transition-colors text-ink-muted border border-border">
              <ArrowRight size={14} className="rotate-180" />
            </button>
            <button className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-2 hover:bg-surface-3 transition-colors text-ink border border-border">
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-1 border border-border/40 rounded-3xl p-5 flex items-center gap-4 hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group">
             <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:12px_12px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
             <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-blue-500/10 transition-colors duration-500 pointer-events-none"></div>
             
             <div className="relative z-10 w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shadow-sm group-hover:scale-105 transition-transform duration-300">
                <SquaresFour size={28} weight="duotone" />
             </div>
             <div className="relative z-10">
               <p className="font-semibold text-ink text-sm">Enterprise</p>
               <p className="text-ink-muted text-xs">AI Transcription</p>
             </div>
          </div>
          
          <div className="bg-surface-1 border border-border/40 rounded-3xl p-5 flex items-center gap-4 hover:border-purple-500/30 hover:shadow-xl hover:shadow-purple-500/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group">
             <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:12px_12px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
             <div className="absolute right-0 top-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-purple-500/10 transition-colors duration-500 pointer-events-none"></div>
             
             <div className="relative z-10 w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-500 shadow-sm group-hover:scale-105 transition-transform duration-300">
                <Sparkle size={28} weight="duotone" />
             </div>
             <div className="relative z-10">
               <p className="font-semibold text-ink text-sm">Instant</p>
               <p className="text-ink-muted text-xs">Meeting Insights</p>
             </div>
          </div>

          <div className="bg-surface-1 border border-border/40 rounded-3xl p-5 flex items-center gap-4 hover:border-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group">
             <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:12px_12px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
             <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-emerald-500/10 transition-colors duration-500 pointer-events-none"></div>
             
             <div className="relative z-10 w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-sm group-hover:scale-105 transition-transform duration-300">
                <Robot size={28} weight="duotone" />
             </div>
             <div className="relative z-10">
               <p className="font-semibold text-ink text-sm">Secure</p>
               <p className="text-ink-muted text-xs">Artifact Retention</p>
             </div>
          </div>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
