import { api } from "../../generated";
import { queryString, request } from "../../shared/api/client";
import { installQuery, uploadBundle } from "../../shared/api/install";

export const AppsApi = {
  list: () => request("/api/apps", api.AppsListResponse),
  info: (name: string) =>
    request(`/api/apps/${encodeURIComponent(name)}`, api.AppInfoResponse),
  action: (app: string, action: api.AppAction, query?: api.AppActionOptions) =>
    request(
      `/api/apps/${encodeURIComponent(app)}/actions/${encodeURIComponent(action)}${queryString(query)}`,
      api.JobResponse,
      { method: "POST" },
    ),
  garbageCollect: (query?: api.AppGarbageCollectionOptions) =>
    request(`/api/apps/actions/gc${queryString(query)}`, api.JobResponse, {
      method: "POST",
    }),
};

export function installAppBundleFromUrl(
  jobId: string,
  url: string,
  options: api.AppInstallOptions,
) {
  const body: api.InstallFromUrlRequest = { url };
  return request(
    `/api/apps/install/${encodeURIComponent(jobId)}/url${installQuery(options)}`,
    api.JobResponse,
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
