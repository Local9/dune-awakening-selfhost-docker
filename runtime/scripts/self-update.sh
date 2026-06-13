#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT_DIR="$(pwd)"

# shellcheck source=web-compose.sh
source "$(dirname "$0")/web-compose.sh"

CURRENT_VERSION="dev"
[ -f VERSION ] && CURRENT_VERSION="$(tr -d '[:space:]' < VERSION)"

REDBLINK_REPO="Red-Blink/dune-awakening-selfhost-docker"

detect_release_github_repo() {
  if [ -n "${DUNE_SELF_UPDATE_REPO:-}" ]; then
    printf '%s\n' "$DUNE_SELF_UPDATE_REPO"
    return 0
  fi
  printf '%s\n' "$REDBLINK_REPO"
}

GITHUB_REPO="$(detect_release_github_repo)"
GITHUB_API_BASE="${DUNE_SELF_UPDATE_API_BASE:-https://api.github.com}"
GITHUB_TOKEN="${DUNE_SELF_UPDATE_TOKEN:-}"
LATEST_TAG_CACHE_FILE="runtime/generated/self-update-latest-tag.txt"
UPDATE_MODE_CACHE_FILE="runtime/generated/self-update-mode.txt"
API_LAST_STATUS=""

normalize_github_repo_slug() {
  local remote="${1:-}"
  case "$remote" in
    https://github.com/*)
      remote="${remote#https://github.com/}"
      remote="${remote%.git}"
      ;;
    git@github.com:*)
      remote="${remote#git@github.com:}"
      remote="${remote%.git}"
      ;;
    ssh://git@github.com/*)
      remote="${remote#ssh://git@github.com/}"
      remote="${remote%.git}"
      ;;
    *)
      return 1
      ;;
  esac
  printf '%s\n' "$remote"
}

origin_github_repo() {
  local remote slug
  command -v git >/dev/null 2>&1 || return 1
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  remote="$(git remote get-url origin 2>/dev/null || true)"
  [ -n "$remote" ] || return 1
  slug="$(normalize_github_repo_slug "$remote" 2>/dev/null || true)"
  [ -n "$slug" ] || return 1
  printf '%s\n' "$slug"
}

origin_is_redblink() {
  local slug
  slug="$(origin_github_repo 2>/dev/null || true)"
  [ -n "$slug" ] || return 1
  slug="${slug,,}"
  [ "$slug" = "${REDBLINK_REPO,,}" ]
}

git_repo_with_origin() {
  command -v git >/dev/null 2>&1 || return 1
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  git remote get-url origin >/dev/null 2>&1
}

resolve_update_mode() {
  local mode="${DUNE_SELF_UPDATE_MODE:-auto}"
  mode="$(printf '%s' "$mode" | tr '[:upper:]' '[:lower:]')"
  case "$mode" in
    releases|release)
      printf '%s\n' "releases"
      return 0
      ;;
    git)
      printf '%s\n' "git"
      return 0
      ;;
    auto|"")
      if git_repo_with_origin && ! origin_is_redblink; then
        printf '%s\n' "git"
      else
        printf '%s\n' "releases"
      fi
      return 0
      ;;
    *)
      echo "Unsupported DUNE_SELF_UPDATE_MODE: $mode" >&2
      echo "Supported values: auto, releases, git" >&2
      return 2
      ;;
  esac
}

cache_update_mode() {
  local mode="$1"
  mkdir -p runtime/generated
  printf '%s\n' "$mode" > "$UPDATE_MODE_CACHE_FILE"
}

read_cached_update_mode() {
  [ -s "$UPDATE_MODE_CACHE_FILE" ] || return 1
  tr -d '[:space:]' < "$UPDATE_MODE_CACHE_FILE"
}

resolve_git_remote() {
  local remote="${DUNE_SELF_UPDATE_REMOTE:-origin}"
  remote="$(printf '%s' "$remote" | tr -d '[:space:]')"
  [ -n "$remote" ] || {
    echo "DUNE_SELF_UPDATE_REMOTE is empty."
    return 2
  }
  if ! git remote get-url "$remote" >/dev/null 2>&1; then
    echo "Git remote not found: $remote"
    echo
    echo "Configured remotes:"
    git remote -v 2>/dev/null | sed 's/^/  /' || true
    echo
    echo "Set DUNE_SELF_UPDATE_REMOTE to an existing remote, for example origin or fork."
    return 2
  fi
  printf '%s\n' "$remote"
}

