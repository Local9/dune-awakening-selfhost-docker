#!/usr/bin/env bash

python_env_shim_dir() {
  local root="${DUNE_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
  printf '%s/runtime/generated/python-shim' "$root"
}

python_env_ensure() {
  if [ -n "${DUNE_PYTHON_ENV_READY:-}" ]; then
    return 0
  fi

  if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys' >/dev/null 2>&1; then
    DUNE_PYTHON_ENV_READY=1
    export DUNE_PYTHON_ENV_READY
    return 0
  fi

  if command -v python >/dev/null 2>&1 && python -c 'import sys' >/dev/null 2>&1; then
    local shim_dir
    shim_dir="$(python_env_shim_dir)"
    mkdir -p "$shim_dir"
    cat > "$shim_dir/python3" <<'EOF'
#!/usr/bin/env bash
exec python "$@"
EOF
    chmod +x "$shim_dir/python3" 2>/dev/null || true
    PATH="$shim_dir:$PATH"
    export PATH
    DUNE_PYTHON_ENV_READY=1
    export DUNE_PYTHON_ENV_READY
    return 0
  fi

  if command -v py >/dev/null 2>&1 && py -3 -c 'import sys' >/dev/null 2>&1; then
    local shim_dir
    shim_dir="$(python_env_shim_dir)"
    mkdir -p "$shim_dir"
    cat > "$shim_dir/python3" <<'EOF'
#!/usr/bin/env bash
exec py -3 "$@"
EOF
    chmod +x "$shim_dir/python3" 2>/dev/null || true
    PATH="$shim_dir:$PATH"
    export PATH
    DUNE_PYTHON_ENV_READY=1
    export DUNE_PYTHON_ENV_READY
    return 0
  fi

  return 1
}

print_python_install_help() {
  echo "Python 3 is required but was not found or is not working."
  echo
  if command -v uname >/dev/null 2>&1 && [ "$(uname -s 2>/dev/null || true)" = "Linux" ] && [ -f /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null; then
    echo "WSL2:"
    echo "  sudo apt update && sudo apt install -y python3"
  elif command -v uname >/dev/null 2>&1 && [ "$(uname -s 2>/dev/null || true)" = "Linux" ]; then
    echo "Linux:"
    echo "  sudo apt update && sudo apt install -y python3"
    echo "  # or: sudo dnf install -y python3"
  else
    echo "Windows:"
    echo "  1. Install Python 3 from https://www.python.org/downloads/"
    echo "     Enable \"Add python.exe to PATH\" during setup."
    echo "  2. Disable the Microsoft Store python aliases:"
    echo "     Settings → Apps → Advanced app settings → App execution aliases"
    echo "     Turn OFF \"python.exe\" and \"python3.exe\"."
    echo "  3. Restart your terminal and re-run the command."
    echo
    echo "  Or install with winget:"
    echo "    winget install Python.Python.3.12"
  fi
  echo
  echo "Verify with:"
  echo "  python3 --version"
  echo "  python --version"
}

require_python_prereqs() {
  if python_env_ensure; then
    return 0
  fi
  print_python_install_help
  exit 1
}

if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
  set -euo pipefail
  cd "$(dirname "$0")/../.."
  require_python_prereqs
fi
