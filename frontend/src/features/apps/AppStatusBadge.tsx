import type { apps } from "../../generated";
import { Badge } from "../../shared/components/Badge";

export function AppStatusBadge({ status }: { status: apps.AppStatus }) {
  const color =
    status.state === "running"
      ? "bg-success-surface text-success ring-success/30"
      : status.state === "failed" || status.state === "unhealthy"
        ? "bg-danger-surface text-danger ring-danger/30"
        : "bg-elevation-2 text-foreground-muted ring-divider";
  const message = "message" in status ? status.message : undefined;
  return (
    <Badge color={color} className="font-mono">
      <span title={message}>{status.state}</span>
    </Badge>
  );
}
