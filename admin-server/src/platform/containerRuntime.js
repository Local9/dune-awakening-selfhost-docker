export function containerCommand() {
  const raw = process.env.DUNE_CONTAINER_CLI;
  if (raw && String(raw).trim()) return String(raw).trim();
  return "docker";
}
