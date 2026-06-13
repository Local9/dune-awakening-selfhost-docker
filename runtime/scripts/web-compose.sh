#!/usr/bin/env bash
# Shared helpers for docker-compose.web.yml (+ optional compose overlays).

ensure_dune_net() {
  docker network create dune-net 2>/dev/null || true
}

web_compose_file_args() {
  WEB_COMPOSE_FILE_ARGS=(-f docker-compose.web.yml)
  if [ -f docker-compose.traefik.yml ]; then
    WEB_COMPOSE_FILE_ARGS+=(-f docker-compose.traefik.yml)
  fi
  if [ -f docker-compose.monitoring.yml ] && [ -n "${GRAFANA_ADMIN_PASSWORD:-}" ]; then
    WEB_COMPOSE_FILE_ARGS+=(-f docker-compose.monitoring.yml)
  fi
}

web_compose() {
  ensure_dune_net
  web_compose_file_args
  docker compose "${WEB_COMPOSE_FILE_ARGS[@]}" "$@"
}

web_compose_config_services() {
  ensure_dune_net
  web_compose_file_args
  docker compose "${WEB_COMPOSE_FILE_ARGS[@]}" config --services 2>/dev/null || true
}

web_compose_up_console() {
  ensure_dune_net
  web_compose_file_args
  DUNE_HOST_REPO_ROOT="${DUNE_HOST_REPO_ROOT:-$(pwd -P)}" docker compose "${WEB_COMPOSE_FILE_ARGS[@]}" up -d --build "$1"
}

web_compose_files_hint() {
  web_compose_file_args
  local hint="" arg
  for arg in "${WEB_COMPOSE_FILE_ARGS[@]}"; do
    hint+="$arg "
  done
  printf '%s' "${hint%" "}"
}
