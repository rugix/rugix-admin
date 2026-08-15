import { queryOptions, skipToken } from "@tanstack/react-query";
import { AppsApi } from "./api";

const APP_REFRESH_INTERVAL = 5_000;

export const appsQuery = queryOptions({
  queryKey: ["apps"],
  queryFn: AppsApi.list,
  refetchInterval: APP_REFRESH_INTERVAL,
});

export function appQuery(name: string | undefined) {
  return queryOptions({
    queryKey: ["apps", name ?? ""],
    queryFn: name === undefined ? skipToken : () => AppsApi.info(name),
    refetchInterval: APP_REFRESH_INTERVAL,
  });
}
