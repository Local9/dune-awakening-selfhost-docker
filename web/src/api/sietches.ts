import { api, post } from "./client";
import type { Task } from "./setup";

export const sietchesApi = {
  sietches: () => api<{ stdout: string }>("/api/sietches"),
  sietchDimensions: (map = "Survival_1", ids = false) => api<{ stdout: string }>(`/api/sietches/dimensions?map=${encodeURIComponent(map)}${ids ? "&ids=1" : ""}`),
  updateSietches: (body: Record<string, unknown>) => post<{ task: Task }>("/api/sietches/update", body),
  deepdesert: () => api<{ stdout: string }>("/api/deepdesert"),
  updateDeepdesert: (body: { action: string; confirmation: string }) => post<{ task: Task }>("/api/deepdesert/update", body)
};
