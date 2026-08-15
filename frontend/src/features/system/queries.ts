import { queryOptions } from "@tanstack/react-query";
import { SystemApi } from "./api";

export const systemInfoQuery = queryOptions({
  queryKey: ["system"],
  queryFn: SystemApi.info,
  refetchInterval: 10_000,
});
