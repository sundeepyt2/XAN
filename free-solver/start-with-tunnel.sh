#!/usr/bin/env bash
# free-solver/start-with-tunnel.sh
#
# Starts the XAN free solver + exposes it to the internet via Cloudflare
# Quick Tunnel — NO signup, NO card, NO email needed.
#
# Prerequisites:
#   - Node.js 18+ installed (https://nodejs.org/)
#   - Chrome dependencies (Linux: see README.md; macOS/Windows: usually fine)
#   - cloudflared installed (we'll auto-install it if missing)
#
# Usage:
#   ./start-with-tunnel.sh
#
# What it does:
#   1. Checks dependencies
#   2. Installs npm packages if needed
#   3. Downloads Chrome if needed
#   4. Starts the solver on port 3000
#   5. Starts cloudflared tunnel
#   6. Prints the public HTTPS URL — paste it into Vercel env vars
#
# To stop: Ctrl+C (kills both processes)

set -e

cd "$(dirname "$0")"

# Color codes for pretty output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  XAN Free Solver + Cloudflare Quick Tunnel${NC}"
echo -e "${BLUE}  Zero signup · Zero cost · Zero card${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo

# ─── Step 1: Check Node.js ────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js not found${NC}"
  echo "  Install from: https://nodejs.org/ (LTS version recommended)"
  exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION}${NC}"

# ─── Step 2: Install npm dependencies ─────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo
  echo -e "${YELLOW}→ Installing npm dependencies (first run only)...${NC}"
  npm install
  echo -e "${GREEN}✓ Dependencies installed${NC}"
else
  echo -e "${GREEN}✓ node_modules/ exists${NC}"
fi

# ─── Step 3: Download Chrome (puppeteer) ──────────────────────────────────
if [ ! -d "$HOME/.cache/puppeteer" ] && [ ! -d "/root/.cache/puppeteer" ]; then
  echo
  echo -e "${YELLOW}→ Downloading Chrome (first run only, ~150MB)...${NC}"
  npx puppeteer browsers install chrome
  echo -e "${GREEN}✓ Chrome downloaded${NC}"
else
  echo -e "${GREEN}✓ Chrome cache exists${NC}"
fi

# ─── Step 4: Install cloudflared if missing ───────────────────────────────
if ! command -v cloudflared &> /dev/null; then
  echo
  echo -e "${YELLOW}→ Installing cloudflared (Cloudflare tunnel client)...${NC}"
  # macOS: use Homebrew if available
  if command -v brew &> /dev/null; then
    brew install cloudflared
  # Linux: download the binary
  elif [ "$(uname)" = "Linux" ]; then
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64)  CF_ARCH="amd64" ;;
      aarch64) CF_ARCH="arm64" ;;
      armv7l)  CF_ARCH="arm" ;;
      *)       CF_ARCH="amd64" ;;
    esac
    curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
    sudo mv /tmp/cloudflared /usr/local/bin/cloudflared 2>/dev/null || mv /tmp/cloudflared ./cloudflared
    export PATH="$PATH:$(pwd)"
    # If sudo failed, use local binary
    if ! command -v cloudflared &> /dev/null; then
      chmod +x ./cloudflared
      echo -e "${YELLOW}  (Installed locally — using ./cloudflared)${NC}"
    fi
  # Windows (Git Bash / WSL): download .exe
  else
    echo -e "${RED}  Could not auto-install cloudflared.${NC}"
    echo "  Download from: https://github.com/cloudflare/cloudflared/releases/latest"
    echo "  Then re-run this script."
    exit 1
  fi
  echo -e "${GREEN}✓ cloudflared installed${NC}"
else
  echo -e "${GREEN}✓ cloudflared available${NC}"
fi

# ─── Step 5: Start the solver ─────────────────────────────────────────────
echo
echo -e "${BLUE}── Starting solver on port 3000 ──${NC}"
# Kill any existing solver on port 3000
if command -v lsof &> /dev/null; then
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

