import type { api, events } from "../../generated";
import { ApiRequestError, request } from "../../shared/api/client";

export const JobsApi = {
  list: () => request<api.JobsListResponse>("/api/jobs"),
};

export function subscribeJob(
  jobId: string,
  onEvent: (event: events.AdminEvent, sequence: bigint) => void,
  onError: (error: ApiRequestError) => void,
) {
  const source = new EventSource(
    `/api/jobs/${encodeURIComponent(jobId)}/events`,
  );
  const handleMessage = (message: MessageEvent) => {
    try {
      const sequence = BigInt(message.lastEventId);
      if (sequence < 1n) throw new Error("event id must be positive");
      onEvent(JSON.parse(message.data) as events.AdminEvent, sequence);
    } catch (error) {
      source.close();
      onError(
        new ApiRequestError(
          0,
          "invalid-event",
          `job event stream returned an invalid event: ${unknownErrorMessage(error)}`,
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
    source.addEventListener(eventName, (message) =>
      handleMessage(message as MessageEvent),
    );
  }
  source.onerror = () => {
    onError(
      new ApiRequestError(
        0,
        "event-stream-error",
        "live job updates were interrupted; reconnecting",
      ),
    );
  };
  return source;
}

function unknownErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
