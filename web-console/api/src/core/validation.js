export function validateNumber(value, min, max, label = "number") {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`Expected ${label} ${min}-${max}`);
  }
  return n;
}
