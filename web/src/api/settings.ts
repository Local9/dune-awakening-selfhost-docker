import { api, post } from "./client";

export type SettingsState = {
  config?: Record<string, unknown>;
  files?: Record<string, boolean>;
};

export const settingsApi = {
  get: () => api<SettingsState>("/api/settings"),
  save: (body: Record<string, string>) => post<{ ok: boolean }>("/api/settings", body),
  changeAdminPassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: boolean }>("/api/settings/admin-password", { currentPassword, newPassword })
};
