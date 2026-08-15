import type { api, events } from "../../generated";
import { ApiRequestError, request } from "../../shared/api/client";

export const ShellApi = {
  daemonInfo: () =>
    request<api.DaemonInfoResponse>("/api/daemon", { cache: "no-store" }),
};

export function subscribeServerEvents(
  onInvalidate: () => void,
  onConnectionChange: (error?: ApiRequestError) => void,
) {
  const source = new EventSource("/api/events");
  source.addEventListener("invalidate-all", (message) => {
    try {
      const event = JSON.parse((message as MessageEvent).data) as events.ServerEvent;
      if (event.type !== "invalidate-all") {
        throw new Error(`unexpected server event type: ${event.type}`);
      }
      onInvalidate();
    } catch (error) {
      onConnectionChange(
        new ApiRequestError(
          0,
          "invalid-event",
          `server event stream returned an invalid event: ${unknownErrorMessage(error)}`,
        ),
      );
    }
  });
  source.onopen = () => onConnectionChange();
  source.onerror = () => {
    onConnectionChange(
      new ApiRequestError(
        0,
        "event-stream-error",
        "live device refresh was interrupted; polling continues while reconnecting",
      ),
    );
  };
  return source;
}

function unknownErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
