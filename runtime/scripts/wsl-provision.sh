#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

STAMP_FILE="runtime/generated/wsl-provision.stamp"
NODE_MAJOR="${DUNE_WSL_NODE_MAJOR:-24}"
COMPOSE_PLUGIN_VERSION="${DUNE_WSL_COMPOSE_VERSION:-v2.27.1}"

provision_stamp_valid() {
  local cli=""
  [ -f "$STAMP_FILE" ] || return 1
  command -v node >/dev/null 2>&1 || return 1
  node --version 2>/dev/null | grep -q "^v${NODE_MAJOR}\\." || return 1
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    cli=docker
  elif command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
    cli=podman
  else
    return 1
  fi
  "$cli" compose version >/dev/null 2>&1 || return 1
  return 0
}

if provision_stamp_valid && [ "${DUNE_WSL_REPROVISION:-0}" != "1" ]; then
  echo "WSL environment already provisioned ($(grep -m1 '^provisioned_at=' "$STAMP_FILE" | cut -d= -f2-))."
  exit 0
fi

if [ -f "$STAMP_FILE" ] && [ "${DUNE_WSL_REPROVISION:-0}" != "1" ]; then
  echo "Stale WSL provision stamp detected; re-provisioning." >&2
fi

if [ ! -f /proc/version ] || ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "wsl-provision.sh must run inside WSL2." >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  exec sudo bash "$0" "$@"
fi

echo "=== WSL provisioning for Dune Docker Console ==="

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg python3 python3-minimal dbus-user-session

configure_wsl_dns() {
  bash runtime/scripts/wsl-dns.sh
}

configure_podman_wsl() {
  mkdir -p /etc/containers
  cat > /etc/containers/containers.conf <<'EOF'
[engine]
cgroup_manager = "cgroupfs"

[network]
dns_servers = ["8.8.8.8", "1.1.1.1"]
EOF
}

configure_wsl_dns

configure_wsl_routing() {
  echo "=== Enabling IPv4 forwarding for container networking ===" >&2
  sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
  mkdir -p /etc/sysctl.d
  printf '%s\n' 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-dune-wsl.conf
}

configure_wsl_routing

install_node() {
  if command -v node >/dev/null 2>&1 && node --version | grep -q "^v${NODE_MAJOR}\\."; then
    echo "Node.js already installed: $(node --version)"
    return 0
  fi

  echo "=== Installing Node.js ${NODE_MAJOR}.x ==="
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs

  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js ${NODE_MAJOR}.x installation failed." >&2
    exit 1
  fi
  echo "Node.js installed: $(node --version)"
}

compose_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x86_64" ;;
    aarch64|arm64) echo "aarch64" ;;
    *)
      echo "Unsupported architecture for Docker Compose plugin: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

download_compose_plugin() {
  local dest="$1"
  local arch
  arch="$(compose_arch)"
  echo "Installing Docker Compose plugin binary (${COMPOSE_PLUGIN_VERSION}, ${arch}) -> ${dest}" >&2
  curl -fsSL \
    "https://github.com/docker/compose/releases/download/${COMPOSE_PLUGIN_VERSION}/docker-compose-linux-${arch}" \
    -o "$dest"
  chmod +x "$dest"
}

install_compose_plugin_binary() {
  local plugin_dir="/usr/local/lib/docker/cli-plugins"
  local plugin="$plugin_dir/docker-compose"
  mkdir -p "$plugin_dir"
  if [ ! -x "$plugin" ]; then
    download_compose_plugin "$plugin"
  fi
}

install_compose_plugin_user() {
  local user="$1"
  local home plugin_dir plugin
  if [ -z "$user" ]; then
    return 0
  fi
  home="$(getent passwd "$user" | cut -d: -f6)"
  if [ -z "$home" ] || [ ! -d "$home" ]; then
    return 0
  fi
  plugin_dir="$home/.docker/cli-plugins"
  plugin="$plugin_dir/docker-compose"
  if [ -x "$plugin" ]; then
    return 0
  fi
  mkdir -p "$plugin_dir"
  download_compose_plugin "$plugin"
  chown -R "$user:$(id -gn "$user" 2>/dev/null || echo "$user")" "$home/.docker"
}

ensure_cli_compose() {
  local cli="$1"
  if compose_works "$cli"; then
    return 0
  fi
  install_compose_plugin_binary
  install_compose_plugin_user "${SUDO_USER:-}"
  compose_works "$cli"
}

compose_works() {
  local cli="$1"
  "$cli" compose version >/dev/null 2>&1
}

compose_works_as_user() {
  local cli="$1"
  local user="${2:-${SUDO_USER:-}}"
  if [ -z "$user" ]; then
    compose_works "$cli"
    return
  fi
  sudo -u "$user" -H bash -lc "$cli compose version >/dev/null 2>&1"
}

start_docker_service() {
  systemctl enable --now docker >/dev/null 2>&1 \
    || service docker start >/dev/null 2>&1 \
    || true
}

try_podman() {
  echo "=== Trying Podman ===" >&2
  if ! apt-get install -y podman aardvark-dns netavark >&2; then
    echo "Podman package install failed." >&2
    return 1
  fi

  configure_podman_wsl

  ensure_cli_compose podman || true

  if podman info >/dev/null 2>&1 && compose_works podman; then
    return 0
  fi

  echo "Podman installed but not usable yet (info/compose check failed)." >&2
  return 1
}

