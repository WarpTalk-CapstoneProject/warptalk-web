import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";

export function StatusPanel({ status }: { status: string }) {
  let colorClass = "text-muted-foreground bg-surface-2 border-border/50";
  let icon = <Circle size={12} weight="light" className="text-muted-foreground/40" />;

  if (status === "in_progress" || status === "live") {
    colorClass = "text-emerald-500 bg-emerald-500/10 border-emerald-500/30";
    icon = (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
    );
  } else if (status === "waiting") {
    colorClass = "text-status-waiting bg-status-waiting/10 border-status-waiting/20";
    icon = <div className="w-2 h-2 rounded-full border border-status-waiting bg-status-waiting/20" />;
  } else if (status === "scheduled") {
    colorClass = "text-status-scheduled bg-status-scheduled/10 border-status-scheduled/20";
    icon = <div className="w-2 h-2 rounded-full border border-status-scheduled bg-status-scheduled/20" />;
  } else if (status === "ended") {
    colorClass = "text-status-ended bg-surface-2 border-border/50";
    icon = <CheckCircle size={12} weight="fill" className="text-status-ended" />;
  } else if (["cancelled", "failed", "expired"].includes(status)) {
    colorClass = "text-status-error bg-status-error/10 border-status-error/20";
    icon = <div className="w-2 h-2 rounded-full border border-status-error bg-status-error/20" />;
  }

  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium capitalize ${colorClass}`}>
      {icon}
      <span>{status.replace(/_/g, " ")}</span>
    </div>
  );
}