detect_git_branch() {
  local remote="$1"
  local branch="${DUNE_SELF_UPDATE_BRANCH:-}"
  branch="$(printf '%s' "$branch" | tr -d '[:space:]')"
  if [ -n "$branch" ]; then
    printf '%s\n' "$branch"
    return 0
  fi
  branch="$(
    git symbolic-ref --quiet "refs/remotes/${remote}/HEAD" 2>/dev/null \
      | sed "s|^refs/remotes/${remote}/||" || true
  )"
  if [ -n "$branch" ]; then
    printf '%s\n' "$branch"
    return 0
  fi
  printf '%s\n' "main"
}

short_sha() {
  local sha="$1"
  printf '%.7s' "$sha"
}

remote_branch_commit() {
  local remote="$1"
  local branch="$2"
  git fetch --quiet "$remote" "$branch" 2>/dev/null || git fetch --quiet "$remote" 2>/dev/null || return 1
  git rev-parse -q --verify "refs/remotes/${remote}/${branch}^{commit}" 2>/dev/null
}

local_branch_commit() {
  git rev-parse HEAD 2>/dev/null
}

git_remote_url() {
  local remote="$1"
  git remote get-url "$remote" 2>/dev/null || true
}

check_git_pull_update() {
  local remote branch remote_sha local_sha remote_url
  remote="$(resolve_git_remote)" || exit 2
  branch="$(detect_git_branch "$remote")"
  remote_url="$(git_remote_url "$remote")"

  echo "Detected fork origin — skipping GitHub releases."
  echo "Update source: git remote ${remote}/${branch} (${remote_url})"
  echo

  remote_sha="$(remote_branch_commit "$remote" "$branch")" || {
    echo "Could not fetch ${remote}/${branch}."
    echo "Check network access and that the branch exists on the remote."
    exit 2
  }
  local_sha="$(local_branch_commit)" || {
    echo "Could not resolve the current Git commit."
    exit 2
  }

  echo "Current stack version: $(short_sha "$local_sha") (git)"
  echo "Latest release:        $(short_sha "$remote_sha") (git)"
  echo "Git remote:            ${remote}/${branch}"
  echo

  if [ "$local_sha" = "$remote_sha" ]; then
    echo "You are already on the latest stack commit."
    exit 0
  fi

  if git merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null; then
    echo "A newer stack commit is available."
    exit 100
  fi

  if git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
    echo "Local checkout is ahead of ${remote}/${branch}."
    echo "Publish or reset locally if you expected to match the remote."
    exit 0
  fi

  echo "Local checkout has diverged from ${remote}/${branch}."
  echo "Applying the update will reset to the remote branch tip."
  exit 100
}

install_git_pull_update() {
  local remote branch remote_sha local_sha remote_url backup_dir target

  remote="$(resolve_git_remote)" || exit 2
  branch="$(detect_git_branch "$remote")"
  remote_url="$(git_remote_url "$remote")"

  check_dirty_git_tree

  echo "Updating stack Git checkout from:"
  echo "  ${remote_url}"
  echo "Fetching branch: ${branch}"

  remote_sha="$(remote_branch_commit "$remote" "$branch")" || {
    echo "Could not fetch ${remote}/${branch}."
    exit 2
  }
  local_sha="$(local_branch_commit)" || {
    echo "Could not resolve the current Git commit."
    exit 2
  }
  target="refs/remotes/${remote}/${branch}"

  backup_dir="runtime/backups/self-update/$(date +%Y%m%d-%H%M%S)-git"
  echo "Backing up current stack files to:"
  echo "  $backup_dir"
  backup_current_stack "$backup_dir"

  echo "Resetting stack checkout to:"
  echo "  ${remote}/${branch} ($(short_sha "$remote_sha"))"
  git reset --hard "$target"

  echo
  echo "Installed stack commit: $(short_sha "$remote_sha") (git)"
  echo "Previous stack files backup:"
  echo "  $backup_dir/project-files.tgz"
  echo
  echo "Dune Docker Console files were updated."
}

