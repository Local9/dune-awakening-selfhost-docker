# Dune Docker Console

![Dune Awakening Self-Host Docker cover](assets/cover.png)

![Docker](https://img.shields.io/badge/Docker-Ready-brightgreen) ![Linux](https://img.shields.io/badge/Linux-Supported-brightgreen) ![WSL2](https://img.shields.io/badge/WSL2-Supported-brightgreen) ![Self--Hosted](https://img.shields.io/badge/Self--Hosted-Yes-brightgreen) ![Status](https://img.shields.io/badge/Status-Experimental-orange) ![License](https://img.shields.io/badge/License-MIT-brightgreen)

Dune Docker Console is a Docker-based self-hosting package for Dune: Awakening with a built-in browser admin panel. Install it on a fresh server, open the Web UI, finish setup in the wizard, and manage players, maps, backups, updates, live tools, and server operations without living in the terminal.

This project is unofficial. It is not affiliated with, endorsed by, sponsored by, or supported by Funcom.

## Features

- Browser setup wizard for fresh self-hosted servers
- Live status, readiness, service controls, logs, backups, and updates
- Player tools for lookup, profile, inventory, crafting, progression, journey, skills, stats, history, and online activity views
- Player actions for item grants, XP, skill points, water refill, teleport, kick, and vehicle spawn
- Admin Tools with item, vehicle, skill, command history, and broadcast workflows
- Care Packages with configurable kits and automatic grant rules
- Live map marker/list view for online player and server activity
- Map management for dynamic or always-on maps, Sietches, and Deep Desert layouts
- Interactive UserEngine and UserGame editing without manually editing config files
- Memory controls, including per-map memory settings and swap memory tools
- Autoscaler controls for starting, stopping, and reconciling dynamic map servers
- Database browser plus database backup, restore, import, and maintenance tools
- And much more!

## Requirements

You do not need to be a Linux expert. Start with a fresh server and the installer will check the basics for you.

| What you need | Plain Explanation |
|---|---|
| A server | Ubuntu/Linux is the easiest path. Docker Desktop on Windows/WSL2 or a VM can also work. |
| Docker | You can start even if Docker is not ready yet. On supported Linux servers, the installer prepares Docker for you. |
| Funcom token | You will paste this into the browser setup wizard. |
| CPU support | The game server needs AVX/AVX2. Most modern dedicated servers and VPS plans expose this. |
| Disk space | 100 GB or more is recommended. |
| Web access | Open the Web UI on port `8088` from your browser. You can use the public address or the same-network/local address shown by the installer. |

Memory Guide:

RAM decides how many Dune map servers you can keep running comfortably. Start with the basic layout if you are unsure. Add more RAM when you want more maps online at the same time or expect heavier player activity.

| Server Layout | Recommended RAM |
|---|---:|
| Basic server for getting started | 20 GB |
| Main world plus extra story/social maps | 30 GB |
| Main world, extra maps, and Deep Desert | 40 GB |
| Many always-on maps or heavier player activity | 60 GB+ |

Forward these ports for public/internet hosting:

| Port | Protocol | Purpose |
|---|---|---|
| `8088` | TCP | Web admin setup panel |
| `31982` | TCP | Game messaging |
| `7777-7810` | UDP | Game traffic |

Keep database and internal admin ports private.

## Getting Started

Copy and paste this on a fresh Linux server:

```bash
bash -c 'set -euo pipefail; if ! command -v curl >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y ca-certificates curl tar; fi; mkdir -p "$HOME/dune-awakening-selfhost-docker"; cd "$HOME/dune-awakening-selfhost-docker"; latest_url="$(curl -fsSLI -o /dev/null -w "%{url_effective}" https://github.com/Red-Blink/dune-awakening-selfhost-docker/releases/latest)"; version="${latest_url##*/}"; curl -fsSL "https://github.com/Red-Blink/dune-awakening-selfhost-docker/archive/refs/tags/${version}.tar.gz" | tar -xz --strip-components=1; chmod +x install.sh; ./install.sh'
```

The installer downloads the latest release, prepares the server, starts the Web UI, and tells you what address to open in your browser. If you are on the same network as the server, use the same-network address. If you are connecting over the internet, use the public address and allow TCP `8088` in your firewall.

### Windows (WSL2)

`install.sh` is Linux-only. On Windows, use **WSL2 with Ubuntu**. PowerShell bootstraps WSL and runs the same Linux scripts inside it (no Git Bash / host Podman required).

**Prerequisites:** WSL2 enabled, Ubuntu installed (`wsl --install -d Ubuntu` if needed).

**Web UI only:**

```powershell
.\install.ps1
```

Or double-click `install.cmd`. First run provisions WSL (Python 3, Podman or Docker, Node 24) via [`runtime/scripts/wsl-provision.sh`](runtime/scripts/wsl-provision.sh). Open **http://127.0.0.1:8088** in your browser (WSL2 forwards ports to Windows localhost).

**Full game stack QA:**

```powershell
# Set DUNE_QA_FUNCOM_TOKEN in .env (required for up / wait-ready)
.\scripts\qa-console.ps1 up
.\scripts\qa-console.ps1 check
.\scripts\qa-console.ps1 wait-ready   # optional; can take hours on first install
.\scripts\qa-console.ps1 down
.\scripts\qa-console.ps1 down --all
```

Optional environment variables:

```powershell
# WSL distro name (default Ubuntu)
# $env:DUNE_WSL_DISTRO = "Ubuntu"
# Re-run apt/node/container provisioning
# $env:DUNE_WSL_REPROVISION = "1"
```

Do **not** run `node scripts/qa-console.mjs` directly from Windows PowerShell — use the `.ps1` wrappers.

**Manual test checklist (Windows):** fresh Ubuntu WSL → `.\install.ps1` → panel at `:8088` → `.\scripts\qa-console.ps1 check` → `.\scripts\qa-console.ps1 up` with token in `.env`.

### Optional Traefik (HTTPS)

Default installs expose the Web UI on host port `8088`. To route through external Traefik with Let's Encrypt instead:

```bash
cp docker-compose.traefik.example.yml docker-compose.traefik.yml
# Set DOMAIN (and optional TRAEFIK_* vars) in .env — see .env.example
docker compose -f docker-compose.web.yml -f docker-compose.traefik.yml up -d --build
```

Your Traefik stack needs `web` and `websecure` entrypoints and a cert resolver named `letsencrypt` (or set `TRAEFIK_CERTRESOLVER` in `.env`). Uncomment `ports: !reset []` in `docker-compose.traefik.yml` if you do not want direct host `:8088` access.

### Optional Grafana (container monitoring)

For CPU, memory, and network charts of `dune-*` containers, enable the monitoring overlay (Prometheus + cAdvisor + Grafana):

```bash
cp docker-compose.monitoring.example.yml docker-compose.monitoring.yml
# GRAFANA_ADMIN_PASSWORD is required — set it in .env before starting Grafana (see .env.example)
docker compose -f docker-compose.web.yml -f docker-compose.monitoring.yml up -d --build
```

Open Grafana at `http://127.0.0.1:3000` by default. Sign in with **`admin`** (or `GRAFANA_ADMIN_USER`) and the password you set in `GRAFANA_ADMIN_PASSWORD`. Grafana will not start if that variable is missing or empty. The **Dune Docker Containers** dashboard is provisioned automatically. Prometheus and cAdvisor stay on internal Docker networks; only Grafana is published to the host. Keep port `3000` private on production hosts (default bind is `127.0.0.1`).

If `docker-compose.monitoring.yml` exists and `GRAFANA_ADMIN_PASSWORD` is set, `install.sh` and `dune web` helpers include the overlay automatically alongside optional Traefik.

## Contributing & Project Notes

- Issues, fixes, and improvements are welcome.
- This project is community maintained and experimental.
- Funcom self-hosting behavior may change over time.
- Keep secrets, generated runtime files, and backups out of git.
- Do not expose the Web UI to untrusted users.

### Development and local QA

Production installs via `install.sh` on Linux or `install.ps1` on Windows (WSL2 delegation) build the React UI inside Docker automatically. **You do not need a manual `web-console/web/dist` build on the host for production.**

The browser admin panel lives in [`web-console/`](web-console/) (`api/` for the Node backend, `web/` for the React UI). Production builds use [`web-console/Dockerfile`](web-console/Dockerfile). For containerized Vite HMR, [`web-console/web/Dockerfile`](web-console/web/Dockerfile) provides `development` and `builder` targets.

**Contributor workflows (optional host Node.js 24 LTS):**

| Goal | Command |
|------|---------|
| API/unit tests only | `cd web-console/api && pnpm install && pnpm test` |
| Web typecheck/build on host | `cd web-console/web && pnpm install && pnpm run typecheck && pnpm run build` |
| Web HMR on host (API on `:8088`) | `cd web-console/web && pnpm install && pnpm dev` |
| Web HMR in Docker (API in console container) | `docker compose -f docker-compose.web.yml -f docker-compose.dev.yml up --build` then open `http://127.0.0.1:5173` (API still on `:8088`) |

The repo root [`.nvmrc`](.nvmrc) pins Node `24` for `nvm`, `fnm`, or `volta` when using host-native tooling.

**Quick checks without containers (contributors):**

```bash
node --version          # expect v24.x
corepack enable
cd web-console/api && pnpm install && pnpm test
cd ../web && pnpm install && pnpm run typecheck && pnpm run build
```

**Standalone web image build (sanity check):**

```bash
docker build -f web-console/web/Dockerfile --target builder ./web-console/web
```

**End-to-end production QA (full stack + admin panel):**

One command bootstraps missing setup (non-destructively), starts the real Dune stack, builds the production console image, and **only succeeds when the admin panel and core services are live**. Use this to test API methods against real postgres, Docker, and `dune` scripts—not mock mode. On Windows, PowerShell delegates into WSL2 where the same Node/bash scripts run as on Linux.

```powershell
# Windows — delegates into WSL2 (do not run node directly on the host)
# Set DUNE_QA_FUNCOM_TOKEN in .env (required for up / wait-ready)
.\scripts\qa-console.ps1 up
# open http://127.0.0.1:8088
.\scripts\qa-console.ps1 wait-ready
.\scripts\qa-console.ps1 down
.\scripts\qa-console.ps1 down --all
```

```bash
# Linux / WSL2 / macOS
# Set DUNE_QA_FUNCOM_TOKEN in .env or export it (required for up / wait-ready)
./scripts/qa-console.sh up
./scripts/qa-console.sh wait-ready
./scripts/qa-console.sh check
```

| Command | Purpose |
|---|---|
| `up` | Bootstrap, start stack, start production console, verify gates |
| `check` | Runtime, setup files, container and health status (read-only) |
| `wait-ready` | Poll `dune ready` until no FAIL (long timeout on first install) |
| `logs` / `logs --stack` | Console or core stack container logs |
| `down` / `down --all` | Stop console, or console + stack |

`up` and `wait-ready` require `DUNE_QA_FUNCOM_TOKEN` in `.env` or the environment (shell env var wins). If it is unset, the script exits immediately and does not touch Docker or local setup files.

**Windows notes:** Use `.\install.ps1` and `.\scripts\qa-console.ps1` from PowerShell. They bootstrap WSL2 (Ubuntu), provision Linux dependencies once, and run all Node/bash/container work inside WSL. Set `DUNE_WSL_DISTRO` if your Ubuntu distro uses a different name. Do not run `node scripts/*.mjs` directly from the Windows host.

**Linux/macOS notes:** Run `./scripts/qa-console.sh` or `node scripts/qa-console.mjs` directly. Inside an already-provisioned WSL session, you can also use `./scripts/qa-console.sh`.

**Timeouts:** `QA_PANEL_TIMEOUT_MS` (default 120000), `QA_STACK_TIMEOUT_MS` (default 600000), `QA_READY_TIMEOUT_MS` (default 7200000).

## Credits

Dune Docker Console is created and maintained by RedBlink. You are welcome to use, fork, modify, and build on this project. If you share or redistribute it, please credit RedBlink as the original developer.

## License

MIT. See [LICENSE](LICENSE).
