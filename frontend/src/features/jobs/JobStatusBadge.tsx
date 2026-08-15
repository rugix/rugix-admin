import type { jobs } from "../../generated";
import { Badge } from "../../shared/components/Badge";

export function JobStatusBadge({ status }: { status: jobs.JobStatus }) {
  const color =
    status.status === "succeeded"
      ? "bg-success-surface text-success ring-success/30"
      : status.status === "failed"
        ? "bg-danger-surface text-danger ring-danger/30"
        : status.status === "running"
          ? "bg-info-surface text-info ring-info/30"
          : "bg-elevation-2 text-foreground-muted ring-divider";
  return (
    <Badge color={color} className="font-mono">
      {status.status}
    </Badge>
  );
}