# Start solver in background, capture logs
npm start > /tmp/xan-solver.log 2>&1 &
SOLVER_PID=$!
echo -e "${GREEN}✓ Solver started (PID: $SOLVER_PID)${NC}"
echo "  Logs: /tmp/xan-solver.log (tail -f /tmp/xan-solver.log)"

# Wait for solver to be ready
echo -n "  Waiting for solver to be ready"
for i in {1..30}; do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo
    echo -e "${GREEN}✓ Solver ready${NC}"
    break
  fi
  echo -n "."
  sleep 1
  if [ $i -eq 30 ]; then
    echo
    echo -e "${RED}✗ Solver didn't start — check /tmp/xan-solver.log${NC}"
    exit 1
  fi
done

# ─── Step 6: Start Cloudflare Quick Tunnel ────────────────────────────────
echo
echo -e "${BLUE}── Starting Cloudflare Quick Tunnel ──${NC}"
echo -e "${YELLOW}  (No signup, no card, no email needed)${NC}"
echo

# cloudflared tunnel --url runs in foreground and prints the public URL
# We capture its output to extract the URL
CF_BIN="cloudflared"
if ! command -v cloudflared &> /dev/null; then
  CF_BIN="./cloudflared"
fi

# Start cloudflared, capture output to find the URL
$CF_BIN tunnel --url http://localhost:3000 > /tmp/xan-tunnel.log 2>&1 &
TUNNEL_PID=$!

echo -n "  Waiting for tunnel URL"
TUNNEL_URL=""
for i in {1..30}; do
  # cloudflared prints: "Your quick Tunnel has been created! Visit it at: https://...trycloudflare.com"
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/xan-tunnel.log 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    echo
    break
  fi
  echo -n "."
  sleep 1
  if [ $i -eq 30 ]; then
    echo
    echo -e "${RED}✗ Tunnel didn't start — check /tmp/xan-tunnel.log${NC}"
    cat /tmp/xan-tunnel.log
    exit 1
  fi
done

# ─── Print results ────────────────────────────────────────────────────────
echo
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Solver is live!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo
echo -e "${BLUE}Public URL:${NC}"
echo -e "  ${YELLOW}${TUNNEL_URL}${NC}"
echo
echo -e "${BLUE}Health check:${NC}"
echo -e "  ${YELLOW}${TUNNEL_URL}/health${NC}"
echo
echo -e "${BLUE}Test episode solve:${NC}"
echo -e "  ${YELLOW}${TUNNEL_URL}/allanime/episode?showId=srGrP23qJnjsHrRYD&episodeString=1&translationType=sub${NC}"
echo
echo -e "${BLUE}── Next steps ──${NC}"
echo -e "  1. Copy the Public URL above"
echo -e "  2. Go to Vercel → your XAN project → Settings → Environment Variables"
echo -e "  3. Add: NEXT_PUBLIC_FREE_SOLVER_URL = ${TUNNEL_URL}"
echo -e "  4. Redeploy Vercel"
echo -e "  5. Play any episode on your XAN site — 'Isekai2nd' sources will appear"
echo
echo -e "${YELLOW}⚠ Keep this terminal open while watching anime.${NC}"
echo -e "${YELLOW}  Closing it stops the solver + tunnel.${NC}"
echo
echo -e "${YELLOW}⚠ The URL changes when you restart this script.${NC}"
echo -e "${YELLOW}  Update NEXT_PUBLIC_FREE_SOLVER_URL in Vercel each time.${NC}"
echo -e "${YELLOW}  (For a stable URL, see free-solver/README.md → 'Stable URL' section)${NC}"
echo
echo -e "${BLUE}── Press Ctrl+C to stop ──${NC}"
echo

# Tail the tunnel log so the user sees traffic
# Also clean up both processes on exit
trap "echo; echo 'Stopping...'; kill $SOLVER_PID $TUNNEL_PID 2>/dev/null; exit 0" INT TERM
tail -f /tmp/xan-tunnel.log
