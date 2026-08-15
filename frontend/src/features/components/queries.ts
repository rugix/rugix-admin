import { queryOptions } from "@tanstack/react-query";
import { ComponentsApi } from "./api";

export const componentsQuery = queryOptions({
  queryKey: ["components"],
  queryFn: ComponentsApi.report,
  refetchInterval: 30_000,
});