list_git_remotes() {
  local active="${DUNE_SELF_UPDATE_REMOTE:-origin}"
  local remote url
  echo "Active git remote: ${active}"
  echo
  while IFS= read -r remote; do
    [ -n "$remote" ] || continue
    url="$(git_remote_url "$remote")"
    if [ "$remote" = "$active" ]; then
      printf '* %s\t%s\n' "$remote" "$url"
    else
      printf '  %s\t%s\n' "$remote" "$url"
    fi
  done < <(git remote 2>/dev/null)
}

list_git_commit_rows() {
  local remote branch
  remote="$(resolve_git_remote)" || return 1
  branch="$(detect_git_branch "$remote")"
  git fetch --quiet "$remote" "$branch" 2>/dev/null || git fetch --quiet "$remote" 2>/dev/null || return 1
  git log --no-decorate --pretty=format:'%h%x09%cs%x09%s' -n 20 "refs/remotes/${remote}/${branch}" 2>/dev/null
}

detect_host_repo_root() {
  local source

  if [ -n "${DUNE_HOST_REPO_ROOT:-}" ]; then
    printf '%s\n' "$DUNE_HOST_REPO_ROOT"
    return 0
  fi

  if [ -f /.dockerenv ] && command -v docker >/dev/null 2>&1; then
    source="$(
      docker inspect redblink-dune-docker-console \
        --format '{{range .Mounts}}{{if eq .Destination "/repo"}}{{.Source}}{{end}}{{end}}' \
        2>/dev/null || true
    )"
    if [ -n "$source" ] && [ "$source" != "/repo" ]; then
      printf '%s\n' "$source"
      return 0
    fi
  fi

  printf '%s\n' "$ROOT_DIR"
}

HOST_ROOT_DIR="$(detect_host_repo_root)"
export DUNE_HOST_REPO_ROOT="$HOST_ROOT_DIR"

api_curl_common_args() {
  printf '%s\n' \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28"
  if [ -n "$GITHUB_TOKEN" ]; then
    printf '%s\n' -H "Authorization: Bearer $GITHUB_TOKEN"
  fi
}

api_get() {
  local path="$1"
  local tmp_body
  local http_code
  local curl_rc
  local -a curl_args

  API_LAST_STATUS=""
  tmp_body="$(mktemp)"
  mapfile -t curl_args < <(api_curl_common_args)

  set +e
  http_code="$(
    curl -sSL \
      "${curl_args[@]}" \
      -o "$tmp_body" \
      -w '%{http_code}' \
      "${GITHUB_API_BASE}/repos/${GITHUB_REPO}${path}"
  )"
  curl_rc=$?
  set -e

  if [ "$curl_rc" -ne 0 ]; then
    rm -f "$tmp_body"
    return "$curl_rc"
  fi

  API_LAST_STATUS="$http_code"
  if [ "${http_code:-000}" -lt 200 ] || [ "${http_code:-000}" -ge 300 ]; then
    rm -f "$tmp_body"
    return 22
  fi

  cat "$tmp_body"
  rm -f "$tmp_body"
}

print_release_fetch_failure() {
  local action="$1"

  echo "Could not $action from GitHub."
  echo "GitHub repo: $GITHUB_REPO"
  case "${API_LAST_STATUS:-}" in
    401|403)
      echo "GitHub API access was denied or rate-limited."
      if [ -n "$GITHUB_TOKEN" ]; then
        echo "Check whether DUNE_SELF_UPDATE_TOKEN is valid and still has access."
      else
        echo "If GitHub rate limiting is the issue, set DUNE_SELF_UPDATE_TOKEN to increase the API limit."
      fi
      ;;
    404)
      echo "The repository or its published releases could not be found through the GitHub API."
      echo "Check that the detected repo is correct and that releases are published."
      ;;
    "")
      echo "The GitHub API request failed before a response was returned."
      ;;
    *)
      echo "GitHub API returned HTTP ${API_LAST_STATUS}."
      echo "Check that the repo is reachable and that published releases exist."
      ;;
  esac
}

