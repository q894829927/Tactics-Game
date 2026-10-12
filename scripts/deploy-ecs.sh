#!/usr/bin/env bash
# Independently deploy GitHub Actions-built Tactics-Game/site to ECS.
# NEVER runs npm/build on ECS and NEVER touches Rift/Portal release paths.
set -Eeuo pipefail
umask 022
export GIT_TERMINAL_PROMPT=0
REPO="/opt/tactics-game/repo"
WWW="/var/www/tactics-game"
RELEASES="$WWW/releases"
LIVE="$WWW/current"
GITHUB="https://github.com/q894829927/Tactics-Game.git"
API="https://api.github.com/repos/q894829927/Tactics-Game/actions/workflows/publish-site.yml/runs"
HOST="${TACTICS_HOST:-47.119.122.133}"
log() { printf '[Tactics Deploy] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || die "Must run as root"
for cmd in curl git tar flock python3 cmp timeout; do command -v "$cmd" >/dev/null || die "Missing $cmd"; done
[[ "$HOST" =~ ^[A-Za-z0-9.:-]+$ ]] || die "Invalid TACTICS_HOST"
[[ -d "$REPO/.git" && -d "$RELEASES" ]] || die "Installer has not prepared the repository"
[[ "$(git -C "$REPO" remote get-url origin)" == "$GITHUB" ]] || die "Unexpected GitHub remote URL"
[[ -s /opt/tactics-game/bin/check-publish.py ]] || die "Missing deployed CI approval helper"
exec 9>/run/lock/tactics-game-deploy.lock
flock -n 9 || { log "Deployment already running; skip"; exit 0; }

temp=""; stage=""; old=""; switched=0
cleanup() {
  local result=$?
  trap - EXIT
  if (( result != 0 && switched == 1 )); then
    log "Verification failed, restoring previous Tactics symlink"
    if [[ -n "$old" && -d "$old" ]]; then
      ln -s "$old" "$WWW/.rollback-$$" &&
        mv -Tf "$WWW/.rollback-$$" "$LIVE" ||
        log "CRITICAL: automatic rollback failed, restore $old manually"
    else
      rm -f "$LIVE"
    fi
  fi
  [[ -z "$temp" || ! -d "$temp" ]] || rm -rf "$temp"
  [[ -z "$stage" || ! -d "$stage" ]] || rm -rf "$stage"
  exit "$result"
}
trap cleanup EXIT

# Fetch only after exact main SHA and matching publish CI are approved.
main_line="$(timeout 45 git -C "$REPO" ls-remote origin refs/heads/main)" ||
  die "GitHub main unreachable, leaving current site as is"
main_sha="$(printf '%s\n' "$main_line" | awk '{print $1}')"
[[ "$main_sha" =~ ^[0-9a-f]{40}$ ]] || die "Invalid remote main commit"

site_line="$(timeout 45 git -C "$REPO" ls-remote origin refs/heads/site)" ||
  die "Static site branch not yet published"
site_sha="$(printf '%s\n' "$site_line" | awk '{print $1}')"
[[ "$site_sha" =~ ^[0-9a-f]{40}$ ]] || die "Invalid remote site commit"

if [[ -L "$LIVE" ]]; then
  old="$(readlink -f "$LIVE")"
  [[ -d "$old" ]] || die "Live symlink is broken"
  if [[ -s "$old/.source-sha" &&
        "$(cat "$old/.source-sha")" == "$main_sha" ]]; then
    log "Already serving main $main_sha; nothing to change"
    exit 0
  fi
elif [[ -e "$LIVE" ]]; then
  die "Live path exists and is not a symlink"
fi

temp="$(mktemp -d)"
curl -fSLsS --connect-timeout 10 --max-time 30 --retry 2 --retry-delay 2 \
  -H 'Accept: application/vnd.github+json' \
  "$API?event=push&branch=main&head_sha=$main_sha&per_page=50" \
  -o "$temp/publish.json" || die "GitHub Actions API not reachable"
status="$(python3 /opt/tactics-game/bin/check-publish.py "$main_sha" "$temp/publish.json")" ||
  die "Invalid GitHub Actions response"
if [[ "$status" != approved ]]; then
  log "Skipping main $main_sha ($status)"
  exit 0
fi

timeout 90 git -C "$REPO" fetch --no-tags --depth 1 origin refs/heads/site ||
  die "Static branch fetch failed"
fetched="$(git -C "$REPO" rev-parse FETCH_HEAD)"
[[ "$fetched" == "$site_sha" ]] || die "site branch changed during poll, retry next cycle"

source_sha="$(git -C "$REPO" show "$site_sha:.source-sha" 2>/dev/null | tr -d '\r\n')" ||
  die "Site artifact lacks source commit marker"
[[ "$source_sha" == "$main_sha" ]] ||
  die "Built site source $source_sha != current main $main_sha; waiting for new CI build"
stage="$(mktemp -d "$RELEASES/.stage.XXXXXXXX")"
git -C "$REPO" archive --format=tar "$site_sha" | tar -xf - -C "$stage"
[[ -s "$stage/index.html" && -d "$stage/assets" ]] || die "Missing site assets"
[[ "$(cat "$stage/.source-sha")" == "$main_sha" ]] || die "Staged source marker mismatch"
grep -q '/games/tactics/assets/' "$stage/index.html" ||
  die "Invalid Vite base: expected /games/tactics/assets/"
chmod -R a+rX "$stage"
if command -v getenforce >/dev/null && [[ "$(getenforce)" == Enforcing ]]; then
  command -v restorecon >/dev/null || die "SELinux enforcing but restorecon is missing"
  restorecon -RF "$stage"
fi

release="$RELEASES/$site_sha"
if [[ -e "$release" || -L "$release" ]]; then
  [[ -d "$release" && ! -L "$release" && -s "$release/.source-sha" &&
     "$(cat "$release/.source-sha")" == "$main_sha" ]] ||
    die "Existing release directory conflicts with this site commit"
else
  mv -T "$stage" "$release"
  stage=""
fi
ln -s "$release" "$WWW/.next-$$"
mv -Tf "$WWW/.next-$$" "$LIVE"
switched=1

# The install script adds Nginx routes before first call. HTTP byte-by-byte
# verification also catches incorrect Nginx alias or cached old files.
http_matches() {
  local url="$1" expected="$2" attempt code
  for attempt in 1 2 3 4 5 6; do
    code="$(curl -sS --max-time 8 -H "Host: $HOST" -H 'Cache-Control: no-cache' \
      -o "$temp/body" -w '%{http_code}' "http://127.0.0.1$url")" || code="000"
    if [[ "$code" == 200 ]] && cmp -s "$temp/body" "$expected"; then
      return 0
    fi
    sleep 1
  done
  log "Resource verification failed: $url (HTTP $code)" >&2
  return 1
}
http_contains() {
  local url="$1" marker="$2" code
  code="$(curl -sS --max-time 8 -H "Host: $HOST" \
    -o "$temp/other" -w '%{http_code}' "http://127.0.0.1$url")" || return 1
  [[ "$code" == 200 ]] && grep -q -- "$marker" "$temp/other"
}

http_matches /games/tactics/ "$release/index.html" || die "Tactics HTML failed"
# Vite hashed assets should resolve from the game subdirectory (not Rift).
asset="$(python3 - "$release/index.html" <<'PY'
import re,sys
s=open(sys.argv[1],encoding="utf-8").read()
m=re.search(r'(?:src|href)="(/games/tactics/assets/[^"]+\.js)"',s)
print(m.group(1) if m else "")
PY
)"
[[ -n "$asset" && -f "$release/${asset#/games/tactics/}" ]] ||
  die "Could not locate built game JavaScript"
http_matches "$asset" "$release/${asset#/games/tactics/}" || die "Tactics JS failed"
http_contains / 'id="rift-enter"' || die "Existing Game-Portal homepage broke"
http_contains /games/rift/ '异界共振' || http_contains /games/rift/ 'Rift' ||
  die "Existing Rift page broke"
http_contains /health '"status":"ok"' || die "Existing Rift service health failed"

switched=0
log "SUCCESS: Tactics at /games/tactics/, main=$main_sha, site=$site_sha"
log "No Nginx reload, no changes to Rift or Game-Portal release files."
