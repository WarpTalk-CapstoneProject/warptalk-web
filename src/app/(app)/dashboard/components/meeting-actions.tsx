"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, Plus, Link as LinkIcon, Loader2 } from "lucide-react";
import apiClient from "@/lib/api/client";
import { toast } from "sonner";

export function MeetingActions() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateMeeting = async () => {
    setIsCreating(true);
    try {
      const { data } = await apiClient.post("/translation-rooms", {
        title: "Quick Meeting " + new Date().toLocaleTimeString(),
        translationRoomType: 1, // Instant
        maxParticipants: 10,
        sourceLanguage: "en-US",
        targetLanguages: ["vi-VN"],
        settings: {
          requiresApproval: false
        }
      });
      
      toast.success("Đã tạo cuộc họp thành công!");
      router.push(`/test-meeting?roomId=${data.id}`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Không thể tạo cuộc họp");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setIsJoining(true);
    try {
      // For now, if it's a GUID, we route directly to test-meeting.
      // Ideally, we call the translation-rooms/join endpoint first to get the Room ID if it's a short code.
      let roomId = joinCode.trim();
      
      // Attempt to join via API to validate
      const { data } = await apiClient.post("/translation-rooms/join", {
        translationRoomCode: roomId,
        displayName: "Guest " + Math.floor(Math.random() * 1000)
      });
      
      toast.success("Đang vào phòng...");
      router.push(`/test-meeting?roomId=${data.room.id}`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Mã cuộc họp không hợp lệ");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 mb-6">
      <Card className="relative overflow-hidden group hover:shadow-md transition-all duration-300 border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all duration-500" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-md text-primary">
              <Video className="w-5 h-5" />
            </div>
            Tạo Cuộc Họp Mới
          </CardTitle>
          <CardDescription>
            Bắt đầu cuộc gọi video đa ngôn ngữ với bản dịch AI theo thời gian thực.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            className="w-full sm:w-auto font-medium" 
            size="lg" 
            onClick={handleCreateMeeting}
            disabled={isCreating}
          >
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Bắt Đầu Ngay
          </Button>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden group hover:shadow-md transition-all duration-300">
        <div className="absolute bottom-0 right-0 -mb-4 -mr-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all duration-500" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/10 rounded-md text-blue-500">
              <LinkIcon className="w-5 h-5" />
            </div>
            Tham Gia Bằng Mã
          </CardTitle>
          <CardDescription>
            Nhập ID hoặc mã cuộc họp để kết nối với phòng dịch hiện có.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinMeeting} className="flex w-full max-w-sm items-center space-x-2">
            <Input 
              type="text" 
              placeholder="Nhập ID cuộc họp..." 
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              disabled={isJoining}
              className="bg-background"
            />
            <Button type="submit" variant="secondary" disabled={isJoining || !joinCode.trim()}>
              {isJoining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tham gia"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
