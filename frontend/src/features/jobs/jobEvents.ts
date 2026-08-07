import type { events, jobs } from "../../generated";
import type { JobLog } from "./types";

export function applyEvent(current: Record<string, JobLog>, event: events.AdminEvent): Record<string, JobLog> {
  switch (event.type) {
    case "job-changed":
      return {
        ...current,
        [event.job.id]: { ...(current[event.job.id] ?? { lines: [] }), job: event.job },
      };
    case "job-output": {
      const previous = current[event.jobId] ?? { lines: [] };
      return {
        ...current,
        [event.jobId]: {
          ...previous,
          lines: [...previous.lines, `[${event.stream}] ${event.line}`].slice(-500),
        },
      };
    }
    case "upload-progress": {
      const previous = current[event.jobId] ?? { lines: [] };
      return { ...current, [event.jobId]: { ...previous, uploadedBytes: event.bytes } };
    }
    case "install-progress": {
      const previous = current[event.jobId] ?? { lines: [] };
      return { ...current, [event.jobId]: { ...previous, installProgress: event.progress } };
    }
    case "compatibility-check-skipped": {
      const previous = current[event.jobId] ?? { lines: [] };
      return {
        ...current,
        [event.jobId]: {
          ...previous,
          notices: [
            ...(previous.notices ?? []),
            {
              tone: "warning",
              title: "Compatibility check skipped",
              message: `${event.scope}: ${event.reason}`,
            },
          ],
        },
      };
    }
    case "app-activation-result": {
      const previous = current[event.jobId] ?? { lines: [] };
      return {
        ...current,
        [event.jobId]: {
          ...previous,
          notices: [
            ...(previous.notices ?? []),
            {
              tone: activationTone(event.outcome),
              title: "Application activation",
              message: `${event.app} generation #${String(event.generation)}: ${event.outcome}`,
            },
          ],
        },
      };
    }
  }
}

export function updateBrowserProgress(current: Record<string, JobLog>, jobId: string, sent: number, total: number) {
  const previous = current[jobId] ?? { lines: [] };
  return { ...current, [jobId]: { ...previous, browserUpload: { sent, total } } };
}

export function jobProgress(log?: JobLog) {
  if (log?.installProgress !== undefined) return Math.round(Number(log.installProgress));
  if (!log?.browserUpload) return undefined;
  return Math.round((log.browserUpload.sent / Math.max(log.browserUpload.total, 1)) * 100);
}

export function progressLabel(log?: JobLog) {
  return log?.installProgress === undefined ? "Upload" : "Install";
}

export function isTerminal(status: jobs.JobStatus) {
  return status.status === "succeeded" || status.status === "failed";
}

function activationTone(outcome: events.AppActivationOutcome) {
  switch (outcome) {
    case "activated":
      return "success" as const;
    case "rolled-back":
      return "warning" as const;
    case "failed":
    case "rollback-failed":
      return "danger" as const;
  }
}
