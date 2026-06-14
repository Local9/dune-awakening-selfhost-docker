#!/usr/bin/env bash
# Apply WSL DNS fix so containers inherit working resolvers (not 10.255.255.254).
set -euo pipefail

if [ ! -f /proc/version ] || ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "wsl-dns.sh is for WSL2 only." >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  exec sudo bash "$0" "$@"
fi

mkdir -p /etc/wsl
if [ -f /etc/wsl.conf ]; then
  if ! grep -qE '^\s*generateResolvConf\s*=\s*false' /etc/wsl.conf; then
    if grep -q '^\[network\]' /etc/wsl.conf; then
      sed -i '/^\[network\]/a generateResolvConf = false' /etc/wsl.conf
    else
      printf '\n[network]\ngenerateResolvConf = false\n' >> /etc/wsl.conf
    fi
  fi
else
  cat > /etc/wsl.conf <<'EOF'
[boot]
systemd=true

[network]
generateResolvConf = false
EOF
fi

cat > /etc/resolv.conf <<'EOF'
nameserver 8.8.8.8
nameserver 1.1.1.1
EOF
chmod 644 /etc/resolv.conf

if [ -f /etc/systemd/resolved.conf ] || [ -d /etc/systemd ]; then
  mkdir -p /etc/systemd/resolved.conf.d
  cat > /etc/systemd/resolved.conf.d/99-dune-dns.conf <<'EOF'
[Resolve]
DNS=8.8.8.8
FallbackDNS=1.1.1.1
DNSStubListener=no
EOF
  systemctl restart systemd-resolved >/dev/null 2>&1 || true
fi

if command -v docker >/dev/null 2>&1; then
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'EOF'
{
  "dns": ["8.8.8.8", "1.1.1.1"]
}
EOF
  systemctl restart docker >/dev/null 2>&1 \
    || service docker restart >/dev/null 2>&1 \
    || true
  echo "Docker daemon DNS configured (8.8.8.8, 1.1.1.1)."
fi

echo "WSL DNS configured (8.8.8.8, 1.1.1.1)."
echo "Restart WSL from Windows PowerShell: wsl --shutdown"
