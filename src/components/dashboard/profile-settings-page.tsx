"use client";

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Bell, Briefcase, Camera, Check, Globe, ImageSquare, Translate, Envelope, MapPin, Pencil, Phone, ArrowCounterClockwise, ShieldCheck, User, X, MagnifyingGlassPlus } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/stores/auth-store";

type ProfileRole = "host" | "participant" | "workspace" | "internal";

type ProfileDraft = {
  fullName: string;
  email: string;
  phone: string;
  title: string;
  location: string;
  preferredLanguage: string;
  timezone: string;
  avatarUrl: string;
  coverUrl: string;
  coverOffsetY: number;
  meetingAlerts: boolean;
  artifactAlerts: boolean;
};

const AVATAR_VIEWPORT_SIZE = 280;
const AVATAR_OUTPUT_SIZE = 512;

const roleDefaults: Record<
  ProfileRole,
  { label: string; title: string; fullName: string; email: string; location: string }
> = {
  host: {
    label: "Host",
    title: "Meeting Host",
    fullName: "WarpTalk Host",
    email: "host@warptalk.ai",
    location: "Ho Chi Minh City, Vietnam",
  },
  participant: {
    label: "Participant",
    title: "Workspace Participant",
    fullName: "WarpTalk Participant",
    email: "participant@warptalk.ai",
    location: "Tokyo, Japan",
  },
  workspace: {
    label: "Workspace Manager",
    title: "Workspace Owner",
    fullName: "Workspace Manager",
    email: "owner@company.com",
    location: "Singapore",
  },
  internal: {
    label: "Internal Manager",
    title: "WarpTalk Operations",
    fullName: "WarpTalk Manager",
    email: "manager@warptalk.ai",
    location: "Ho Chi Minh City, Vietnam",
  },
};

function createInitialDraft(
  role: ProfileRole,
  user: ReturnType<typeof useAuthStore.getState>["user"]
): ProfileDraft {
  const defaults = roleDefaults[role];

  return {
    fullName: user?.fullName || defaults.fullName,
    email: user?.email || defaults.email,
    phone: user?.phone || "",
    title: defaults.title,
    location: defaults.location,
    preferredLanguage: user?.preferredLanguage || "vi-VN",
    timezone: user?.timezone || "Asia/Ho_Chi_Minh",
    avatarUrl: user?.avatarUrl || "",
    coverUrl: "/assets/backgrounds/dashboard-nebula.png",
    coverOffsetY: 0,
    meetingAlerts: true,
    artifactAlerts: true,
  };
}

function readStoredProfile(
  role: ProfileRole,
  user: ReturnType<typeof useAuthStore.getState>["user"]
): ProfileDraft {
  const initial = createInitialDraft(role, user);
  if (typeof window === "undefined") return initial;

  try {
    const stored = window.localStorage.getItem(`warptalk-profile-${role}`);
    return stored ? { ...initial, ...JSON.parse(stored) } : initial;
  } catch {
    return initial;
  }
}