latest_release_json() {
  api_get "/releases/latest"
}

releases_json() {
  api_get "/releases?per_page=20"
}

extract_json_field() {
  local field="$1"
  python3 -c 'import json,sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
value = data.get(sys.argv[1], "")
print(value if value is not None else "")' "$field"
}

latest_release_tag_from_releases_list() {
  local json
  json="$(releases_json 2>/dev/null)" || return 1
  [ -n "$json" ] || return 1
  printf '%s' "$json" | python3 -c 'import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
for release in data:
    if not isinstance(release, dict):
        continue
    if release.get("draft") or release.get("prerelease"):
        continue
    tag = release.get("tag_name") or ""
    if tag:
        print(tag)
        raise SystemExit(0)
raise SystemExit(1)'
}

previous_release_tag_from_releases_list() {
  local json
  json="$(releases_json 2>/dev/null)" || return 1
  [ -n "$json" ] || return 1
  printf '%s' "$json" | python3 -c 'import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
seen = 0
for release in data:
    if not isinstance(release, dict):
        continue
    if release.get("draft") or release.get("prerelease"):
        continue
    tag = release.get("tag_name") or ""
    if not tag:
        continue
    if seen == 0:
        seen = 1
        continue
    print(tag)
    raise SystemExit(0)
raise SystemExit(1)'
}

cache_latest_release_tag() {
  local tag="$1"
  mkdir -p runtime/generated
  printf '%s\n' "$tag" > "$LATEST_TAG_CACHE_FILE"
}

read_cached_latest_release_tag() {
  [ -s "$LATEST_TAG_CACHE_FILE" ] || return 1
  tr -d '[:space:]' < "$LATEST_TAG_CACHE_FILE"
}

latest_release_tag() {
  local json tag

  json="$(latest_release_json 2>/dev/null)" || true
  if [ -n "$json" ]; then
    tag="$(printf '%s' "$json" | extract_json_field tag_name 2>/dev/null || true)"
    if [ -n "$tag" ]; then
      printf '%s' "$tag"
      return 0
    fi
  fi

  latest_release_tag_from_releases_list
}

previous_release_tag() {
  previous_release_tag_from_releases_list
}

list_release_rows() {
  local json
  json="$(releases_json 2>/dev/null)" || return 1
  [ -n "$json" ] || return 1
  printf '%s' "$json" | python3 -c 'import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
for release in data:
    if not isinstance(release, dict):
        continue
    if release.get("draft") or release.get("prerelease"):
        continue
    tag = (release.get("tag_name") or "").strip()
    if not tag:
        continue
    published = (release.get("published_at") or "").strip()
    published = published[:10] if published else "unknown"
    name = (release.get("name") or "").strip().replace("	", " ")
    print(f"{tag}	{published}	{name}")'
}

release_tarball_url() {
  local tag="$1"
  local json
  json="$(api_get "/releases/tags/${tag}" 2>/dev/null)" || return 1
  [ -n "$json" ] || return 1
  printf '%s' "$json" | extract_json_field tarball_url
}

version_newer() {
  local current="$1"
  local latest="$2"
  current="${current#v}"
  latest="${latest#v}"
  [ "$current" = "$latest" ] && return 1
  [ "$(printf '%s\n%s\n' "$current" "$latest" | sort -V | tail -n1)" = "$latest" ]
}

print_versions() {
  local latest="$1"
  echo "Update source: Red-Blink GitHub releases"
  echo "Current stack version: $CURRENT_VERSION"
  echo "Latest release:        $latest"
  echo "GitHub repo:           $GITHUB_REPO"
}

check_release_update() {
  local latest rc
  set +e
  latest="$(latest_release_tag)"
  rc=$?
  set -e

  if [ "$rc" -ne 0 ] || [ -z "${latest:-}" ]; then
    print_release_fetch_failure "check stack releases"
    return 2
  fi

  cache_latest_release_tag "$latest"
  print_versions "$latest"
  echo
  if version_newer "$CURRENT_VERSION" "$latest"; then
    echo "A newer stack version is available."
    return 100
  fi

  echo "You are already on the latest stack version."
  return 0
}

