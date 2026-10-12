#!/usr/bin/env bash
# Resume only the known partially installed ECS state:
# Nginx route already exists, current/ is a real directory, timer is absent.
# Preserve existing site and never change Nginx/Rift/Portal configuration.
set -Eeuo pipefail
umask 022
export GIT_TERMINAL_PROMPT=0

readonly WWW="/var/www/tactics-game"
readonly LIVE="$WWW/current"
readonly RELEASES="$WWW/releases"
readonly CONF="/etc/nginx/conf.d/rift.conf"
readonly SNIPPET="/etc/nginx/snippets/tactics-game-routes.conf"
readonly REPO="/opt/tactics-game/repo"
readonly BIN="/opt/tactics-game/bin"
readonly REMOTE="https://github.com/q894829927/Tactics-Game.git"
readonly HOST="47.119.122.133"
log() { printf '[Tactics Resume] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

[[ "$EUID" -eq 0 ]] || die "Must be run as root on ECS"
for cmd in git curl nginx systemctl python3 install timeout; do
  command -v "$cmd" >/dev/null || die "Missing required command: $cmd"
done
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
[[ -f "$SOURCE/scripts/deploy-ecs.sh" && -f "$SOURCE/scripts/check-publish.py" ]] ||
  die "Script must be run from the Tactics-Game repository"
[[ "$(git -C "$SOURCE" rev-parse --show-toplevel)" == "$SOURCE" ]] ||
  die "Could not verify local repository root"
[[ "$(git -C "$SOURCE" branch --show-current)" == main ]] ||
  die "Switch to Tactics-Game main before recovery"
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] ||
  die "Local Tactics-Game has uncommitted changes"
source_origin="$(git -C "$SOURCE" remote get-url origin)"
[[ "$source_origin" == "$REMOTE" ||
   "$source_origin" == git@github.com:q894829927/Tactics-Game.git ]] ||
  die "Unexpected checkout origin"

# If any condition differs, fail closed instead of rewriting Nginx.
[[ -f "$CONF" && -f "$SNIPPET" ]] || die "Expected installed Nginx configuration"
[[ "$(grep -Fc "include $SNIPPET;" "$CONF")" == 1 ]] ||
  die "Expected exactly one existing Nginx tactics include"
grep -Fq 'location ^~ /games/tactics/' "$SNIPPET" ||
  die "Expected existing /games/tactics/ route"
grep -Fq 'alias /var/www/tactics-game/current/;' "$SNIPPET" ||
  die "Existing tactics alias does not match expected site path"
[[ -d "$LIVE" && ! -L "$LIVE" && -s "$LIVE/index.html" &&
   -d "$LIVE/assets" && -d "$RELEASES" ]] ||
  die "Expected real directory current/ with HTML and assets; no changes made"
[[ -d "$REPO/.git" ]] || die "Existing deployment repository is missing"
[[ "$(git -C "$REPO" remote get-url origin)" == "$REMOTE" ]] ||
  die "Existing deployment checkout points to unexpected GitHub repository"
[[ ! -e /etc/systemd/system/tactics-game-deploy.service &&
   ! -e /etc/systemd/system/tactics-game-deploy.timer ]] ||
  die "Tactics systemd units already exist; stop recovery"
nginx -t

temp="$(mktemp -d)"
legacy=""
moved=0
installed_units=0
rollback() {
  local code=$?
  trap - EXIT
  if (( code != 0 && moved == 1 )); then
    log "Failure; restoring the original current/ directory."
    if [[ -L "$LIVE" ]]; then
      rm -f -- "$LIVE"
    fi
    if [[ ! -e "$LIVE" && ! -L "$LIVE" && -d "$legacy" ]]; then
      mv -T "$legacy" "$LIVE" ||
        log "CRITICAL: manually restore $legacy to $LIVE"
    else
      log "CRITICAL: unsafe restore state; inspect $LIVE and $legacy"
    fi
  fi
  if (( code != 0 && installed_units == 1 )); then
    systemctl disable --now tactics-game-deploy.timer >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/tactics-game-deploy.service \
      /etc/systemd/system/tactics-game-deploy.timer
    systemctl daemon-reload || true
  fi
  rm -rf -- "$temp"
  exit "$code"
}
trap rollback EXIT