try_docker_ce() {
  echo "=== Trying Docker (get.docker.com) ===" >&2

  if command -v docker >/dev/null 2>&1; then
    start_docker_service
    if ! compose_works docker; then
      ensure_cli_compose docker || true
    fi
    if compose_works docker && docker info >/dev/null 2>&1; then
      bash runtime/scripts/wsl-dns.sh >/dev/null 2>&1 || true
      if [ -n "${SUDO_USER:-}" ]; then
        usermod -aG docker "$SUDO_USER" 2>/dev/null || true
      fi
      return 0
    fi
  fi

  # Same installer as install.sh; skip interactive WSL/existing-docker delays.
  curl -fsSL https://get.docker.com \
    | sed -e 's/sleep 20/sleep 0/g' \
    | sh >&2

  start_docker_service
  if [ -n "${SUDO_USER:-}" ]; then
    usermod -aG docker "$SUDO_USER" 2>/dev/null || true
  fi
  if ! compose_works docker; then
    ensure_cli_compose docker || true
  fi

  if compose_works docker && docker info >/dev/null 2>&1; then
    bash runtime/scripts/wsl-dns.sh >/dev/null 2>&1 || true
    if [ -n "${SUDO_USER:-}" ]; then
      usermod -aG docker "$SUDO_USER" 2>/dev/null || true
    fi
    return 0
  fi
  return 1
}

try_docker_io() {
  echo "=== Trying docker.io with Compose plugin fallback ===" >&2
  apt-get install -y docker.io >&2
  start_docker_service
  if [ -n "${SUDO_USER:-}" ]; then
    usermod -aG docker "$SUDO_USER" 2>/dev/null || true
  fi

  if ! compose_works docker; then
    if apt-get install -y docker-compose-plugin 2>/dev/null; then
      :
    elif apt-get install -y docker-compose 2>/dev/null; then
      if command -v docker-compose >/dev/null 2>&1 && [ ! -e /usr/local/lib/docker/cli-plugins/docker-compose ]; then
        install_compose_plugin_binary
      fi
    else
      install_compose_plugin_binary
    fi
  fi

  if compose_works docker && docker info >/dev/null 2>&1; then
    bash runtime/scripts/wsl-dns.sh >/dev/null 2>&1 || true
    return 0
  fi
  return 1
}

install_container_cli() {
  # Docker bridge networking is more reliable than rootless Podman on WSL2.
  if try_docker_ce; then
    printf '%s' "docker"
    return 0
  fi
  if try_docker_io; then
    printf '%s' "docker"
    return 0
  fi
  if try_podman; then
    printf '%s' "podman"
    return 0
  fi
  return 1
}

install_node

CONTAINER_CLI="$(install_container_cli || true)"
if [ -z "$CONTAINER_CLI" ]; then
  echo "Could not install a working podman or docker engine inside WSL." >&2
  echo "Try manually inside WSL:" >&2
  echo "  sudo apt-get update && sudo apt-get install -y podman" >&2
  echo "  # or install Docker Desktop with WSL integration enabled" >&2
  exit 1
fi

if ! ensure_cli_compose "$CONTAINER_CLI"; then
  echo "Could not install a working Compose plugin for ${CONTAINER_CLI}." >&2
  exit 1
fi

if [ "$CONTAINER_CLI" = "docker" ]; then
  bash runtime/scripts/wsl-dns.sh >&2 || true
fi

python3 -c 'import sys' >/dev/null
node --version
"$CONTAINER_CLI" info >/dev/null
"$CONTAINER_CLI" compose version

if [ -n "${SUDO_USER:-}" ]; then
  if ! compose_works_as_user "$CONTAINER_CLI" "$SUDO_USER"; then
    install_compose_plugin_user "$SUDO_USER"
  fi
  if ! compose_works_as_user "$CONTAINER_CLI" "$SUDO_USER"; then
    echo "Compose works as root but not for user ${SUDO_USER}." >&2
    exit 1
  fi
  sudo -u "$SUDO_USER" -H bash -lc "$CONTAINER_CLI info >/dev/null"
  sudo -u "$SUDO_USER" -H bash -lc "$CONTAINER_CLI compose version"
fi

compose_version_line() {
  local cli="$1"
  "$cli" compose version 2>/dev/null \
    | sed 's/\x1b\[[0-9;]*m//g' \
    | head -n1 \
    | tr -d '\r\n'
}

mkdir -p runtime/generated
{
  printf 'provisioned_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'container_cli=%s\n' "$CONTAINER_CLI"
  printf 'node=%s\n' "$(node --version)"
  printf 'python=%s\n' "$(python3 --version 2>&1)"
  printf 'compose=%s\n' "$(compose_version_line "$CONTAINER_CLI")"
  printf 'wsl_dns=%s\n' "8.8.8.8,1.1.1.1"
} > "$STAMP_FILE"

echo "WSL provisioning complete (container CLI: $CONTAINER_CLI)."
echo
echo "If WSL was already running, restart it once so DNS changes apply:"
echo "  wsl --shutdown"
echo "Then re-run: .\\scripts\\qa-console.ps1 up"