check_dirty_git_tree() {
  local changed_files=""

  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if ! git diff --quiet --ignore-submodules -- 2>/dev/null || ! git diff --cached --quiet --ignore-submodules -- 2>/dev/null; then
      changed_files="$(
        {
          git diff --name-only --ignore-submodules -- 2>/dev/null || true
          git diff --cached --name-only --ignore-submodules -- 2>/dev/null || true
        } | sed '/^$/d' | sort -u
      )"

      echo "Local repo has uncommitted tracked changes."
      echo "The stack update will continue and back up the current project files first."
      if [ -n "$changed_files" ]; then
        echo
        echo "Tracked files with local changes:"
        printf '%s\n' "$changed_files" | sed 's/^/  /'
      fi
      echo
    fi
  fi
}

download_release_archive() {
  local tag="$1"
  local out="$2"
  local tarball_url

  tarball_url="$(release_tarball_url "$tag")"
  if [ -z "$tarball_url" ]; then
    echo "Could not find tarball URL for release tag: $tag"
    exit 2
  fi

  if [ -n "$GITHUB_TOKEN" ]; then
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -L "$tarball_url" -o "$out"
  else
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -L "$tarball_url" -o "$out"
  fi
}

backup_current_stack() {
  local backup_dir="$1"
  mkdir -p "$backup_dir"

  tar -czf "$backup_dir/project-files.tgz" \
    --exclude='./.git' \
    --exclude='./.env' \
    --exclude='./runtime/generated' \
    --exclude='./runtime/secrets' \
    --exclude='./runtime/backups' \
    --exclude='./runtime/game' \
    --exclude='./work' \
    .

  {
    echo "from_version=$CURRENT_VERSION"
    echo "repo=$GITHUB_REPO"
  } > "$backup_dir/meta.env"
}

git_worktree_available() {
  command -v git >/dev/null 2>&1 || return 1
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  git remote get-url origin >/dev/null 2>&1 || return 1
}

validate_release_tag_for_git() {
  local tag="$1"
  git check-ref-format "refs/tags/$tag" >/dev/null 2>&1
}

verify_installed_version() {
  local tag="$1"
  local backup_dir="$2"
  local new_version expected_version

  new_version="$CURRENT_VERSION"
  [ -f VERSION ] && new_version="$(tr -d '[:space:]' < VERSION)"
  expected_version="$tag"

  if [ "${new_version#v}" != "${expected_version#v}" ]; then
    echo
    echo "Downloaded release tag $expected_version, but installed VERSION is $new_version."
    echo "This usually means the GitHub release tag points to a commit with the wrong VERSION file."
    echo "Publish a corrected release tag from the intended commit, then try again."
    echo
    echo "Previous stack files backup:"
    echo "  $backup_dir/project-files.tgz"
    return 1
  fi

  echo
  echo "Installed stack version: $new_version"
  echo "Previous stack files backup:"
  echo "  $backup_dir/project-files.tgz"
  echo
  echo "Dune Docker Console files were updated."
}

web_console_service_name() {
  local service
  [ -f docker-compose.web.yml ] || return 1
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi
  service="$(web_compose_config_services | grep -E '^redblink-dune-docker-console$' | head -n1 || true)"
  [ -n "$service" ] || return 1
  printf '%s\n' "$service"
}

rebuild_web_console_now() {
  local service="$1"
  ensure_dune_net
  web_compose_file_args
  DUNE_HOST_REPO_ROOT="$HOST_ROOT_DIR" docker compose "${WEB_COMPOSE_FILE_ARGS[@]}" up -d --build --force-recreate "$service"
}

