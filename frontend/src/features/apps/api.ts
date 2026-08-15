import type { api } from "../../generated";
import { queryString, request } from "../../shared/api/client";
import { installQuery, uploadBundle } from "../../shared/api/install";

export const AppsApi = {
  list: () => request<api.AppsListResponse>("/api/apps"),
  info: (name: string) =>
    request<api.AppInfoResponse>(`/api/apps/${encodeURIComponent(name)}`),
  action: (
    app: string,
    action: api.AppAction,
    query?: api.AppActionOptions,
  ) =>
    request<api.JobResponse>(
      `/api/apps/${encodeURIComponent(app)}/actions/${encodeURIComponent(action)}${queryString(query)}`,
      { method: "POST" },
    ),
  garbageCollect: (query?: api.AppGarbageCollectionOptions) =>
    request<api.JobResponse>(`/api/apps/actions/gc${queryString(query)}`, {
      method: "POST",
    }),
};

export function installAppBundleFromUrl(
  jobId: string,
  url: string,
  options: api.AppInstallOptions,
) {
  const body: api.InstallFromUrlRequest = { url };
  return request<api.JobResponse>(
    `/api/apps/install/${encodeURIComponent(jobId)}/url${installQuery(options)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  ).then((response) => response.job);
}

export function uploadAppBundle(
  jobId: string,
  file: File,
  options: api.AppInstallOptions,
  onProgress: (sent: number, total: number) => void,
) {
  return uploadBundle(
    `/api/apps/install/${encodeURIComponent(jobId)}${installQuery(options)}`,
    "bundle",
    file,
    onProgress,
  );
}
