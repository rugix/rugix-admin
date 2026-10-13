import { api } from "../../generated";
import { request } from "../../shared/api/client";

export const ComponentsApi = {
  report: () => request("/api/components", api.ComponentsCheckResponse),
};