rebuild_web_console_after_update() {
  local service log_file
  service="$(web_console_service_name 2>/dev/null || true)"
  if [ -z "$service" ]; then
    echo
    echo "Dune Docker Console rebuild was skipped because docker-compose.web.yml or Docker Compose is unavailable."
    echo "Run this manually after the update if you use the web panel:"
    echo "  docker compose $(web_compose_files_hint) up -d --build --force-recreate redblink-dune-docker-console"
    return 0
  fi

  mkdir -p runtime/generated
  log_file="runtime/generated/web-console-rebuild.log"
  echo
  echo "Rebuilding Dune Docker Console container: $service"
  if [ -n "${DUNE_CONTAINER_REPO_ROOT:-}" ] || [ -f /.dockerenv ]; then
    echo "The rebuild will continue in the background because this update is running from the web console."
    echo "Rebuild log: $log_file"
    (
      sleep 2
      cd "$ROOT_DIR"
      rebuild_web_console_now "$service"
    ) >"$log_file" 2>&1 &
  else
    rebuild_web_console_now "$service"
    echo "Dune Docker Console was rebuilt successfully."
  fi
}

install_cli_command_after_update() {
  if [ ! -x runtime/scripts/install-command.sh ]; then
    return 0
  fi

  if [ -f /.dockerenv ]; then
    echo
    echo "The dune CLI command install was skipped because the update is running inside the web console container."
    echo "If the host does not have the dune command yet, run this once from the server folder:"
    echo "  sudo ./runtime/scripts/install-command.sh"
    return 0
  fi

  echo
  echo "Installing dune CLI command..."
  if [ "$(id -u)" -eq 0 ]; then
    runtime/scripts/install-command.sh || true
  elif command -v sudo >/dev/null 2>&1; then
    sudo runtime/scripts/install-command.sh || true
  else
    echo "Could not install the dune command automatically because sudo is not available."
    echo "Run this once as root if you want the CLI command:"
    echo "  runtime/scripts/install-command.sh"
  fi
}

install_release_tag_with_git() {
  local tag="$1"
  local backup_dir target remote

  validate_release_tag_for_git "$tag" || {
    echo "Invalid release tag for Git checkout: $tag"
    exit 2
  }

  remote="$(git remote get-url origin 2>/dev/null || true)"
  echo "Updating stack Git checkout from:"
  echo "  $remote"
  echo "Fetching release tag: $tag"
  git fetch --force --tags origin
  git fetch --force origin "refs/tags/${tag}:refs/tags/${tag}" >/dev/null 2>&1 || true

  target="$(git rev-parse -q --verify "refs/tags/${tag}^{commit}" 2>/dev/null || true)"
  if [ -z "$target" ]; then
    echo "Could not resolve release tag in Git after fetch: $tag"
    exit 2
  fi

  backup_dir="runtime/backups/self-update/$(date +%Y%m%d-%H%M%S)-${tag#v}"
  echo "Backing up current stack files to:"
  echo "  $backup_dir"
  backup_current_stack "$backup_dir"

  echo "Resetting stack checkout to release tag:"
  echo "  $tag ($target)"
  git reset --hard "$target"

  verify_installed_version "$tag" "$backup_dir" || exit 4
}

install_release_tag_from_archive() {
  local tag="$1"
  local tmpdir archive src backup_dir

  tmpdir="$(mktemp -d)"
  archive="$tmpdir/release.tar.gz"

  echo "Downloading stack release: $tag"
  download_release_archive "$tag" "$archive"

  tar -xzf "$archive" -C "$tmpdir"
  src="$(find "$tmpdir" -mindepth 1 -maxdepth 1 -type d | head -n1)"
  if [ -z "$src" ] || [ ! -d "$src" ]; then
    echo "Could not unpack the stack release archive."
    rm -rf "$tmpdir"
    exit 2
  fi

  backup_dir="runtime/backups/self-update/$(date +%Y%m%d-%H%M%S)-${tag#v}"
  echo "Backing up current stack files to:"
  echo "  $backup_dir"
  backup_current_stack "$backup_dir"

  echo "Installing stack release into:"
  echo "  $ROOT_DIR"
  (
    cd "$src"
    tar --exclude='.git' -cf - .
  ) | (
    cd "$ROOT_DIR"
    tar -xf -
  )

  if ! verify_installed_version "$tag" "$backup_dir"; then
    rm -rf "$tmpdir"
    exit 4
  fi

  rm -rf "$tmpdir"
}

