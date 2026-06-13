import type { Task } from "./setup";

export type LoginPublicConfig = {
  appName?: string;
  authDisabled?: boolean;
};

export type PublicConfig = LoginPublicConfig & {
  repoRoot?: string;
  adminPasswordEnvManaged?: boolean;
  secureCookies?: boolean;
  allowHostBootstrap?: boolean;
  mockMode?: boolean;
};

export type AuthState = {
  authenticated: boolean;
  csrfToken: string | null;
  config: LoginPublicConfig | PublicConfig;
};

export type SupportedResponse<T = Record<string, unknown>> = {
  supported: boolean;
  reason?: string;
  error?: string;
  details?: unknown;
} & T;

export type CapabilitiesResponse<TRow = Record<string, unknown>> = {
  capabilities: Record<string, boolean | string | undefined>;
  rows: TRow[];
  reason?: string;
};

export type DbRowsResponse<TRow = Record<string, unknown>> = CapabilitiesResponse<TRow>;

export type TaskResponse = {
  task: Task;
};

export type ApiSupportedResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; error?: string; status: number };
