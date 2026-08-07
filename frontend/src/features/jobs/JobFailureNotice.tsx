import type { jobs } from "../../generated";
import { Notice } from "../../shared/components/Notice";

export function JobFailureNotice({ status }: { status?: jobs.JobStatus }) {
  if (status?.status !== "failed") return null;

  return (
    <Notice title="Operation failed" tone="danger">
      {status.message}
      {status.exitCode !== undefined && (
        <span className="ml-1 font-mono">(exit code {String(status.exitCode)})</span>
      )}
    </Notice>
  );
}
