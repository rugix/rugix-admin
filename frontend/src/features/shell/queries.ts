import { queryOptions } from "@tanstack/react-query";
import { ShellApi } from "./api";

export const daemonInfoQuery = queryOptions({
  queryKey: ["daemon"],
  queryFn: ShellApi.daemonInfo,
  refetchInterval: 60_000,
});
