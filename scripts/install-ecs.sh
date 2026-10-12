#!/usr/bin/env bash
# One-time ECS install for /games/tactics/ and separate tactics-game-deploy timer.
# Refuses unsafe Nginx layouts; backs up config and restores on failures.
set -Eeuo pipefail
umask 022
readonly CONF="/etc/nginx/conf.d/rift.conf"
readonly SNIPPET="/etc/nginx/snippets/tactics-game-routes.conf"
readonly GAME_WWW="/var/www/tactics-game"
readonly CODE_REPO="/opt/tactics-game/repo"
readonly REMOTE="https://github.com/q894829927/Tactics-Game.git"
readonly HOST="47.119.122.133"
log() { printf '[Tactics Install] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || die "Run as root on the ECS"
for cmd in git curl nginx python3 systemctl install tar; do
  command -v "$cmd" >/dev/null || die "Missing $cmd"
done
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
[[ "$(git -C "$SOURCE" branch --show-current)" == main ]] ||
  die "Install from Tactics-Game main branch"
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] || die "Dirty source checkout"
[[ "$(git -C "$SOURCE" remote get-url origin)" == "$REMOTE" ||
   "$(git -C "$SOURCE" remote get-url origin)" == git@github.com:q894829927/Tactics-Game.git ]] ||
  die "Unexpected Tactics-Game repository"
[[ -f "$CONF" && -f /etc/nginx/snippets/game-portal-routes.conf &&
   -L /var/www/rift/current && -L /var/www/game-portal/current ]] ||
  die "Expected the migrated Nginx/Rift/Game-Portal environment"
[[ ! -e "$SNIPPET" && ! -L "$SNIPPET" ]] ||
  die "Tactics Nginx snippet exists; do not install twice"
[[ ! -e /etc/systemd/system/tactics-game-deploy.service &&
   ! -e /etc/systemd/system/tactics-game-deploy.timer ]] ||
  die "Tactics systemd units already installed"
if grep -Fq 'tactics-game-routes.conf' "$CONF"; then
  die "Tactics site already installed into Nginx"
fi
nginx -t
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
for route in / /games/rift/ /health; do
  curl -fSs --max-time 12 -H "Host: $HOST" "http://127.0.0.1$route" \
    -o "$tmp" || die "Existing $route is unavailable; stop"
done
grep -q '"status":"ok"' "$tmp" || die "Rift backend returned unhealthy response"

python3 - "$CONF" <<'PY'
from pathlib import Path
import re,sys
config=Path(sys.argv[1]).read_text()
if len(re.findall(r"(?m)^[ \t]*server[ \t]*\{",config)) != 1:
    sys.exit("Expected exactly one Nginx server block; manual review required")
if re.search(r"(?m)^\s*location\s+(?:=\s*)?/games/tactics/?\b",config):
    sys.exit("Existing /games/tactics/ Nginx location; refusing conflict")
PY

# Download public site artifacts BEFORE changing Nginx.
install -d -m 0755 /opt/tactics-game/bin "$GAME_WWW/releases" /etc/nginx/snippets
if [[ -e "$CODE_REPO" && ! -d "$CODE_REPO/.git" ]]; then
  die "$CODE_REPO exists but is not a git repository"
fi
if [[ ! -d "$CODE_REPO/.git" ]]; then
  log "Downloading verified GitHub Actions-built site branch (no npm on ECS)"
  git clone --depth 1 --branch site "$REMOTE" "$CODE_REPO" ||
    die "GitHub site branch is not available yet; retry after workflow finishes"
fi
[[ "$(git -C "$CODE_REPO" remote get-url origin)" == "$REMOTE" ]] ||
  die "Existing site checkout uses unexpected remote"
install -m 0755 "$SOURCE/scripts/deploy-ecs.sh" /opt/tactics-game/bin/deploy.sh
install -m 0644 "$SOURCE/scripts/check-publish.py" /opt/tactics-game/bin/check-publish.py

stamp="$(date -u +%Y%m%d-%H%M%S)"
backup="/var/backups/tactics-game-install/$stamp"
mkdir -p "$backup"
chmod 700 "$backup"
cp -p "$CONF" "$backup/rift.conf"
log "Original Nginx backup: $backup/rift.conf"

changed=0
restore_on_error() {
  local status=$?
  trap - ERR
  if (( changed == 1 )); then
    log "Installation failed; restoring original Nginx configuration"
    cp -p "$backup/rift.conf" "$CONF"
    rm -f "$SNIPPET"
    nginx -t && systemctl reload nginx ||
      log "CRITICAL: Nginx rollback failed; restore $backup/rift.conf manually"
  fi
  exit "$status"
}
trap restore_on_error ERR

cat > "$SNIPPET" <<'NGINX'
# Independent, static-only Tactics-Game. Rift and Portal paths untouched.
location = /games/tactics { return 308 /games/tactics/; }
location ^~ /games/tactics/ {
    alias /var/www/tactics-game/current/;
    index index.html;
    try_files $uri $uri/ /games/tactics/index.html;
}
NGINX
changed=1
CONF="$CONF" SNIPPET="$SNIPPET" python3 - <<'PY'
from pathlib import Path
import os,re,tempfile
p=Path(os.environ["CONF"])
s=p.read_text()
match=list(re.finditer(r"(?m)^[ \t]*server[ \t]*\{",s))
if len(match)!=1: raise SystemExit("Nginx site changed unexpectedly")
i=match[0].end()
s=s[:i]+"\n    include "+os.environ["SNIPPET"]+";\n"+s[i:]
fd,temp=tempfile.mkstemp(prefix=".tactics-nginx-",dir=p.parent)
with os.fdopen(fd,"w") as out: out.write(s)
Path(temp).chmod(p.stat().st_mode & 0o777)
os.replace(temp,p)
PY
nginx -t
systemctl reload nginx

# Only after Nginx passes syntax checking, stage and verify the game files.
bash /opt/tactics-game/bin/deploy.sh
install -m 0644 "$SOURCE/ops/tactics-game-deploy.service" \
  /etc/systemd/system/tactics-game-deploy.service
install -m 0644 "$SOURCE/ops/tactics-game-deploy.timer" \
  /etc/systemd/system/tactics-game-deploy.timer
if [[ ! -e /etc/default/tactics-game-deploy ]]; then
  printf 'TACTICS_HOST=%s\n' "$HOST" > /etc/default/tactics-game-deploy
fi
systemctl daemon-reload
systemctl enable --now tactics-game-deploy.timer
changed=0
trap - ERR
log "SUCCESS: http://$HOST/games/tactics/"
log "Independent tactics-game-deploy.timer enabled (about every five minutes)"
log "Rift and Game-Portal timers/services unchanged"
log "Rollback snapshot: $backup/rift.conf"
