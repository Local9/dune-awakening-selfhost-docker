#!/usr/bin/env bash

container_cli_define_shim() {
  export DUNE_CONTAINER_CLI
  local cli_base="${DUNE_CONTAINER_CLI##*/}"
  cli_base="${cli_base%.exe}"
  if [ "$cli_base" != "docker" ]; then
    docker() { "$DUNE_CONTAINER_CLI" "$@"; }
  fi
}

container_cli_ensure() {
  if [ -n "${DUNE_CONTAINER_CLI:-}" ]; then
    if "$DUNE_CONTAINER_CLI" info >/dev/null 2>&1; then
      container_cli_define_shim
      return 0
    fi
    echo "DUNE_CONTAINER_CLI=$DUNE_CONTAINER_CLI is set but not working." >&2
    return 1
  fi

  if command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
    DUNE_CONTAINER_CLI=podman
  elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    DUNE_CONTAINER_CLI=docker
  else
    return 1
  fi

  container_cli_define_shim
  return 0
}

print_container_install_help() {
  echo "Docker or Podman is required but no working container CLI was found." >&2
  echo >&2
  echo "Install one of:" >&2
  echo "  Podman Desktop: https://podman-desktop.io/" >&2
  echo "  Docker Desktop: https://www.docker.com/products/docker-desktop/" >&2
  echo >&2
  echo "Ensure the machine/daemon is running, then verify:" >&2
  echo "  podman info" >&2
  echo "  docker info" >&2
}

require_container_prereqs() {
  if container_cli_ensure; then
    return 0
  fi
  print_container_install_help
  exit 1
}

if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
  set -euo pipefail
  cd "$(dirname "$0")/../.."
  require_container_prereqs
  echo "Container CLI: $DUNE_CONTAINER_CLI"
fi
