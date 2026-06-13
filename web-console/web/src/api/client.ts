import type { ApiSupportedResult } from "./types";

export type ApiResult<T = unknown> = Promise<T>;

let csrfToken: string | null = null;

export function setCsrfToken(value: string | null) {
  csrfToken = value;
}

export function getCsrfToken() {
  return csrfToken;
}

function parseResponseRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? data as Record<string, unknown> : {};
}

function responseReason(record: Record<string, unknown>, status: number) {
  return String(record.reason || record.error || `Request failed: ${status}`);
}

export async function api<T>(path: string, options: RequestInit = {}): ApiResult<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (csrfToken && !["GET", "HEAD"].includes(options.method || "GET")) headers.set("x-csrf-token", csrfToken);
  const response = await fetch(path, { ...options, headers, credentials: "include" });
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: response.ok ? "The server returned an unexpected response." : text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) };
    }
  }
  const record = parseResponseRecord(data);
  if (response.status === 401 || response.status === 403) {
    const rawError = String(record.error || "");
    if (/authentication required|csrf token/i.test(rawError)) {
      throw new Error("Your console session expired or the console restarted. Refresh the page, then sign in again.");
    }
  }
  if (!response.ok) throw new Error(responseReason(record, response.status));
  return data as T;
}

export function post<T>(path: string, body: unknown = {}) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function patch<T>(path: string, body: unknown = {}) {
  return api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function del<T>(path: string, body?: unknown) {
  const options: RequestInit = { method: "DELETE" };
  if (body !== undefined) options.body = JSON.stringify(body);
  return api<T>(path, options);
}

export async function apiSupported<T>(path: string, options: RequestInit = {}): Promise<ApiSupportedResult<T>> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (csrfToken && !["GET", "HEAD"].includes(options.method || "GET")) headers.set("x-csrf-token", csrfToken);
  const response = await fetch(path, { ...options, headers, credentials: "include" });
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: response.ok ? "The server returned an unexpected response." : text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) };
    }
  }
  const record = parseResponseRecord(data);
  if (response.status === 401 || response.status === 403) {
    const rawError = String(record.error || "");
    if (/authentication required|csrf token/i.test(rawError)) {
      throw new Error("Your console session expired or the console restarted. Refresh the page, then sign in again.");
    }
  }
  if (record.supported === false) {
    return { ok: false, reason: responseReason(record, response.status), error: String(record.error || ""), status: response.status };
  }
  if (!response.ok) {
    return { ok: false, reason: responseReason(record, response.status), error: String(record.error || ""), status: response.status };
  }
  return { ok: true, data: data as T };
}
