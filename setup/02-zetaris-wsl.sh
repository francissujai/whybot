#!/usr/bin/env bash
# WhyBot - Open Agent Hackathon 2026
# Step 2: install Zetaris locally in Docker (guide sections 1.3 - 1.6).
#
# Run inside the Ubuntu (WSL) terminal, with Docker Desktop running:
#   bash /mnt/c/<path to your clone>/setup/02-zetaris-wsl.sh
#
# Before running: zetaris-platform.zip must be in your Windows Downloads folder
# (from cloud.enterprise.zetaris.com/dashboard/download - the "Run locally" page),
# or set ZETARIS_ZIP=/mnt/c/.../zetaris-platform.zip.
# Re-runnable: finished steps are skipped.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WIN_HOME="$(wslpath "$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')" 2>/dev/null || true)"
ZIP_WIN="${ZETARIS_ZIP:-$WIN_HOME/Downloads/zetaris-platform.zip}"
INSTALL_DIR="$HOME/zetaris-platform"      # Linux filesystem = much faster than /mnt/c
REGISTRY="zetarishackathon.azurecr.io"

step() { printf "\n\033[1;36m== %s\033[0m\n" "$1"; }
warn() { printf "\033[1;33m%s\033[0m\n" "$1"; }
die()  { printf "\033[1;31m%s\033[0m\n" "$1"; exit 1; }

step "Checking prerequisites"
command -v docker >/dev/null || die "docker not found in WSL. Docker Desktop > Settings > Resources > WSL integration > enable Ubuntu."
docker info >/dev/null 2>&1   || die "Docker isn't running. Start Docker Desktop and try again."
docker compose version
command -v unzip >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq unzip; }
command -v git   >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq git; }
command -v python3 >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq python3; }

MEM_GB=$(docker info --format '{{.MemTotal}}' | awk '{printf "%.1f", $1/1024/1024/1024}')
CPUS=$(docker info --format '{{.NCPU}}')
echo "Docker has ${MEM_GB} GB memory and ${CPUS} CPUs (need 8 GB / 4 CPUs)."

step "Unpacking the Zetaris platform bundle"
if [ -d "$INSTALL_DIR" ]; then
  echo "Already unpacked at $INSTALL_DIR - skipping."
else
  [ -f "$ZIP_WIN" ] || die "Not found: $ZIP_WIN  -> download zetaris-platform.zip from the Zetaris 'Run locally' page first."
  unzip -q "$ZIP_WIN" -d "$HOME"
  [ -d "$INSTALL_DIR" ] || die "Unzipped, but no zetaris-platform folder appeared in $HOME - check the zip contents."
fi
cd "$INSTALL_DIR"

step "Registry sign-in"
if grep -q "$REGISTRY" "$HOME/.docker/config.json" 2>/dev/null; then
  echo "Already signed in to $REGISTRY."
else
  warn "Paste the username/password from the Zetaris 'Run locally' page when asked."
  warn "(If that page shows a different docker login command, press Ctrl+C and run that one instead.)"
  docker login "$REGISTRY"
fi

step "Preflight"
chmod +x ./*.sh 2>/dev/null || true
./preflight.sh || die "Preflight failed - fix each failed check (usually Docker memory/CPU), then re-run."

step "Laptop settings in the Zetaris .env (guide 1.4)"
[ -f .env ] || die "No .env inside $INSTALL_DIR - the bundle should include one."
setkv() {  # set KEY=VALUE, add if missing; never prints secrets
  local k="$1" v="$2"
  if grep -qE "^${k}=" .env; then sed -i "s|^${k}=.*|${k}=${v}|" .env; else echo "${k}=${v}" >> .env; fi
}
if [ ! -f .zetaris_started_once ]; then
  setkv ZSPARK_DRIVER_MEM 2g
  setkv ZSPARK_DRIVER_CORES 2
  setkv ZSPARK_MASTER_URL 'local[2]'
  setkv ZETARIS_API_MAX_HEAP 1g
  setkv UI_PORT 3000
  setkv ALLOWED_ORIGINS http://localhost:3000
  setkv GUI_URL http://localhost:3000
  setkv COMPOSE_PROFILES ''
  setkv ZETARIS_SEED_TPCH true
  echo "Laptop settings applied."
fi

for k in ZETARIS_ADMIN_EMAIL ZETARIS_ADMIN_PASSWORD ZETARIS_ADMIN_ORG; do
  val=$(grep -E "^${k}=" .env | head -1 | cut -d= -f2-)
  if [ -z "$val" ] && [ ! -f .zetaris_started_once ]; then
    warn "$k is empty. Open the file and set it BEFORE the first start:"
    warn "   nano $INSTALL_DIR/.env     (or edit it from Windows via \\\\wsl\$\\Ubuntu$INSTALL_DIR)"
    warn "Password rule: 8+ chars, lower + upper + digit + one of \$ @ ! % * ? &"
    die  "Then re-run this script."
  fi
done
chmod 600 .env
docker compose config --quiet && echo ".env is valid."

step "Downloading and starting Zetaris (~4 GB, 30-45 min the first time)"
docker compose pull
docker compose up -d
touch .zetaris_started_once

step "Waiting for one-time setup jobs (init, bootstrap) to finish"
for i in $(seq 1 60); do
  status=$(docker compose ps --all --format '{{.Service}} {{.State}} {{.ExitCode}}' 2>/dev/null || true)
  if echo "$status" | grep -qE '^bootstrap exited 0'; then echo "bootstrap finished."; break; fi
  if echo "$status" | grep -qE '^bootstrap exited [1-9]'; then docker compose logs --tail=80 bootstrap; die "bootstrap failed - see logs above."; fi
  printf "."; sleep 30
done
docker compose ps --all

step "Verify (expect 9 / 9 passed)"
sleep 60
./verify.sh || warn "Some checks failed. If setup is still running, wait a minute and run: cd $INSTALL_DIR && ./verify.sh"

step "Getting the Zetaris recipes repo"
RECIPES="$REPO_DIR/zetaris-getting-started"
[ -d "$RECIPES/.git" ] || git clone -q https://github.com/zetaris/getting-started.git "$RECIPES"
echo "Cloned to $RECIPES"

cat <<EOF

Next (in your browser):
  1. Open http://localhost:3000 and sign in with your admin email/password.
  2. SQL Editor:  SELECT 1 AS one;   -> one row
  3. Create an API key for your user (copy it immediately) and put it in openagenthackathon/.env

Stop / start later:   cd ~/zetaris-platform && docker compose stop   |   docker compose start
NEVER run 'docker compose down -v' unless you want to wipe everything.
EOF
