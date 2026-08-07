import type { api, events, jobs } from "./generated";

export class ApiRequestError extends Error {
  status: number;
  code: string;
  details?: api.CommandFailureDetails;

  constructor(status: number, code: string, message: string, details?: api.CommandFailureDetails) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const { headers, ...requestInit } = init ?? {};
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestInit,
      headers: { Accept: "application/json", ...(headers ?? {}) },
    });
  } catch (error) {
    throw new ApiRequestError(0, "network-error", `request failed: ${errorMessage(error)}`);
  }
  if (!response.ok) {
    let message = response.statusText || `request failed with HTTP ${response.status}`;
    let code = "request-failed";
    let details: api.CommandFailureDetails | undefined;
    try {
      const body = (await response.json()) as api.ApiErrorResponse;
      if (body?.error?.message && body.error.code) {
        message = body.error.message;
        code = body.error.code;
        details = body.error.details;
      }
    } catch (error) {
      console.warn("Failed to decode the API error response; using its HTTP status.", error);
    }
    throw new ApiRequestError(response.status, code, message, details);
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ApiRequestError(
      response.status,
      "invalid-response",
      `server returned invalid JSON: ${errorMessage(error)}`,
    );
  }
}

export const AdminApi = {
  health: () => request<api.HealthResponse>("/api/health"),
  daemonInfo: () =>
    request<api.DaemonInfoResponse>("/api/daemon", {
      cache: "no-store",
    }),
  systemInfo: () => request<api.SystemInfoResponse>("/api/system/info"),
  components: () => request<api.ComponentsCheckResponse>("/api/components"),
  apps: () => request<api.AppsListResponse>("/api/apps"),
  app: (name: string) => request<api.AppInfoResponse>(`/api/apps/${encodeURIComponent(name)}`),
  jobs: () => request<api.JobsListResponse>("/api/jobs"),
  job: (id: string) => request<api.JobResponse>(`/api/jobs/${encodeURIComponent(id)}`),
  systemAction: (action: api.SystemAction, query?: api.SystemActionOptions) =>
    request<api.JobResponse>(`/api/system/actions/${encodeURIComponent(action)}${queryString(query)}`, {
      method: "POST",
    }),
  appAction: (app: string, action: api.AppAction, query?: api.AppActionOptions) =>
    request<api.JobResponse>(
      `/api/apps/${encodeURIComponent(app)}/actions/${encodeURIComponent(action)}${queryString(query)}`,
      { method: "POST" },
    ),
  garbageCollectApps: (query?: api.AppGarbageCollectionOptions) =>
    request<api.JobResponse>(`/api/apps/actions/gc${queryString(query)}`, { method: "POST" }),
};

export function subscribeJob(
  jobId: string,
  onEvent: (event: events.AdminEvent) => void,
  onError: (error: ApiRequestError) => void,
) {
  const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);
  const handleMessage = (message: MessageEvent) => {
    try {
      onEvent(JSON.parse(message.data) as events.AdminEvent);
    } catch (error) {
      source.close();
      onError(
        new ApiRequestError(
          0,
          "invalid-event",
          `job event stream returned invalid JSON: ${errorMessage(error)}`,
        ),
      );
    }
  };
  source.onmessage = handleMessage;
  for (const eventName of [
    "job-changed",
    "job-output",
    "upload-progress",
    "install-progress",
    "compatibility-check-skipped",
    "app-activation-result",
  ]) {
    source.addEventListener(eventName, (message) => handleMessage(message as MessageEvent));
  }
  source.onerror = () => {
    onError(new ApiRequestError(0, "event-stream-error", "live job updates were interrupted; reconnecting"));
  };
  return source;
}

export function uploadSystemUpdate(
  jobId: string,
  file: File,
  options: api.SystemInstallOptions,
  onProgress: (sent: number, total: number) => void,
) {
  return uploadBundle(`/api/system/update/${encodeURIComponent(jobId)}${installQuery(options, options)}`, "image", file, onProgress);
}

export function installSystemUpdateFromUrl(jobId: string, url: string, options: api.SystemInstallOptions) {
  const body: api.InstallFromUrlRequest = { url };
  return request<api.JobResponse>(`/api/system/update/${encodeURIComponent(jobId)}/url${installQuery(options, options)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.job);
}

export function installAppBundleFromUrl(jobId: string, url: string, options: api.AppInstallOptions) {
  const body: api.InstallFromUrlRequest = { url };
  return request<api.JobResponse>(`/api/apps/install/${encodeURIComponent(jobId)}/url${installQuery(options)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.job);
}

export function uploadAppBundle(
  jobId: string,
  file: File,
  options: api.AppInstallOptions,
  onProgress: (sent: number, total: number) => void,
) {
  return uploadBundle(`/api/apps/install/${encodeURIComponent(jobId)}${installQuery(options)}`, "bundle", file, onProgress);
}

function uploadBundle(
  url: string,
  field: string,
  file: File,
  onProgress: (sent: number, total: number) => void,
): Promise<jobs.Job> {
  const form = new FormData();
  form.append(field, file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total);
      }
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as api.JobResponse | api.ApiErrorResponse;
        if (xhr.status >= 200 && xhr.status < 300 && "job" in body) {
          resolve(body.job);
        } else if ("error" in body) {
          reject(new ApiRequestError(xhr.status, body.error.code, body.error.message, body.error.details));
        } else {
          reject(
            new ApiRequestError(
              xhr.status,
              "upload-failed",
              xhr.statusText || `upload failed with HTTP ${xhr.status}`,
            ),
          );
        }
      } catch (error) {
        reject(
          new ApiRequestError(
            xhr.status,
            "invalid-response",
            `upload returned invalid JSON: ${errorMessage(error)}`,
          ),
        );
      }
    };
    xhr.onerror = () => reject(new ApiRequestError(0, "network-error", "upload failed because of a network error"));
    xhr.onabort = () => reject(new ApiRequestError(0, "upload-aborted", "upload was aborted"));
    xhr.ontimeout = () => reject(new ApiRequestError(0, "upload-timeout", "upload timed out"));
    xhr.send(form);
  });
}

function installQuery(
  options: api.AppInstallOptions,
  systemOptions?: api.SystemInstallOptions,
) {
  return queryString({
    bundleHash: options.bundleHash,
    rootCert: options.rootCert,
    insecureSkipBundleVerification: options.insecureSkipBundleVerification ? "true" : undefined,
    insecureAllowMissingBlockIndex: options.insecureAllowMissingBlockIndex ? "true" : undefined,
    skipCompatibilityCheck: options.skipCompatibilityCheck ? "true" : undefined,
    reboot: systemOptions?.reboot,
    bootGroup: systemOptions?.bootGroup,
    keepOverlay: systemOptions?.keepOverlay ? "true" : undefined,
    disableRangeQueries: systemOptions?.disableRangeQueries ? "true" : undefined,
    httpMaxRetries: options.httpMaxRetries,
    httpRetryInitialBackoff: options.httpRetryInitialBackoff,
    httpRetryMaxBackoff: options.httpRetryMaxBackoff,
  });
}

function queryString(query?: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {}) as Array<
    [string, string | number | boolean | undefined]
  >) {
    if (value !== undefined && value !== "" && value !== false) {
      params.set(key, String(value));
    }
  }
  const string = params.toString();
  return string ? `?${string}` : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
