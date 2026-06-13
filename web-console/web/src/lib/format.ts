export function formatUiSentence(value: unknown, pending = false) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const clean = text.replace(/(?:\s*\.\s*){2,}$/g, "").replace(/\s+[.!?]$/g, "").trim();
  const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
  if (pending) return capitalized.replace(/[.!?]+$/g, "");
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function formatResultTitle(value: unknown, pending = false) {
  return formatUiSentence(value, pending);
}

export function formatResultMessage(value: unknown) {
  return formatUiSentence(value, false);
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function stripAnsi(text: string) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}