install_release_tag() {
  local tag="$1"

  check_dirty_git_tree
  install_release_tag_from_archive "$tag"
}

install_latest_for_mode() {
  local mode="$1"
  cache_update_mode "$mode"
  case "$mode" in
    git)
      install_git_pull_update
      ;;
    releases)
      local tag rc
      set +e
      tag="$(latest_release_tag)"
      rc=$?
      set -e
      if [ "$rc" -ne 0 ] || [ -z "${tag:-}" ]; then
        tag="$(read_cached_latest_release_tag 2>/dev/null || true)"
      fi
      if [ -z "$tag" ]; then
        echo "Could not resolve the latest stack release."
        case "${API_LAST_STATUS:-}" in
          401|403)
            echo "GitHub API access was denied or rate-limited."
            ;;
          404)
            echo "No published release could be resolved from ${GITHUB_REPO}."
            ;;
        esac
        exit 2
      fi
      cache_latest_release_tag "$tag"
      install_release_tag "$tag"
      ;;
    *)
      echo "Unsupported update mode: $mode"
      exit 2
      ;;
  esac
  install_cli_command_after_update
  rebuild_web_console_after_update
}

cmd="${1:-check}"
tag="${2:-}"

case "$cmd" in
  check|status)
    mode="$(resolve_update_mode)" || exit 2
    cache_update_mode "$mode"
    case "$mode" in
      git)
        check_git_pull_update
        ;;
      releases)
        set +e
        check_release_update
        rc=$?
        set -e
        exit "$rc"
        ;;
    esac
    ;;

  list|releases)
    mode="$(read_cached_update_mode 2>/dev/null || true)"
    if [ -z "$mode" ]; then
      mode="$(resolve_update_mode)" || exit 2
    fi
    case "$mode" in
      git)
        if ! list_git_commit_rows; then
          echo "Could not list commits for the configured git remote/branch."
          exit 2
        fi
        ;;
      releases)
        if ! list_release_rows; then
          print_release_fetch_failure "fetch stack releases"
          exit 2
        fi
        ;;
    esac
    ;;

  remotes)
    git_repo_with_origin || {
      echo "This command requires a Git repository with a configured origin remote."
      exit 2
    }
    list_git_remotes
    ;;

  install|apply)
    mode="$(resolve_update_mode)" || exit 2
    cache_update_mode "$mode"

    if [ "$mode" = "git" ]; then
      if [ -n "$tag" ] && [ "$tag" != "latest" ]; then
        echo "Git-based stack updates only support: install latest"
        echo "Use stack backup restore to roll back to a previous snapshot."
        exit 2
      fi
      install_latest_for_mode "git"
      exit 0
    fi

    if [ -z "$tag" ] || [ "$tag" = "latest" ]; then
      install_latest_for_mode "releases"
      exit 0
    fi

    if [ "$tag" = "previous" ]; then
      set +e
      tag="$(previous_release_tag)"
      rc=$?
      set -e
      if [ "$rc" -ne 0 ] || [ -z "$tag" ]; then
        echo "Could not resolve the previous stack release."
        echo "Make sure the GitHub repo has at least two published non-prerelease releases."
        exit 2
      fi
    fi

    cache_update_mode "releases"
    cache_latest_release_tag "$tag"
    install_release_tag "$tag"
    install_cli_command_after_update
    rebuild_web_console_after_update
    ;;

  *)
    echo "Usage:"
    echo "  runtime/scripts/self-update.sh check"
    echo "  runtime/scripts/self-update.sh list"
    echo "  runtime/scripts/self-update.sh remotes"
    echo "  runtime/scripts/self-update.sh install [latest|previous|<tag>]"
    echo
    echo "Update mode is auto-detected from git origin unless DUNE_SELF_UPDATE_MODE is set."
    echo "  Red-Blink origin  -> GitHub releases"
    echo "  Fork origin       -> git pull latest from DUNE_SELF_UPDATE_REMOTE (default origin)"
    exit 2
    ;;
esac