export function ProfileSettingsPage({ role }: { role: ProfileRole }) {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const uploadRef = useRef<HTMLInputElement>(null);
  const coverUploadRef = useRef<HTMLInputElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null);
  const coverDragRef = useRef<{ pointerY: number; offsetY: number } | null>(null);
  const storageKey = `warptalk-profile-${role}`;
  const [editing, setEditing] = useState(false);
  const [savedProfile, setSavedProfile] = useState<ProfileDraft>(() => readStoredProfile(role, user));
  const [draft, setDraft] = useState<ProfileDraft>(() => readStoredProfile(role, user));
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSource, setCropSource] = useState("");
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);

  useEffect(() => {
    if (!cameraOpen || !cameraStream || !cameraVideoRef.current) return;

    const video = cameraVideoRef.current;
    video.srcObject = cameraStream;
    const playVideo = async () => {
      try {
        await video.play();
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "Unable to start the camera preview.");
      }
    };
    void playVideo();

    return () => {
      if (video.srcObject === cameraStream) video.srcObject = null;
    };
  }, [cameraOpen, cameraStream]);

  useEffect(
    () => () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const initials =
    draft.fullName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "WT";

  const updateDraft = <Key extends keyof ProfileDraft>(key: Key, value: ProfileDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Avatar must be smaller than 3 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropSource(String(reader.result));
      setCropZoom(1);
      setCropOffset({ x: 0, y: 0 });
      setImageSize({ width: 0, height: 0 });
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCover = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Cover image must be smaller than 8 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateDraft("coverUrl", String(reader.result));
      updateDraft("coverOffsetY", 0);
      setEditing(true);
      toast.success("Cover image added. Drag it to adjust the visible area.");
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    setCameraError("");
    setCameraReady(false);
    setCameraLoading(true);
    setCameraOpen(true);
    try {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported by this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Unable to access the camera.");
    } finally {
      setCameraLoading(false);
    }
  };

  const closeCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraReady(false);
    setCameraLoading(false);
    setCameraError("");
    setCameraOpen(false);
  };

  const captureAvatar = () => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    closeCamera();
    setCropSource(canvas.toDataURL("image/jpeg", 0.92));
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setImageSize({ width: 0, height: 0 });
    setCropOpen(true);
  };

  const cropMetrics = getCropMetrics(imageSize, cropZoom);

  const updateCropOffset = (nextX: number, nextY: number) => {
    setCropOffset({
      x: clamp(nextX, -cropMetrics.maxOffsetX, cropMetrics.maxOffsetX),
      y: clamp(nextY, -cropMetrics.maxOffsetY, cropMetrics.maxOffsetY),
    });
  };

  const handleCropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: cropOffset.x,
      offsetY: cropOffset.y,
    };
  };

  const handleCropPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    updateCropOffset(
      dragRef.current.offsetX + event.clientX - dragRef.current.pointerX,
      dragRef.current.offsetY + event.clientY - dragRef.current.pointerY
    );
  };

  const handleCropPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleCoverPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    coverDragRef.current = { pointerY: event.clientY, offsetY: draft.coverOffsetY };
  };

  const handleCoverPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing || !coverDragRef.current) return;
    updateDraft(
      "coverOffsetY",
      clamp(coverDragRef.current.offsetY + event.clientY - coverDragRef.current.pointerY, -120, 120)
    );
  };

  const handleCoverPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    coverDragRef.current = null;
  };

  const handleZoomChange = (nextZoom: number) => {
    const nextMetrics = getCropMetrics(imageSize, nextZoom);
    setCropZoom(nextZoom);
    setCropOffset((current) => ({
      x: clamp(current.x, -nextMetrics.maxOffsetX, nextMetrics.maxOffsetX),
      y: clamp(current.y, -nextMetrics.maxOffsetY, nextMetrics.maxOffsetY),
    }));
  };

  const applyAvatarCrop = () => {
    const image = cropImageRef.current;
    if (!image || !imageSize.width || !imageSize.height) return;

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_OUTPUT_SIZE;
    canvas.height = AVATAR_OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) {
      toast.error("Unable to crop this image.");
      return;
    }

    const outputScale = AVATAR_OUTPUT_SIZE / AVATAR_VIEWPORT_SIZE;
    context.drawImage(
      image,
      (AVATAR_VIEWPORT_SIZE - cropMetrics.displayWidth) / 2 + cropOffset.x,
      (AVATAR_VIEWPORT_SIZE - cropMetrics.displayHeight) / 2 + cropOffset.y,
      cropMetrics.displayWidth,
      cropMetrics.displayHeight
    );

    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = AVATAR_VIEWPORT_SIZE;
    previewCanvas.height = AVATAR_VIEWPORT_SIZE;
    const previewContext = previewCanvas.getContext("2d");
    if (!previewContext) return;
    previewContext.drawImage(
      image,
      (AVATAR_VIEWPORT_SIZE - cropMetrics.displayWidth) / 2 + cropOffset.x,
      (AVATAR_VIEWPORT_SIZE - cropMetrics.displayHeight) / 2 + cropOffset.y,
      cropMetrics.displayWidth,
      cropMetrics.displayHeight
    );
    context.clearRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
    context.drawImage(
      previewCanvas,
      0,
      0,
      AVATAR_VIEWPORT_SIZE,
      AVATAR_VIEWPORT_SIZE,
      0,
      0,
      AVATAR_VIEWPORT_SIZE * outputScale,
      AVATAR_VIEWPORT_SIZE * outputScale
    );

    updateDraft("avatarUrl", canvas.toDataURL("image/jpeg", 0.9));
    setEditing(true);
    setCropOpen(false);
    toast.success("Avatar cropped. Save your profile to keep this change.");
  };

  const handleSave = () => {
    if (!draft.fullName.trim()) {
      toast.error("Display name is required.");
      return;
    }
    if (!draft.email.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }

    const normalized = {
      ...draft,
      fullName: draft.fullName.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      title: draft.title.trim(),
      location: draft.location.trim(),
    };

    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    setSavedProfile(normalized);
    setDraft(normalized);
    updateUser({
      fullName: normalized.fullName,
      email: normalized.email,
      phone: normalized.phone,
      preferredLanguage: normalized.preferredLanguage,
      timezone: normalized.timezone,
      avatarUrl: normalized.avatarUrl,
    });
    setEditing(false);
    toast.success("Profile settings saved.");
  };

  const handleCancel = () => {
    setDraft(savedProfile);
    setEditing(false);
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2.5 overflow-hidden">
      <section className="relative min-w-0 overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-[0_18px_55px_rgba(15,15,15,0.08)]">
        <div
          className={`relative h-36 touch-none overflow-hidden bg-neutral-900 ${editing ? "cursor-ns-resize" : ""}`}
          onPointerDown={handleCoverPointerDown}
          onPointerMove={handleCoverPointerMove}
          onPointerUp={handleCoverPointerEnd}
          onPointerCancel={handleCoverPointerEnd}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.coverUrl}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 select-none object-cover saturate-0"
            style={{ objectPosition: `center calc(50% + ${draft.coverOffsetY}px)` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-black/5 to-black/25" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-white/40" />
          <Badge className="absolute right-5 top-5 rounded-full border-white/20 bg-white/10 px-3 text-white backdrop-blur-md">
            {roleDefaults[role].label}
          </Badge>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute bottom-4 right-5 rounded-full border border-white/50 bg-white/90 text-neutral-950 shadow-lg hover:bg-white"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => coverUploadRef.current?.click()}
          >
            <ImageSquare weight="light" />
            Change cover
          </Button>
          {editing ? (
            <span className="absolute bottom-5 left-5 rounded-full bg-black/45 px-3 py-1 text-xs text-white backdrop-blur-md">
              Drag cover to reposition
            </span>
          ) : null}
          <input ref={coverUploadRef} type="file" accept="image/*" className="hidden" onChange={handleCover} />
        </div>

        <div className="grid min-w-0 gap-3 px-5 pb-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-end xl:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="-mt-12">
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-white bg-neutral-100 shadow-lg">
                {draft.avatarUrl ? <AvatarImage src={draft.avatarUrl} alt={draft.fullName} /> : null}
                <AvatarFallback className="bg-neutral-950 text-xl font-semibold text-white">{initials}</AvatarFallback>
              </Avatar>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-neutral-950 text-white shadow-md transition-transform hover:scale-105"
                  aria-label="Change profile photo"
                  title="Change profile photo"
                >
                  <Camera weight="light" className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44 rounded-xl p-1.5">
                  <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => uploadRef.current?.click()}>
                    <ImageSquare weight="light" />
                    Upload photo
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={() => void startCamera()}>
                    <Camera weight="light" />
                    Take photo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
            </div>
          </div>

          <div className="min-w-0 pt-1">
            <h2 className="truncate text-2xl font-semibold tracking-tight">{draft.fullName}</h2>
            <p className="text-sm font-medium text-neutral-600">{draft.title}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">
              <MapPin weight="light" className="h-3.5 w-3.5" />
              {draft.location}
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap gap-2 md:col-span-2 xl:col-span-1">
            {editing ? (
              <>
                <Button variant="outline" className="rounded-full px-4" onClick={handleCancel}>
                  <X weight="light" />
                  Cancel
                </Button>
                <Button className="rounded-full bg-neutral-950 px-4 text-white hover:bg-neutral-800" onClick={handleSave}>
                  <Check weight="light" />
                  Save changes
                </Button>
              </>
            ) : (
              <Button className="rounded-full bg-neutral-950 px-4 text-white hover:bg-neutral-800" onClick={() => setEditing(true)}>
                <Pencil weight="light" />
                Edit profile
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="grid min-h-0 min-w-0 flex-1 gap-2.5 xl:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.7fr)]">
        <section className="min-h-0 min-w-0 rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_45px_rgba(15,15,15,0.07)]">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-950 text-white">
              <User weight="light" className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-semibold">Personal information</h3>
              <p className="text-xs text-neutral-500">Identity used across meetings and workspace activity.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ProfileField label="Display name" icon={<User weight="light" />} value={draft.fullName} disabled={!editing} onChange={(value) => updateDraft("fullName", value)} />
            <ProfileField label="Email address" icon={<Envelope weight="light" />} value={draft.email} disabled={!editing} onChange={(value) => updateDraft("email", value)} />
            <ProfileField label="Job title" icon={<Briefcase weight="light" />} value={draft.title} disabled={!editing} onChange={(value) => updateDraft("title", value)} />
            <ProfileField label="Phone number" icon={<Phone weight="light" />} value={draft.phone} placeholder="+84 000 000 000" disabled={!editing} onChange={(value) => updateDraft("phone", value)} />
            <div className="md:col-span-2">
              <ProfileField label="Location" icon={<MapPin weight="light" />} value={draft.location} disabled={!editing} onChange={(value) => updateDraft("location", value)} />
            </div>
          </div>
        </section>

        <div className="grid min-h-0 min-w-0 grid-rows-[auto_1fr] gap-2.5">
          <section className="min-w-0 rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_45px_rgba(15,15,15,0.07)]">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-950 text-white">
                <Globe weight="light" className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-semibold">Language & region</h3>
                <p className="text-xs text-neutral-500">Defaults for captions, dates, and notifications.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-neutral-600">
                  <Translate weight="light" className="h-3.5 w-3.5" />
                  Preferred language
                </Label>
                <Select value={draft.preferredLanguage} onValueChange={(value) => updateDraft("preferredLanguage", String(value))} disabled={!editing}>
                  <SelectTrigger className="h-10 w-full rounded-xl bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vi-VN">Vietnamese</SelectItem>
                    <SelectItem value="en-US">English</SelectItem>
                    <SelectItem value="ja-JP">Japanese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-neutral-600">Timezone</Label>
                <Select value={draft.timezone} onValueChange={(value) => updateDraft("timezone", String(value))} disabled={!editing}>
                  <SelectTrigger className="h-10 w-full rounded-xl bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Ho_Chi_Minh">Vietnam (UTC+7)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Japan (UTC+9)</SelectItem>
                    <SelectItem value="Asia/Singapore">Singapore (UTC+8)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Los Angeles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="min-h-0 min-w-0 rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_16px_45px_rgba(15,15,15,0.07)]">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-950 text-white">
                <Bell weight="light" className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-semibold">Notifications</h3>
                <p className="text-xs text-neutral-500">Choose the profile updates that require attention.</p>
              </div>
            </div>
            <PreferenceRow
              icon={<ShieldCheck weight="light" />}
              label="Meeting activity"
              description="Invites, starts, and participant requests."
              checked={draft.meetingAlerts}
              disabled={!editing}
              onCheckedChange={(checked) => updateDraft("meetingAlerts", checked)}
            />
            <PreferenceRow
              icon={<Briefcase weight="light" />}
              label="Artifacts ready"
              description="Transcript and AI summary notifications."
              checked={draft.artifactAlerts}
              disabled={!editing}
              onCheckedChange={(checked) => updateDraft("artifactAlerts", checked)}
            />
          </section>
        </div>
      </div>

      <Dialog open={cameraOpen} onOpenChange={(open) => (open ? setCameraOpen(true) : closeCamera())}>
        <DialogContent className="w-[min(94vw,920px)] max-w-none rounded-[28px] p-6 sm:max-w-[920px]">
          <DialogHeader>
            <DialogTitle className="text-xl">Take profile photo</DialogTitle>
            <DialogDescription>Use your laptop camera, then crop the captured photo before saving.</DialogDescription>
          </DialogHeader>
          <div className="relative overflow-hidden rounded-[22px] bg-neutral-950">
            {cameraError ? (
              <div className="grid aspect-video place-items-center p-8 text-center text-sm text-red-300">
                <div className="space-y-3">
                  <p>{cameraError}</p>
                  <Button type="button" variant="secondary" className="rounded-full" onClick={() => void startCamera()}>
                    <ArrowCounterClockwise weight="light" />
                    Try again
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  muted
                  playsInline
                  onLoadedMetadata={() => {
                    const video = cameraVideoRef.current;
                    if (video) void video.play();
                  }}
                  onCanPlay={() => setCameraReady(true)}
                  className="aspect-video max-h-[68vh] w-full scale-x-[-1] object-cover"
                />
                {cameraLoading || !cameraReady ? (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center bg-neutral-950/70 text-sm text-white">
                    Starting camera...
                  </div>
                ) : null}
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeCamera}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full bg-neutral-950 text-white hover:bg-neutral-800"
              onClick={captureAvatar}
              disabled={Boolean(cameraError) || !cameraReady}
            >
              <Camera weight="light" />
              Capture photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-[460px] rounded-[24px] p-5">
          <DialogHeader>
            <DialogTitle>Crop profile photo</DialogTitle>
            <DialogDescription>Drag the image to position it, then zoom until the portrait fits the frame.</DialogDescription>
          </DialogHeader>

          <div className="grid justify-items-center gap-4 py-2">
            <div
              className="relative size-[280px] touch-none cursor-grab overflow-hidden rounded-full bg-neutral-100 active:cursor-grabbing"
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerEnd}
              onPointerCancel={handleCropPointerEnd}
            >
              {cropSource ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={cropImageRef}
                  src={cropSource}
                  alt="Profile crop preview"
                  draggable={false}
                  onLoad={(event) => {
                    setImageSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                  }}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: cropMetrics.displayWidth,
                    height: cropMetrics.displayHeight,
                    transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px))`,
                  }}
                />
              ) : null}
              <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/15" />
              <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_999px_rgba(0,0,0,0.04)]" />
            </div>

            <div className="flex w-full items-center gap-3">
              <MagnifyingGlassPlus weight="light" className="h-4 w-4 shrink-0 text-neutral-500" />
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={cropZoom}
                onChange={(event) => handleZoomChange(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-neutral-950"
                aria-label="Avatar zoom"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 rounded-full"
                onClick={() => {
                  setCropZoom(1);
                  setCropOffset({ x: 0, y: 0 });
                }}
                aria-label="Reset crop"
                title="Reset crop"
              >
                <ArrowCounterClockwise weight="light" />
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setCropOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full bg-neutral-950 text-white hover:bg-neutral-800"
              onClick={applyAvatarCrop}
              disabled={!imageSize.width}
            >
              <Check weight="light" />
              Use photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCropMetrics(imageSize: { width: number; height: number }, zoom: number) {
  if (!imageSize.width || !imageSize.height) {
    return {
      displayWidth: AVATAR_VIEWPORT_SIZE,
      displayHeight: AVATAR_VIEWPORT_SIZE,
      maxOffsetX: 0,
      maxOffsetY: 0,
    };
  }

  const coverScale = Math.max(
    AVATAR_VIEWPORT_SIZE / imageSize.width,
    AVATAR_VIEWPORT_SIZE / imageSize.height
  );
  const displayWidth = imageSize.width * coverScale * zoom;
  const displayHeight = imageSize.height * coverScale * zoom;

  return {
    displayWidth,
    displayHeight,
    maxOffsetX: Math.max(0, (displayWidth - AVATAR_VIEWPORT_SIZE) / 2),
    maxOffsetY: Math.max(0, (displayHeight - AVATAR_VIEWPORT_SIZE) / 2),
  };
}

function ProfileField({
  label,
  icon,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-neutral-600">
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        {label}
      </Label>
      <Input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl bg-white disabled:cursor-default disabled:bg-neutral-50 disabled:opacity-100"
      />
    </div>
  );
}

function PreferenceRow({
  icon,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-neutral-100 py-3 first:border-t-0">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-700 [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-neutral-500">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
