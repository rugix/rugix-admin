import { queryOptions } from "@tanstack/react-query";
import { JobsApi } from "./api";

const IDLE_JOB_REFRESH_INTERVAL = 5_000;
const RUNNING_JOB_REFRESH_INTERVAL = 2_000;

export const jobsQueryKey = ["jobs"] as const;

export const jobsQuery = queryOptions({
  queryKey: jobsQueryKey,
  queryFn: JobsApi.list,
  refetchInterval: (query) =>
    query.state.data?.jobs.some(
      (job) => job.status.status === "queued" || job.status.status === "running",
    )
      ? RUNNING_JOB_REFRESH_INTERVAL
      : IDLE_JOB_REFRESH_INTERVAL,
});
