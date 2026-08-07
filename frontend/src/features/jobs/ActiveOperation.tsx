import { Activity, Terminal } from "lucide-react";
import type { jobs } from "../../generated";
import { Surface } from "../../shared/components/Surface";
import { ProgressMeter } from "../../shared/components/ProgressMeter";
import { Notice } from "../../shared/components/Notice";
import { formatBytes } from "../../shared/lib/format";
import { JobStatusBadge } from "../../shared/status/JobStatusBadge";
import { buttonClass } from "../../shared/styles";
import { jobProgress, progressLabel } from "./jobEvents";
import { JobFailureNotice } from "./JobFailureNotice";
import type { JobLog } from "./types";

export function ActiveOperation({
  jobId,
  job,
  log,
  onOpen,
}: {
  jobId: string;
  job?: jobs.Job;
  log?: JobLog;
  onOpen: () => void;
}) {
  const progressPercent = jobProgress(log);
  const latestLine = log?.lines.at(-1);

  return (
    <Surface className="p-0">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Activity size={16} className="text-primary" />
            <span className="truncate text-sm font-medium">{job?.title ?? jobId}</span>
            {job && <JobStatusBadge status={job.status} />}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-foreground-muted">{latestLine ?? jobId}</div>
        </div>
        <ProgressMeter label={progressLabel(log)} percent={progressPercent} fallback={log?.uploadedBytes ? `${formatBytes(Number(log.uploadedBytes))} uploaded` : undefined} />
        <button className={buttonClass} onClick={onOpen}>
          <Terminal size={16} /> View Log
        </button>
        {job?.status.status === "failed" && (
          <div className="lg:col-span-3">
            <JobFailureNotice status={job.status} />
          </div>
        )}
        {log?.notices?.map((notice, index) => (
          <div key={`${notice.title}:${index}`} className="lg:col-span-3">
            <Notice title={notice.title} tone={notice.tone}>
              {notice.message}
            </Notice>
          </div>
        ))}
      </div>
    </Surface>
  );
}
