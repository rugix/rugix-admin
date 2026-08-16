import { queryOptions } from "@tanstack/react-query";
import { ShellApi } from "./api";

export const adminInfoQuery = queryOptions({
  queryKey: ["admin-info"],
  queryFn: ShellApi.adminInfo,
});

export const daemonInfoQuery = queryOptions({
  queryKey: ["daemon"],
  queryFn: ShellApi.daemonInfo,
  refetchInterval: 60_000,
});
