"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Globe,
  HelpCircle,
  LayoutGrid,
  Plus,
  Settings2,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type ScheduleStatus = "upcoming" | "live" | "multiple" | "break" | "ended";

type RoomColumn = {
  id: string;
  name: string;
  shortName: string;
};

type ScheduleMeeting = {
  id: string;
  roomId: string;
  time: string;
  title: string;
  range: string;
  status: ScheduleStatus;
  participants: number;
  host: string;
  languages: string;
  note?: string;
};

type SelectedSlot = {
  time: string;
  room: RoomColumn;
  meetings: ScheduleMeeting[];
};

const availableRooms: RoomColumn[] = [
  { id: "strategy", name: "Strategy Room", shortName: "Strategy" },
  { id: "product", name: "Product Room", shortName: "Product" },
  { id: "compliance", name: "Compliance Room", shortName: "Compliance" },
  { id: "training", name: "Training Room", shortName: "Training" },
  { id: "investor", name: "Investor Room", shortName: "Investor" },
  { id: "support", name: "Support Room", shortName: "Support" },
];

const scheduleItems: ScheduleMeeting[] = [
  {
    id: "engineering-standup",
    roomId: "strategy",
    time: "9:00 AM",
    title: "Engineering Standup",
    range: "9:00 - 9:30 AM",
    status: "upcoming",
    participants: 18,
    host: "Host",
    languages: "EN -> VI, JA",
  },
  {
    id: "daily-product-sync",
    roomId: "product",
    time: "9:00 AM",
    title: "Daily Product Sync",
    range: "9:00 - 9:45 AM",
    status: "upcoming",
    participants: 24,
    host: "Host",
    languages: "EN -> FR, VI",
  },
  {
    id: "policy-update-review",
    roomId: "compliance",
    time: "9:00 AM",
    title: "Policy Update Review",
    range: "9:00 - 9:45 AM",
    status: "upcoming",
    participants: 16,
    host: "Host",
    languages: "EN -> DE, FR",
  },
  {
    id: "new-hire-orientation",
    roomId: "training",
    time: "9:00 AM",
    title: "New Hire Orientation",
    range: "9:00 - 10:00 AM",
    status: "upcoming",
    participants: 32,
    host: "Host",
    languages: "EN -> VI, KO",
  },
  {
    id: "support-team-huddle",
    roomId: "support",
    time: "9:00 AM",
    title: "Support Team Huddle",
    range: "9:00 - 9:30 AM",
    status: "upcoming",
    participants: 12,
    host: "Host",
    languages: "EN -> ES",
  },
  {
    id: "strategy-ops-review",
    roomId: "strategy",
    time: "10:00 AM",
    title: "Strategy Ops Review",
    range: "10:00 - 10:45 AM",
    status: "upcoming",
    participants: 21,
    host: "Host",
    languages: "EN -> DE, JA",
  },
  {
    id: "uiux-review",
    roomId: "product",
    time: "10:00 AM",
    title: "UI/UX Review",
    range: "10:00 - 10:45 AM",
    status: "upcoming",
    participants: 14,
    host: "Host",
    languages: "EN -> VI",
  },
  {
    id: "compliance-checkin",
    roomId: "compliance",
    time: "10:00 AM",
    title: "Compliance Check-in",
    range: "10:00 - 10:45 AM",
    status: "upcoming",
    participants: 19,
    host: "Host",
    languages: "EN -> FR, IT",
  },
  {
    id: "sales-training",
    roomId: "training",
    time: "10:00 AM",
    title: "Sales Training",
    range: "10:00 - 11:00 AM",
    status: "upcoming",
    participants: 27,
    host: "Host",
    languages: "EN -> ES, VI",
  },
  {
    id: "support-escalation",
    roomId: "support",
    time: "10:00 AM",
    title: "Support Escalation Review",
    range: "10:00 - 10:30 AM",
    status: "upcoming",
    participants: 11,
    host: "Host",
    languages: "EN -> KO",
  },
  {
    id: "customer-response",
    roomId: "support",
    time: "10:00 AM",
    title: "Customer Response Sync",
    range: "10:15 - 10:45 AM",
    status: "upcoming",
    participants: 9,
    host: "Host",
    languages: "EN -> ES",
  },
  {
    id: "support-triage",
    roomId: "support",
    time: "10:00 AM",
    title: "Support Triage",
    range: "10:30 - 11:00 AM",
    status: "upcoming",
    participants: 15,
    host: "Host",
    languages: "EN -> VI",
  },
  {
    id: "global-market-update",
    roomId: "strategy",
    time: "11:00 AM",
    title: "Global Market Update",
    range: "11:00 - 11:45 AM",
    status: "upcoming",
    participants: 34,
    host: "Host",
    languages: "EN -> ES, DE, JA",
  },
  {
    id: "backlog-grooming",
    roomId: "product",
    time: "11:00 AM",
    title: "Backlog Grooming",
    range: "11:00 - 12:00 PM",
    status: "upcoming",
    participants: 16,
    host: "Host",
    languages: "EN -> VI",
  },
  {
    id: "risk-review",
    roomId: "compliance",
    time: "11:00 AM",
    title: "Risk Review",
    range: "11:00 - 11:45 AM",
    status: "upcoming",
    participants: 22,
    host: "Host",
    languages: "EN -> FR",
  },
  {
    id: "enablement-session",
    roomId: "training",
    time: "11:00 AM",
    title: "Enablement Session",
    range: "11:00 - 12:00 PM",
    status: "upcoming",
    participants: 31,
    host: "Host",
    languages: "EN -> KO, JP",
  },
  {
    id: "customer-issues",
    roomId: "support",
    time: "11:00 AM",
    title: "Customer Issues Deep Dive",
    range: "11:00 - 12:00 PM",
    status: "upcoming",
    participants: 25,
    host: "Host",
    languages: "EN -> ES, VI",
  },
  {
    id: "lunch-learn",
    roomId: "strategy",
    time: "12:00 PM",
    title: "Lunch & Learn",
    range: "12:00 - 1:00 PM",
    status: "upcoming",
    participants: 40,
    host: "Host",
    languages: "EN -> VI, JA",
  },
  {
    id: "product-lunch-demo",
    roomId: "product",
    time: "12:00 PM",
    title: "Product Lunch Demo",
    range: "12:00 - 12:30 PM",
    status: "break",
    participants: 13,
    host: "Host",
    languages: "EN -> VI",
  },
  {
    id: "partner-review",
    roomId: "product",
    time: "12:00 PM",
    title: "Partner Review",
    range: "12:15 - 12:45 PM",
    status: "break",
    participants: 8,
    host: "Host",
    languages: "EN -> FR",
  },
  {
    id: "roadmap-office-hours",
    roomId: "product",
    time: "12:00 PM",
    title: "Roadmap Office Hours",
    range: "12:30 - 1:00 PM",
    status: "break",
    participants: 10,
    host: "Host",
    languages: "EN -> JA",
  },
  {
    id: "regulatory-update",
    roomId: "compliance",
    time: "12:00 PM",
    title: "Regulatory Update",
    range: "12:00 - 1:00 PM",
    status: "upcoming",
    participants: 18,
    host: "Host",
    languages: "EN -> DE, FR, IT",
  },
  {
    id: "lunch-break",
    roomId: "support",
    time: "12:00 PM",
    title: "Lunch Break",
    range: "12:00 - 1:00 PM",
    status: "break",
    participants: 7,
    host: "Host",
    languages: "EN",
  },
  {
    id: "global-strategy-sync",
    roomId: "strategy",
    time: "2:00 PM",
    title: "Global Strategy Sync",
    range: "2:00 - 3:00 PM",
    status: "upcoming",
    participants: 42,
    host: "Host",
    languages: "EN -> ES, DE, JA",
  },
  {
    id: "product-launch-rehearsal",
    roomId: "product",
    time: "2:00 PM",
    title: "Product Launch Rehearsal",
    range: "2:00 - 4:00 PM",
    status: "upcoming",
    participants: 18,
    host: "Host",
    languages: "EN -> FR, VI",
  },
  {
    id: "medical-compliance-review",
    roomId: "compliance",
    time: "2:00 PM",
    title: "Medical Compliance Review",
    range: "2:00 - 3:00 PM",
    status: "upcoming",
    participants: 27,
    host: "Host",
    languages: "EN -> KO, JP",
  },
  {
    id: "role-play-workshop",
    roomId: "training",
    time: "2:00 PM",
    title: "Role Play Workshop",
    range: "2:00 - 3:30 PM",
    status: "upcoming",
    participants: 36,
    host: "Host",
    languages: "EN -> ES, VI",
  },
  {
    id: "investor-qa",
    roomId: "investor",
    time: "2:00 PM",
    title: "Investor Q&A",
    range: "2:00 - 3:15 PM",
    status: "live",
    note: "LIVE",
    participants: 58,
    host: "Host",
    languages: "EN -> ZH, ES",
  },
  {
    id: "support-sla-review",
    roomId: "support",
    time: "2:00 PM",
    title: "SLA Review",
    range: "2:00 - 2:30 PM",
    status: "upcoming",
    participants: 12,
    host: "Host",
    languages: "EN -> VI",
  },
  {
    id: "billing-support",
    roomId: "support",
    time: "2:00 PM",
    title: "Billing Support Sync",
    range: "2:30 - 3:00 PM",
    status: "upcoming",
    participants: 11,
    host: "Host",
    languages: "EN -> ES",
  },
  {
    id: "market-analysis-review",
    roomId: "strategy",
    time: "4:00 PM",
    title: "Market Analysis Review",
    range: "4:00 - 5:00 PM",
    status: "upcoming",
    participants: 33,
    host: "Host",
    languages: "EN -> DE, FR",
  },
  {
    id: "roadmap-planning",
    roomId: "product",
    time: "4:00 PM",
    title: "Roadmap Planning",
    range: "4:00 - 5:00 PM",
    status: "upcoming",
    participants: 29,
    host: "Host",
    languages: "EN -> VI, JA",
  },
  {
    id: "audit-prep",
    roomId: "compliance",
    time: "4:00 PM",
    title: "Audit Prep",
    range: "4:00 - 5:00 PM",
    status: "upcoming",
    participants: 20,
    host: "Host",
    languages: "EN -> FR",
  },
  {
    id: "product-demo-training",
    roomId: "training",
    time: "4:00 PM",
    title: "Product Demo Training",
    range: "4:00 - 5:00 PM",
    status: "upcoming",
    participants: 26,
    host: "Host",
    languages: "EN -> ES",
  },
  {
    id: "follow-up-sessions",
    roomId: "investor",
    time: "4:00 PM",
    title: "Follow-up Sessions",
    range: "4:00 - 5:00 PM",
    status: "upcoming",
    participants: 22,
    host: "Host",
    languages: "EN -> ZH, ES",
  },
  {
    id: "support-wrap-up",
    roomId: "support",
    time: "4:00 PM",
    title: "Support Wrap-up",
    range: "4:00 - 4:20 PM",
    status: "upcoming",
    participants: 15,
    host: "Host",
    languages: "EN -> VI",
  },
  {
    id: "incident-retro",
    roomId: "support",
    time: "4:00 PM",
    title: "Incident Retro",
    range: "4:20 - 4:45 PM",
    status: "upcoming",
    participants: 17,
    host: "Host",
    languages: "EN -> KO",
  },
  {
    id: "handoff-check",
    roomId: "support",
    time: "4:00 PM",
    title: "Handoff Check",
    range: "4:45 - 5:00 PM",
    status: "upcoming",
    participants: 10,
    host: "Host",
    languages: "EN -> ES",
  },
];

