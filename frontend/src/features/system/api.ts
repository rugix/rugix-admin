import type { api } from "../../generated";
import { queryString, request } from "../../shared/api/client";
import { installQuery, uploadBundle } from "../../shared/api/install";

export const SystemApi = {
  info: () => request<api.SystemInfoResponse>("/api/system/info"),
  action: (action: api.SystemAction, query?: api.SystemActionOptions) =>
    request<api.JobResponse>(
      `/api/system/actions/${encodeURIComponent(action)}${queryString(query)}`,
      { method: "POST" },
    ),
};

export function uploadSystemUpdate(
  jobId: string,
  file: File,
  options: api.SystemInstallOptions,
  onProgress: (sent: number, total: number) => void,
) {
  return uploadBundle(
    `/api/system/update/${encodeURIComponent(jobId)}${installQuery(options, options)}`,
    "image",
    file,
    onProgress,
  );
}

export function installSystemUpdateFromUrl(
  jobId: string,
  url: string,
  options: api.SystemInstallOptions,
) {
  const body: api.InstallFromUrlRequest = { url };
  return request<api.JobResponse>(
    `/api/system/update/${encodeURIComponent(jobId)}/url${installQuery(options, options)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  ).then((response) => response.job);
}
