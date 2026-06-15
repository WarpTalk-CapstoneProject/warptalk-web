"use client";

import { useUIStore } from "@/stores/ui-store";

export function BackToSetupButton({ roomId }: { roomId: string }) {
  return (
    <button 
      onClick={() => {
        useUIStore.getState().setSetupRoomId(roomId);
        useUIStore.getState().setSetupRoomModalOpen(true);
      }} 
      className="inline-flex h-8 items-center justify-center rounded-full border border-border px-3 text-sm font-medium transition hover:bg-muted"
    >
      Back to setup
    </button>
  );
}
