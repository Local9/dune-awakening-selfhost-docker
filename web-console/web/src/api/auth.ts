import { api, post } from "./client";
import type { AuthState } from "./types";

export const authApi = {
  state: () => api<AuthState>("/api/auth/state"),
  login: (password: string) => post<{ authenticated: boolean; csrfToken: string }>("/api/auth/login", { password }),
  logout: () => post<{ ok: boolean }>("/api/auth/logout")
};