const eventStyles: Record<ScheduleStatus, string> = {
  upcoming: "border-[#003476]/10 bg-[#e4eef9]/45 text-slate-900",
  live: "border-[#003476]/25 bg-[#fdfcf6] text-slate-900 shadow-sm ring-1 ring-[#003476]/15",
  multiple: "border-[#003476]/15 bg-[#fdfcf6]/80 text-slate-900",
  break: "border-slate-200 bg-slate-50 text-slate-700",
  ended: "border-slate-200 bg-white text-slate-700",
};

const statusLabels: Record<ScheduleStatus, string> = {
  upcoming: "Starting Soon",
  live: "Active",
  multiple: "Multiple",
  break: "Break",
  ended: "Ended",
};

const legendItems = [
  { label: "Live Now", className: "bg-[#003476]" },
  { label: "Upcoming", className: "bg-[#e4eef9] border border-[#003476]/20" },
  { label: "Multiple Meetings", className: "bg-[#fdfcf6] border border-[#003476]/20" },
  { label: "Break / Other", className: "bg-slate-200" },
];

function getItemsForCell(time: string, roomId: string) {
  return scheduleItems.filter((item) => item.time === time && item.roomId === roomId);
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getShortRoomName(name: string) {
  return name.replace(/\s*Room$/i, "").trim() || name;
}

function getTimeValue(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;

  const [, hourText, minuteText, meridiem] = match;
  let hour = Number(hourText);
  const minute = Number(minuteText);

  if (meridiem.toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (meridiem.toUpperCase() === "AM" && hour === 12) hour = 0;

  return hour * 60 + minute;
}

function todayValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function RoomsPage() {
  const [selectedDate, setSelectedDate] = useState("2025-04-19");
  const [selectedRoomIds, setSelectedRoomIds] = useState(() => availableRooms.map((room) => room.id));
  const [roomNames, setRoomNames] = useState(() =>
    Object.fromEntries(availableRooms.map((room) => [room.id, room.name])),
  );
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);

  const rooms = useMemo(
    () =>
      availableRooms.map((room) => {
        const name = roomNames[room.id] || room.name;

        return {
          ...room,
          name,
          shortName: getShortRoomName(name),
        };
      }),
    [roomNames],
  );

  const visibleRooms = useMemo(
    () => rooms.filter((room) => selectedRoomIds.includes(room.id)),
    [rooms, selectedRoomIds],
  );

  const visibleTimeSlots = useMemo(
    () =>
      Array.from(
        new Set(scheduleItems.filter((item) => selectedRoomIds.includes(item.roomId)).map((item) => item.time)),
      ).sort((first, second) => getTimeValue(first) - getTimeValue(second)),
    [selectedRoomIds],
  );

  const visibleMeetingCount = useMemo(
    () => scheduleItems.filter((item) => selectedRoomIds.includes(item.roomId)).length,
    [selectedRoomIds],
  );

  const liveMeetingCount = useMemo(
    () => scheduleItems.filter((item) => selectedRoomIds.includes(item.roomId) && item.status === "live").length,
    [selectedRoomIds],
  );

  const updateSelectedDate = (value: string) => {
    if (!value) return;
    setSelectedDate(value);
    setSelectedSlot(null);
  };

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((current) => {
      if (current.includes(roomId)) {
        return current.length === 1 ? current : current.filter((id) => id !== roomId);
      }

      return [...current, roomId];
    });
    setSelectedSlot(null);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Meeting Rooms</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
            Overview of your meeting rooms, performance, and upcoming sessions.
          </p>
        </div>
        <Link href="/rooms/create">
          <Button className="h-10 rounded-lg bg-[#003476] px-4 font-medium text-white hover:bg-[#003476]/90">
            <Plus className="mr-2 h-4 w-4" /> Create Meeting Room
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<LayoutGrid className="h-6 w-6" />} label="Total Rooms" value="24" detail="All time" />
        <StatCard icon={<Users className="h-6 w-6" />} label="Active Rooms" value="2" detail="Live now" active />
        <StatCard icon={<Calendar className="h-6 w-6" />} label="Scheduled Rooms" value="6" detail="Upcoming" />
        <StatCard icon={<Clock className="h-6 w-6" />} label="Ended Rooms" value="16" detail="Completed" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                {selectedSlot && (
                  <button
                    type="button"
                    onClick={() => setSelectedSlot(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <h2 className="text-lg font-semibold text-slate-900">
                  {selectedSlot ? `${selectedSlot.room.name} Meetings` : "All Rooms"}
                </h2>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-5 text-xs font-medium text-slate-500">
                <span>
                  {selectedSlot
                    ? `${selectedSlot.meetings.length} meetings at ${selectedSlot.time}`
                    : `${visibleMeetingCount} meetings today`}
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#003476]" />
                  {liveMeetingCount} live now
                </span>
              </div>
            </div>

            <div className="relative flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRoomSettings((current) => !current)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Settings2 className="h-4 w-4 text-slate-500" />
                {formatDateLabel(selectedDate)}
                <span className="text-slate-400">·</span>
                {visibleRooms.length} rooms
              </button>

              {showRoomSettings && (
                <div className="absolute right-0 top-11 z-20 max-h-[520px] w-[360px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                    >
                      Schedule
                    </button>
                    <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500">
                      List
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Date</p>
                      <div className="flex items-center gap-2">
                        <label className="inline-flex h-9 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                          <Calendar className="h-4 w-4 text-slate-500" />
                          <span>{formatDateLabel(selectedDate)}</span>
                          <input
                            type="date"
                            value={selectedDate}
                            onChange={(event) => updateSelectedDate(event.currentTarget.value)}
                            onInput={(event) => updateSelectedDate(event.currentTarget.value)}
                            className="ml-auto h-6 w-[18px] cursor-pointer bg-transparent text-transparent outline-none [color-scheme:light]"
                            aria-label="Select schedule date"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(todayValue());
                            setSelectedSlot(null);
                          }}
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate((current) => shiftDate(current, -1));
                            setSelectedSlot(null);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate((current) => shiftDate(current, 1));
                            setSelectedSlot(null);
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Schedule columns</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRoomIds(rooms.map((room) => room.id));
                            setSelectedSlot(null);
                          }}
                          className="text-xs font-semibold text-[#003476] hover:underline"
                        >
                          Reset
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {rooms.map((room) => {
                          const isSelected = selectedRoomIds.includes(room.id);

                          return (
                            <button
                              key={room.id}
                              type="button"
                              onClick={() => toggleRoom(room.id)}
                              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                                isSelected
                                  ? "border-[#003476] bg-[#003476] text-white"
                                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                              }`}
                            >
                              {room.shortName}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Rename rooms</p>
                      <div className="space-y-2">
                        {rooms.map((room) => (
                          <label
                        key={room.id}
                            className="grid grid-cols-[86px_1fr] items-center gap-2 text-xs font-semibold text-slate-500"
                          >
                            <span>{availableRooms.find((item) => item.id === room.id)?.shortName}</span>
                            <input
                              value={room.name}
                              onChange={(event) => {
                                setRoomNames((current) => ({ ...current, [room.id]: event.target.value }));
                                setSelectedSlot(null);
                              }}
                              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-[#003476]/40"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-4">
            {selectedSlot ? (
              <MeetingListView dateLabel={formatDateLabel(selectedDate)} selectedSlot={selectedSlot} />
            ) : (
              <ScheduleTable rooms={visibleRooms} timeSlots={visibleTimeSlots} onSelectSlot={setSelectedSlot} />
            )}
          </div>
        </section>

        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-5">
            <div className="mb-6 flex items-start justify-between gap-4">
              <h2 className="text-2xl font-bold text-slate-900">Investor Q&A</h2>
              <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                Ended
              </span>
            </div>

            <div className="mb-7 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <DetailItem icon={<Calendar className="h-4 w-4" />} label="Date & Time">
                <p>Yesterday, Apr 19, 2025</p>
                <p className="mt-0.5 text-xs text-slate-500">6:00 PM - 7:15 PM (1h 15m)</p>
              </DetailItem>
              <DetailItem icon={<Users className="h-4 w-4" />} label="Participants">
                <p>58 participants</p>
              </DetailItem>
              <DetailItem icon={<Clock className="h-4 w-4" />} label="Status">
                <p>Ended</p>
              </DetailItem>
              <DetailItem icon={<Globe className="h-4 w-4" />} label="Language Summary">
                <p>EN -&gt; ZH, ES</p>
              </DetailItem>
            </div>

            <div className="mb-6 h-px w-full bg-slate-100" />

            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">AI Summary</h3>
              <Sparkles className="h-4 w-4 fill-[#003476] text-[#003476]" />
            </div>

            <div className="mb-6 space-y-3">
              <SummaryCard icon={<TrendingUp className="h-5 w-5" />} title="Strong Investor Interest" tone="primary">
                Investors showed strong interest in the Q2 roadmap and international expansion strategy, praising the
                product&apos;s market fit and traction.
              </SummaryCard>
              <SummaryCard icon={<HelpCircle className="h-5 w-5" />} title="Key Concerns Raised">
                Questions focused on go-to-market execution in APAC, competitor response, and near-term profitability
                timeline.
              </SummaryCard>
              <SummaryCard icon={<CheckCircle className="h-5 w-5" />} title="Action Items Identified" tone="primary">
                Follow-up materials on APAC strategy and financial projections were requested. Product demo for
                Enterprise tier in next meeting.
              </SummaryCard>
              <SummaryCard icon={<Users className="h-5 w-5" />} title="Overall Sentiment">
                Positive and optimistic sentiment overall. Investors expressed confidence in the team&apos;s execution and
                long-term vision.
              </SummaryCard>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Button className="h-11 w-full rounded-lg bg-[#003476] font-medium text-white shadow-sm hover:bg-[#003476]/90">
                <Sparkles className="mr-2 h-4 w-4" /> Summary
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full rounded-lg border-slate-200 bg-white font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Download className="mr-2 h-4 w-4" /> Download Summary
              </Button>
            </div>

            <div className="text-center">
              <button className="inline-flex items-center text-xs font-semibold text-[#003476] hover:underline">
                View Detailed Summary <ArrowRight className="ml-1 h-3 w-3" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ScheduleTable({
  rooms,
  timeSlots,
  onSelectSlot,
}: {
  rooms: RoomColumn[];
  timeSlots: string[];
  onSelectSlot: (slot: SelectedSlot) => void;
}) {
  const gridTemplateColumns = `70px repeat(${rooms.length}, minmax(108px, 1fr))`;

  return (
    <>
      <div className="overflow-x-auto">
        <div className="overflow-hidden rounded-xl border border-slate-100" style={{ minWidth: 70 + rooms.length * 120 }}>
          <div className="grid bg-white" style={{ gridTemplateColumns }}>
            <div className="border-b border-r border-slate-100 px-3 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Time
            </div>
            {rooms.map((room) => (
              <div key={room.id} className="border-b border-r border-slate-100 px-2 py-3 text-center last:border-r-0">
                <p className="text-xs font-semibold text-slate-900">{room.shortName}</p>
                <p className="text-[11px] font-medium text-slate-500">Room</p>
              </div>
            ))}

            {timeSlots.length > 0 ? (
              timeSlots.map((time) => <ScheduleRow key={time} rooms={rooms} time={time} onSelectSlot={onSelectSlot} />)
            ) : (
              <div
                className="border-b border-slate-100 px-4 py-10 text-center text-sm font-medium text-slate-500"
                style={{ gridColumn: `1 / span ${rooms.length + 1}` }}
              >
                No meetings for the selected rooms.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className={`h-2 w-2 rounded-full ${item.className}`} />
            {item.label}
          </div>
        ))}
      </div>
    </>
  );
}

function ScheduleRow({
  rooms,
  time,
  onSelectSlot,
}: {
  rooms: RoomColumn[];
  time: string;
  onSelectSlot: (slot: SelectedSlot) => void;
}) {
  return (
    <>
      <div className="min-h-[88px] border-b border-r border-slate-100 px-3 py-4 text-sm font-semibold text-slate-900">
        {time}
      </div>
      {rooms.map((room) => {
        const items = getItemsForCell(time, room.id);
        const preview = items[0];
        const isMultiple = items.length > 1;
        const previewStatus: ScheduleStatus = isMultiple ? "multiple" : preview?.status ?? "upcoming";

        return (
          <div key={`${time}-${room.id}`} className="min-h-[88px] border-b border-r border-slate-100 p-2 last:border-r-0">
            {preview ? (
              <button
                type="button"
                onClick={() => onSelectSlot({ time, room, meetings: items })}
                className={`w-full rounded-lg border p-2 text-left transition-colors hover:border-[#003476]/30 hover:shadow-sm ${eventStyles[previewStatus]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-[11px] font-bold leading-snug">
                    {isMultiple ? `${items.length} meetings` : preview.title}
                  </p>
                  {previewStatus === "upcoming" && <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#003476]" />}
                </div>
                <p className="mt-1 text-[11px] font-medium leading-tight text-slate-600">{preview.range}</p>
                {(isMultiple || preview.note) && (
                  <p className={`mt-1 text-[10px] font-bold ${previewStatus === "live" ? "text-[#003476]" : "text-slate-600"}`}>
                    {isMultiple ? `+${items.length - 1} more` : preview.note}
                  </p>
                )}
              </button>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function MeetingListView({ dateLabel, selectedSlot }: { dateLabel: string; selectedSlot: SelectedSlot }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
          <span>{dateLabel}</span>
          <span>{selectedSlot.room.name}</span>
          <span>{selectedSlot.time}</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 border-b border-slate-200 px-4 py-2 text-xs font-medium text-slate-500">
        <div className="col-span-2">Status</div>
        <div className="col-span-3">Room Title</div>
        <div className="col-span-2">Start Time</div>
        <div className="col-span-2">Host</div>
        <div className="col-span-1 text-center">Participants</div>
        <div className="col-span-2">Language Summary</div>
      </div>

      {selectedSlot.meetings.map((meeting) => (
        <div
          key={meeting.id}
          className="grid grid-cols-12 items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:border-slate-300"
        >
          <div className="col-span-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                meeting.status === "live" ? "bg-[#fdfcf6] text-[#003476]" : "bg-slate-100 text-slate-600"
              }`}
            >
              {statusLabels[meeting.status]}
              {meeting.status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-[#003476]" />}
            </span>
          </div>
          <div className="col-span-3">
            <p className="text-sm font-semibold text-slate-900">{meeting.title}</p>
          </div>
          <div className="col-span-2 text-xs text-slate-600">
            <p className={meeting.status === "live" ? "font-medium text-[#003476]" : "font-medium text-slate-900"}>
              {meeting.status === "live" ? "Now" : meeting.time}
            </p>
            <p className="text-slate-500">{meeting.range}</p>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <Avatar className="h-6 w-6 bg-[#003476]">
              <AvatarFallback className="bg-[#003476] text-[10px] text-white">H</AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium text-slate-900">{meeting.host}</span>
          </div>
          <div className="col-span-1 text-center text-xs text-slate-600">{meeting.participants}</div>
          <div className="col-span-2 text-xs font-medium text-slate-600">{meeting.languages}</div>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className={`rounded-lg border border-slate-100 p-2 ${active ? "text-[#003476]" : "text-slate-600"}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <h3 className="mt-1 text-2xl font-bold text-slate-900">{value}</h3>
          <p className="mt-1 flex items-center text-xs font-medium text-slate-500">
            {active && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[#003476]" />}
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-sm font-medium text-slate-900">{children}</div>
    </div>
  );
}

function SummaryCard({
  icon,
  title,
  children,
  tone = "neutral",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  tone?: "primary" | "neutral";
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          tone === "primary" ? "bg-[#fdfcf6] text-[#003476]" : "bg-slate-100 text-slate-600"
        }`}
      >
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{children}</p>
      </div>
    </div>
  );
}
