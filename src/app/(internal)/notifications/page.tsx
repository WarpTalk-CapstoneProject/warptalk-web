"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { notificationService } from "@/services/notification.service";
import { getErrorMessage } from "@/lib/errors";
import type { CreateAdminNotificationDto } from "@/types/notification";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Loader2, Megaphone, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const initialFormState: CreateAdminNotificationDto = {
  title: "",
  content: "",
  type: "SYSTEM",
  targetMode: "BROADCAST",
};

export default function AdminNotificationsPage() {
  const [formState, setFormState] =
    useState<CreateAdminNotificationDto>(initialFormState);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateAdminNotificationDto) =>
      notificationService.createAdminNotification(data),
    onSuccess: () => {
      toast.success("Notification sent successfully!");
      setFormState(initialFormState);
      setErrorMsg(null);
    },
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err, "Failed to send notification."));
    },
  });

  const handleSend = () => {
    setErrorMsg(null);
    if (!formState.title.trim()) {
      setErrorMsg("Title is required.");
      return;
    }
    if (!formState.content.trim()) {
      setErrorMsg("Content is required.");
      return;
    }

    createMutation.mutate(formState);
  };

  return (
    <div className="flex min-h-full flex-col gap-6 p-6 pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between bg-surface-1 p-6 rounded-xl border border-hairline shadow-linear">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/billing/plans">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">
              System Notifications
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Broadcast important updates, price changes, or system maintenance to
            users.
          </p>
        </div>
      </div>

      <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Compose Notification
          </CardTitle>
          <CardDescription>
            This message will be dispatched immediately via the notification
            system.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {errorMsg && (
            <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="type">Notification Type</Label>
              <Select
                value={formState.type}
                onValueChange={(val) =>
                  setFormState({ ...formState, type: val || "SYSTEM" })
                }
              >
                <SelectTrigger className="bg-surface-2 border-hairline focus:ring-primary-focus">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-surface-1 border-hairline text-ink">
                  <SelectItem value="SYSTEM">System Alert</SelectItem>
                  <SelectItem value="ANNOUNCEMENT">Announcement</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  <SelectItem value="PROMOTION">Promotion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="targetMode">Target Audience</Label>
              <Select
                value={formState.targetMode}
                onValueChange={(val) =>
                  setFormState({ ...formState, targetMode: val || "BROADCAST" })
                }
              >
                <SelectTrigger className="bg-surface-2 border-hairline focus:ring-primary-focus">
                  <SelectValue placeholder="Select audience" />
                </SelectTrigger>
                <SelectContent className="bg-surface-1 border-hairline text-ink">
                  <SelectItem value="BROADCAST">
                    All Users (Broadcast)
                  </SelectItem>
                  <SelectItem value="SEGMENT">
                    Workspace Owners (Segment)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="e.g. Price Adjustment for AI Services"
              value={formState.title}
              onChange={(e) =>
                setFormState({ ...formState, title: e.target.value })
              }
              className="bg-surface-2 border-hairline focus-visible:ring-primary-focus"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="content">Message Content</Label>
            <Textarea
              id="content"
              rows={5}
              placeholder="Explain the updates or changes clearly to the users..."
              value={formState.content}
              onChange={(e) =>
                setFormState({ ...formState, content: e.target.value })
              }
              className="bg-surface-2 border-hairline focus-visible:ring-primary-focus resize-none"
            />
          </div>
        </CardContent>
        <CardFooter className="border-t border-hairline pt-4 bg-surface-2/20 flex justify-end">
          <Button
            onClick={handleSend}
            className="bg-primary hover:bg-primary-hover text-primary-foreground gap-2 rounded-md"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Notification
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