response="$temp/response"
fetch() {
  local url="$1" needle="$2"
  curl -fSs --connect-timeout 5 --max-time 12 \
    -H "Host: $HOST" "http://127.0.0.1$url" -o "$response" ||
    die "Existing route $url is unavailable"
  grep -Eqi -- "$needle" "$response" ||
    die "Unexpected content at existing route $url"
}
fetch / 'id="rift-enter"'
fetch /games/rift/ '异界共振|Rift|RIFT'
fetch /health '"status":"ok"'
fetch /games/tactics/ '未命名战棋|TACTICAL CHRONICLES'
log "Preflight OK: all websites and Rift health are reachable."

# Confirm that the exact current main has passed GitHub's publishing CI
# BEFORE changing the site's live directory.
remote_main="$(timeout 45 git -C "$REPO" ls-remote origin refs/heads/main)" ||
  die "GitHub main unreachable; site preserved"
remote_site="$(timeout 45 git -C "$REPO" ls-remote origin refs/heads/site)" ||
  die "Published site branch unavailable; site preserved"
main_sha="$(printf '%s\n' "$remote_main" | cut -f1)"
site_sha="$(printf '%s\n' "$remote_site" | cut -f1)"
[[ "$main_sha" =~ ^[0-9a-f]{40}$ && "$site_sha" =~ ^[0-9a-f]{40}$ ]] ||
  die "Invalid GitHub commit SHA"
curl -fSLsS --connect-timeout 8 --max-time 25 --retry 2 --retry-delay 2 \
  -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/q894829927/Tactics-Game/actions/workflows/publish-site.yml/runs?event=push&branch=main&head_sha=$main_sha&per_page=50" \
  -o "$temp/ci.json" || die "GitHub CI API unavailable; site preserved"
approval="$(python3 "$SOURCE/scripts/check-publish.py" "$main_sha" "$temp/ci.json")" ||
  die "Cannot verify publishing CI"
[[ "$approval" == approved ]] ||
  die "main $main_sha is not approved ($approval); site preserved"
log "Approved source commit: $main_sha"

install -d -m 0755 "$BIN"
install -m 0755 "$SOURCE/scripts/deploy-ecs.sh" "$BIN/deploy.sh"
install -m 0644 "$SOURCE/scripts/check-publish.py" "$BIN/check-publish.py"

stamp="$(date -u +%Y%m%d-%H%M%S)"
legacy="$RELEASES/legacy-before-recovery-$stamp"
[[ ! -e "$legacy" && ! -L "$legacy" ]] || die "Legacy backup path already exists"
backup="/var/backups/tactics-game-recovery/$stamp"
install -d -m 0700 "$backup"
cp -p "$CONF" "$backup/rift.conf"
log "Nginx configuration left unchanged. Snapshot: $backup/rift.conf"

# A brief link switch is unavoidable when converting a real directory into
# a symlink. The original directory is MOVED, not deleted or overwritten.
mv -T "$LIVE" "$legacy"
moved=1
ln -s "$legacy" "$LIVE"
log "Original live game files preserved: $legacy"
bash "$BIN/deploy.sh"
[[ -L "$LIVE" && -s "$LIVE/.source-sha" &&
   "$(cat "$LIVE/.source-sha")" == "$main_sha" ]] ||
  die "Approved version was not activated"

install -m 0644 "$SOURCE/ops/tactics-game-deploy.service" \
  /etc/systemd/system/tactics-game-deploy.service
installed_units=1
install -m 0644 "$SOURCE/ops/tactics-game-deploy.timer" \
  /etc/systemd/system/tactics-game-deploy.timer
if [[ ! -e /etc/default/tactics-game-deploy ]]; then
  printf 'TACTICS_HOST=%s\n' "$HOST" > /etc/default/tactics-game-deploy
fi
systemctl daemon-reload
systemctl enable --now tactics-game-deploy.timer
systemctl is-enabled --quiet tactics-game-deploy.timer ||
  die "Tactics timer is not enabled"

log "SUCCESS: independent tactics-game-deploy.timer installed."
log "Currently serving main commit: $main_sha"
log "Original site backup: $legacy"
log "Nginx, Rift and Game-Portal configurations unchanged."
