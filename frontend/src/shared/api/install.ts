import type { api, jobs } from "../../generated";
import { ApiRequestError, queryString } from "./client";

export function installQuery(
  options: api.AppInstallOptions,
  systemOptions?: api.SystemInstallOptions,
) {
  return queryString({
    bundleHash: options.bundleHash,
    rootCert: options.rootCert,
    insecureSkipBundleVerification: options.insecureSkipBundleVerification
      ? "true"
      : undefined,
    insecureAllowMissingBlockIndex: options.insecureAllowMissingBlockIndex
      ? "true"
      : undefined,
    skipCompatibilityCheck: options.skipCompatibilityCheck
      ? "true"
      : undefined,
    reboot: systemOptions?.reboot,
    bootGroup: systemOptions?.bootGroup,
    keepOverlay: systemOptions?.keepOverlay ? "true" : undefined,
    disableRangeQueries: systemOptions?.disableRangeQueries ? "true" : undefined,
    httpMaxRetries: options.httpMaxRetries,
    httpRetryInitialBackoff: options.httpRetryInitialBackoff,
    httpRetryMaxBackoff: options.httpRetryMaxBackoff,
  });
}

export function uploadBundle(
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
        const body = JSON.parse(xhr.responseText) as
          | api.JobResponse
          | api.ApiErrorResponse;
        if (xhr.status >= 200 && xhr.status < 300 && "job" in body) {
          resolve(body.job);
        } else if ("error" in body) {
          reject(
            new ApiRequestError(
              xhr.status,
              body.error.code,
              body.error.message,
              body.error.details,
            ),
          );
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
            `upload returned invalid JSON: ${unknownErrorMessage(error)}`,
          ),
        );
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiRequestError(
          0,
          "network-error",
          "upload failed because of a network error",
        ),
      );
    xhr.onabort = () =>
      reject(
        new ApiRequestError(0, "upload-aborted", "upload was aborted"),
      );
    xhr.ontimeout = () =>
      reject(new ApiRequestError(0, "upload-timeout", "upload timed out"));
    xhr.send(form);
  });
}

function unknownErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
