import { api, events } from "../../generated";
import { ApiRequestError, request } from "../../shared/api/client";

export const ShellApi = {
  adminInfo: () =>
    request("/api/info", api.AdminInfoResponse, { cache: "no-store" }),
  daemonInfo: () =>
    request("/api/daemon", api.DaemonInfoResponse, { cache: "no-store" }),
};

export function subscribeServerEvents(
  onInvalidate: () => void,
  onConnectionChange: (error?: ApiRequestError) => void,
) {
  const source = new EventSource("/api/events");
  source.addEventListener("invalidate-all", (message) => {
    try {
      const event: unknown = JSON.parse((message as MessageEvent).data);
      if (!events.ServerEvent.is(event)) {
        throw new Error(
          `invalid server event: ${events.ServerEvent.check(event)}`,
        );
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
