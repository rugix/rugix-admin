import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { api, jobs } from "../../generated";
import { errorMessage } from "../../shared/lib/errors";
import { createJobId } from "../../shared/lib/ids";
import { subscribeJob } from "./api";
import { applyEvent, isTerminal, updateBrowserProgress } from "./jobEvents";
import { jobsQueryKey } from "./queries";
import type { JobLog } from "./types";

export function useJobTracking(
  jobsList: jobs.Job[] | undefined,
  onStreamError: (message: string) => void,
) {
  const queryClient = useQueryClient();
  const [logs, setLogs] = useState<Record<string, JobLog>>({});
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const [pendingJobId, setPendingJobId] = useState<string>();
  const jobSources = useRef(new Map<string, EventSource>());
  const lastJobEventSequences = useRef(new Map<string, bigint>());
  const completedJobStreams = useRef(new Set<string>());

  const latestListedJob = useMemo(() => newestJob(jobsList), [jobsList]);
  const latestJobId = pendingJobId ?? latestListedJob?.id;
  const latestLog = latestJobId ? logs[latestJobId] : undefined;
  const latestJob = latestLog?.job ?? latestListedJob;
  const selectedLog = selectedJobId ? logs[selectedJobId] : undefined;
  const selectedJob =
    selectedLog?.job ?? jobsList?.find((job) => job.id === selectedJobId);
  const pendingJobs = (jobsList ?? []).filter(
    (job) => job.status.status === "queued" || job.status.status === "running",
  );

  const watchJob = useCallback(
    (jobId: string) => {
      if (
        jobSources.current.has(jobId) ||
        completedJobStreams.current.has(jobId)
      ) {
        return;
      }
      const source = subscribeJob(
        jobId,
        (event, sequence) => {
          const previousSequence =
            lastJobEventSequences.current.get(jobId) ?? 0n;
          if (sequence <= previousSequence) return;
          lastJobEventSequences.current.set(jobId, sequence);
          setLogs((current) => applyEvent(current, event));
          if (event.type === "job-changed") {
            queryClient.setQueryData<api.JobsListResponse>(
              jobsQueryKey,
              (current) => ({
                jobs: upsertJob(current?.jobs ?? [], event.job),
              }),
            );
          }
          if (event.type === "job-changed" && isTerminal(event.job.status)) {
            completedJobStreams.current.add(jobId);
            source.close();
            jobSources.current.delete(jobId);
          }
        },
        (error) => onStreamError(errorMessage(error)),
      );
      jobSources.current.set(jobId, source);
    },
    [onStreamError, queryClient],
  );

  useEffect(() => {
    if (jobsList === undefined) return;
    setSelectedJobId((current) => {
      if (
        current &&
        (current === pendingJobId ||
          jobsList.some((job) => job.id === current))
      ) {
        return current;
      }
      return latestListedJob?.id;
    });
  }, [jobsList, latestListedJob?.id, pendingJobId]);

  useEffect(() => {
    if (latestListedJob && !latestLog) watchJob(latestListedJob.id);
  }, [latestListedJob, latestLog, watchJob]);

  useEffect(
    () => () => {
      for (const source of jobSources.current.values()) source.close();
      jobSources.current.clear();
    },
    [],
  );

  const openJob = useCallback(
    (jobId: string) => {
      setSelectedJobId(jobId);
      watchJob(jobId);
    },
    [watchJob],
  );

  const trackJob = useCallback(
    (job: jobs.Job) => {
      queryClient.setQueryData<api.JobsListResponse>(
        jobsQueryKey,
        (current) => ({
          jobs: upsertJob(current?.jobs ?? [], job),
        }),
      );
      setLogs((current) => ({
        ...current,
        [job.id]: { ...(current[job.id] ?? { lines: [] }), job },
      }));
      setPendingJobId((current) =>
        current === job.id ? undefined : current,
      );
      watchJob(job.id);
    },
    [queryClient, watchJob],
  );

  const createPendingJob = useCallback(() => {
    const jobId = createJobId();
    setLogs((current) => ({ ...current, [jobId]: { lines: [] } }));
    setPendingJobId(jobId);
    return jobId;
  }, []);

  const discardPendingJob = useCallback((jobId: string) => {
    setPendingJobId((current) => (current === jobId ? undefined : current));
    setLogs((current) => removeLog(current, jobId));
  }, []);

  const updatePendingUpload = useCallback(
    (jobId: string, sent: number, total: number) => {
      setLogs((current) =>
        updateBrowserProgress(current, jobId, sent, total),
      );
    },
    [],
  );

  return {
    createPendingJob,
    discardPendingJob,
    latestJob,
    latestJobId,
    latestLog,
    openJob,
    pendingJobs,
    selectedJob,
    selectedJobId,
    selectedLog,
    trackJob,
    updatePendingUpload,
  };
}

function upsertJob(current: jobs.Job[], job: jobs.Job) {
  return [job, ...current.filter((candidate) => candidate.id !== job.id)];
}

function newestJob(list?: jobs.Job[]) {
  return list?.reduce<jobs.Job | undefined>((newest, candidate) => {
    if (!newest) return candidate;
    return Date.parse(candidate.createdAt) > Date.parse(newest.createdAt)
      ? candidate
      : newest;
  }, undefined);
}

function removeLog(current: Record<string, JobLog>, jobId: string) {
  const next = { ...current };
  delete next[jobId];
  return next;
}
