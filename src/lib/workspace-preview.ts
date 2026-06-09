export type WorkspaceMemberRole = "Owner" | "Manager" | "Host" | "Member";
export type WorkspaceMemberStatus = "Active" | "Invited" | "Suspended";

export type WorkspaceMember = {
  id: number;
  name: string;
  email: string;
  role: WorkspaceMemberRole;
  department: string;
  status: WorkspaceMemberStatus;
  lastActive: string;
};

export type WorkspaceRoom = {
  id: string;
  name: string;
  department: string;
  host: string;
  status: "In progress" | "Scheduled" | "Setup needed" | "Completed";
  languages: string;
  startsAt: string;
  participants: string;
  credits: number;
};

export type WorkspaceArtifact = {
  id: string;
  meeting: string;
  department: string;
  date: string;
  duration: string;
  languageRoute: string;
  status: "Draft" | "In review" | "Final";
  access: string[];
  transcript: string;
};

export const workspaceMembers: WorkspaceMember[] = [
  { id: 1, name: "Linh Nguyen", email: "linh@acme.co", role: "Owner", department: "Operations", status: "Active", lastActive: "Now" },
  { id: 2, name: "Mika Tanaka", email: "mika@acme.co", role: "Manager", department: "APAC", status: "Active", lastActive: "12 min ago" },
  { id: 3, name: "Daniel Kim", email: "daniel@acme.co", role: "Host", department: "Customer Success", status: "Active", lastActive: "1 hour ago" },
  { id: 4, name: "Aiko Sato", email: "aiko@acme.co", role: "Member", department: "Product", status: "Invited", lastActive: "Invitation sent" },
  { id: 5, name: "Minh Tran", email: "minh@acme.co", role: "Host", department: "Operations", status: "Active", lastActive: "Yesterday" },
];

export const workspaceRooms: WorkspaceRoom[] = [
  { id: "WARP-241", name: "Investor Q&A Translation", department: "Leadership", host: "Linh Nguyen", status: "In progress", languages: "English → Vietnamese, Japanese", startsAt: "Jun 07, 09:30", participants: "18/24", credits: 186 },
  { id: "SYNC-882", name: "Partner Sync Room", department: "APAC", host: "Mika Tanaka", status: "Scheduled", languages: "Vietnamese → English", startsAt: "Jun 07, 14:00", participants: "7/12", credits: 84 },
  { id: "CUST-104", name: "Customer Onboarding", department: "Customer Success", host: "Daniel Kim", status: "Setup needed", languages: "English → Korean, Vietnamese", startsAt: "Jun 08, 10:00", participants: "9/16", credits: 0 },
  { id: "BORD-778", name: "Board Review Translation", department: "Leadership", host: "Linh Nguyen", status: "Completed", languages: "English → Vietnamese", startsAt: "Jun 06, 16:30", participants: "14/20", credits: 242 },
  { id: "PROD-328", name: "Product Research Debrief", department: "Product", host: "Minh Tran", status: "Completed", languages: "Japanese → English", startsAt: "Jun 05, 13:00", participants: "11/18", credits: 164 },
  { id: "OPS-512", name: "Operations Weekly", department: "Operations", host: "Linh Nguyen", status: "Scheduled", languages: "Vietnamese → English", startsAt: "Jun 09, 08:30", participants: "0/30", credits: 0 },
];

export const workspaceArtifacts: WorkspaceArtifact[] = [
  {
    id: "artifact-241",
    meeting: "Investor Q&A Translation",
    department: "Leadership",
    date: "Jun 07, 2026",
    duration: "58 min",
    languageRoute: "EN → VI, JA",
    status: "In review",
    access: ["Workspace managers", "Meeting participants"],
    transcript: `[09:32] Linh Nguyen (Host)\nWelcome everyone. Today we will review the investor rollout plan and the APAC launch timeline.\n\n[09:34] Mika Tanaka\nThe Japanese team needs the approved glossary before the next review session.\n\n[09:36] Linh Nguyen\nWe will attach the product terms and meeting notes after this call.`,
  },
  {
    id: "artifact-778",
    meeting: "Board Review Translation",
    department: "Leadership",
    date: "Jun 06, 2026",
    duration: "76 min",
    languageRoute: "EN → VI",
    status: "Final",
    access: ["Workspace managers", "Leadership"],
    transcript: `[16:31] Linh Nguyen (Host)\nThe board approved the regional rollout with two follow-up requirements.\n\n[16:48] Daniel Kim\nCustomer Success will own the onboarding checklist and report adoption weekly.`,
  },
  {
    id: "artifact-328",
    meeting: "Product Research Debrief",
    department: "Product",
    date: "Jun 05, 2026",
    duration: "44 min",
    languageRoute: "JA → EN",
    status: "Draft",
    access: ["Workspace managers", "Product"],
    transcript: `[13:04] Aiko Sato\nUsers asked for clearer controls when changing the translated audio language.\n\n[13:22] Minh Tran (Host)\nWe will include the finding in the next design review.`,
  },
];

export const aiCreditUsage = [
  { label: "Jun 01", value: 38 },
  { label: "Jun 02", value: 54 },
  { label: "Jun 03", value: 46 },
  { label: "Jun 04", value: 72 },
  { label: "Jun 05", value: 61 },
  { label: "Jun 06", value: 84 },
  { label: "Jun 07", value: 68 },
];
