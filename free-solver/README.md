# XAN Free Solver — AllAnime Turnstile Captcha Solver

Solves AllAnime's Turnstile captcha for **$0** using Puppeteer + Stealth plugin.
Replaces the paid 2captcha/CapSolver approach.

## Three setup paths — pick what works for you

| Path | Cost | Card needed? | Signup needed? | Always-on? |
|------|------|--------------|----------------|------------|
| **A. Local + Cloudflare Quick Tunnel** (recommended) | $0 | ❌ No | ❌ No | ⚠️ Only while your computer is on |
| **B. Render.com free tier** | $0 | ❌ No (GitHub only) | ✓ GitHub | ✓ Yes (sleeps after 15 min, auto-wakes) |
| **C. Oracle Cloud Free Tier** | $0 | ✓ Yes | ✓ Oracle | ✓ Yes (always free, 1GB RAM) |

**If you have no credit/debit card, use Path A or Path B.**

---

## Path A: Local + Cloudflare Quick Tunnel (zero signup, zero card)

Run the solver on your own computer and expose it via Cloudflare's free Quick
Tunnel. No account, no card, no email — just one command.

### When to use this

- You watch anime on a computer you control (laptop/desktop)
- You don't want to sign up for anything
- You don't have a credit/debit card

### Prerequisites

1. **Node.js 18+** — install from https://nodejs.org/ (LTS version)
2. **Your XAN repo** cloned locally
3. **macOS, Linux, or Windows with Git Bash/WSL**

### One-command setup

```bash
cd XAN/free-solver
./start-with-tunnel.sh
```

The script will:
1. Install npm dependencies (first run only)
2. Download Chrome via Puppeteer (first run only, ~150MB)
3. Install `cloudflared` (Cloudflare's tunnel client — no signup needed)
4. Start the solver on port 3000
5. Start a Cloudflare Quick Tunnel → gives you a public HTTPS URL like
   `https://random-words.trycloudflare.com`
6. Print the URL + next steps

### After the script prints the URL

1. Copy the URL (e.g., `https://abc-def-ghi.trycloudflare.com`)
2. Go to **Vercel → your XAN project → Settings → Environment Variables**
3. Add: `NEXT_PUBLIC_FREE_SOLVER_URL` = `https://abc-def-ghi.trycloudflare.com`
4. Redeploy Vercel
5. Play any episode — "Isekai2nd" sources will appear in the Sources panel

### Important caveats

- **Keep the terminal open** while watching anime. Closing it stops the solver.
- **The URL changes** every time you restart the script. Update the Vercel env
  var each time. (For a stable URL, see "Stable URL" below.)
- **Your computer must be on** when you (or anyone else) wants to watch.
- **First play takes 20-40s** (Chrome cold-start + captcha solve). Cached plays
  within 5 min are instant.

### Manual setup (if the script doesn't work for you)

```bash
# 1. Install dependencies
cd XAN/free-solver
npm install
npx puppeteer browsers install chrome

# 2. Start the solver
npm start
# → Solver listens on http://localhost:3000

# 3. In a NEW terminal, install + run cloudflared
# macOS:
brew install cloudflared
# Linux:
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/

# Start tunnel:
cloudflared tunnel --url http://localhost:3000
# → Prints: "Your quick Tunnel has been created! Visit it at: https://..."
```

### Stable URL (optional, free)

The Quick Tunnel URL changes on every restart. For a stable URL:

1. Sign up for **Cloudflare** (email only — no card) at https://dash.cloudflare.com/sign-up
2. Get a free `*.workers.dev` subdomain: Cloudflare dashboard → Workers & Pages → set up subdomain
3. Install `cloudflared` and authenticate: `cloudflared tunnel login`
4. Create a named tunnel: `cloudflared tunnel create xan-solver`
5. Route your workers.dev subdomain to the tunnel
6. Run the tunnel: `cloudflared tunnel run xan-solver`

The URL will then be stable (e.g., `https://xan-solver.yourname.workers.dev`).
See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

---

## Path B: Render.com free tier (no card, GitHub signup only)

Render.com offers a free web service tier that:
- Doesn't require a credit card
- Stays always-on (sleeps after 15 min inactivity, auto-wakes on request)
- Gives a stable URL like `https://xan-solver.onrender.com`
- 512 MB RAM (tight for Chrome, but works with `--disable-dev-shm-usage`)

### Setup

1. **Fork the XAN repo** to your GitHub account (sign up at https://github.com — no card)

2. **Sign up for Render** at https://render.com using your GitHub account (no card)

3. **Create `free-solver/Dockerfile`** in your fork (we'll create it below)

4. **Create a new Web Service on Render**:
   - Connect your GitHub account
   - Select your XAN fork
   - Settings:
     - **Name:** `xan-solver`
     - **Region:** closest to you
     - **Runtime:** Docker
     - **Dockerfile Path:** `free-solver/Dockerfile`
     - **Instance Type:** Free

5. **Deploy** — Render builds the Docker image and starts the service

6. Wait for the URL (e.g., `https://xan-solver.onrender.com`)

7. **Set Vercel env var**:
   - `NEXT_PUBLIC_FREE_SOLVER_URL` = `https://xan-solver.onrender.com`

8. **Redeploy Vercel**

### Render caveats

- **Sleeps after 15 min inactivity** → first request after sleep takes ~30s to
  wake. Subsequent requests within 15 min are fast.
- **512 MB RAM** is tight for Chrome. The solver configures Chrome with
  `--disable-dev-shm-usage` to use `/tmp` instead of `/dev/shm`, which helps.
  If it crashes due to OOM, consider Path A (local) or Path C (Oracle).
- **750 hours/month free** = enough for 24/7 if you only run one service.

---

## Path C: Oracle Cloud Free Tier (requires card, always free)

**Only use this if you have a credit/debit card** — the card is required for
signup verification but is never charged.

### Step 1: Sign up for Oracle Cloud Free Tier

1. Go to **https://www.oracle.com/cloud/free/**
2. Click **Start for free**
3. Sign up with your email — you'll need to verify with a credit card, but **you
   will NOT be charged**. The Always Free tier is genuinely free forever.
4. Choose a region close to you (e.g., US East Ashburn, EU Frankfurt, AP Tokyo)
5. Wait for the account to be provisioned (~5-10 min)

### Step 2: Create a free VM instance

1. In the Oracle Cloud Console, go to **Compute → Instances → Create Instance**
2. Fill in:
   - **Name:** `xan-solver`
   - **Image:** Canonical Ubuntu 22.04
   - **Shape:** Click "Edit" → **VM.Standard.E2.1.Micro** (AMD, 1 OCPU, 1 GB RAM) — always free
   - **SSH keys:** Click "Save private key" and "Save public key" — keep these safe!
3. Click **Create**

Wait ~2 min for the VM to start. Note the **Public IP Address**.

### Step 3: SSH into the VM

```bash
chmod 400 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<VM_PUBLIC_IP>
```

### Step 4: Install Node.js + Chrome dependencies

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Chrome dependencies
sudo apt-get update
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libxshmfence1 \
  fonts-liberation xdg-utils

# 2GB swap (1GB RAM is tight for Chrome)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

node --version  # should print v20.x
```

### Step 5: Clone + install solver

```bash
git clone https://github.com/sundeepyt2/XAN.git
cd XAN/free-solver
npm install
npx puppeteer browsers install chrome

# Verify Chrome works
node -e "const p = require('puppeteer-extra'); const S = require('puppeteer-extra-plugin-stealth'); p.use(S()); (async()=>{const b=await p.launch({headless:'new',args:['--no-sandbox']}); console.log('Chrome OK'); await b.close();})()"
```

### Step 6: Start with PM2 (auto-restart)

```bash
sudo npm install -g pm2
pm2 start server.js --name xan-solver --max-memory-restart 800M
pm2 save
pm2 startup systemd
# PM2 will print a command starting with `sudo env PATH=...` — copy-paste and run it
```

### Step 7: Open port 3000 in the firewall

**Two layers:**

#### 7a. Oracle Cloud Security List
1. Oracle Cloud Console → **Networking → Virtual Cloud Networks** → your VCN
2. **Security Lists** → **Default Security List** → **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: TCP
   - Destination Port Range: `3000`
3. Click **Add Ingress Rules**

#### 7b. Linux iptables
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```

### Step 8: Test + configure Vercel

```bash
# From your laptop
curl http://<VM_IP>:3000/health
curl "http://<VM_IP>:3000/allanime/episode?showId=srGrP23qJnjsHrRYD&episodeString=1&translationType=sub"
```

Then set Vercel env var:
- `NEXT_PUBLIC_FREE_SOLVER_URL` = `http://<VM_IP>:3000`

### Keep the VM alive

Oracle Cloud may reclaim Always Free VMs that are idle for 7 days:

```bash
crontab -e
# Add:
0 * * * * curl -s http://localhost:3000/health > /dev/null
```

---

## How it works

```
User → XAN (Vercel) → Free Solver (your computer / Render / Oracle VM)
                        ↓
                    Launches headless Chrome
                    ↓
                    Visits allmanga.to/bangumi/<showId>/p-<ep>-<type>
                    ↓
                    Cloudflare "Just a moment..." auto-passes (stealth plugin)
                    ↓
                    AllAnime's Vue app renders Turnstile widget
                    ↓
                    Turnstile auto-solves (managed mode = no click needed)
                    ↓
                    Vue app fetches episode sources with captcha token
                    ↓
                    Solver intercepts the network response
                    ↓
                    Decrypts tobeparsed (AES-GCM) → returns sourceUrls
                    ↓
User ← XAN (Vercel) ← Free Solver
```

**Cost:** $0 (all three paths)
**Performance:** 20-40s first call, ~0s cached (5-min cache)
**Reliability:** ~80-90% (Cloudflare may occasionally block — XAN retries)

---

## Troubleshooting

### `Chrome OK` test fails with missing library errors (Linux)

Install additional Chrome dependencies:

```bash
sudo apt-get install -y libgtk-3-0 libnotify4 libxss1 libxtst6 \
  libsecret-1-0 libgbm1 libasound2t64
```

### Solver returns `"error": "Failed to capture sources"`

Cloudflare blocked the headless browser. Try:

1. **Wait 5 minutes and retry** — Cloudflare's bot detection resets periodically
2. **Restart the solver** — on local: Ctrl+C and re-run; on Render: redeploy;
   on Oracle: `pm2 restart xan-solver`
3. **Check the logs:**
   - Local: `tail -f /tmp/xan-solver.log`
   - Render: Render dashboard → Logs
   - Oracle: `pm2 logs xan-solver --lines 50`
4. Look for `Cloudflare challenge may not have passed` — if so, Cloudflare is
   blocking. This happens ~10-20% of the time.

### Solver is slow (>60s per request)

1. Check memory: `free -h` (Linux) or Activity Monitor (macOS)
2. Restart the solver to clear memory leaks
3. On Oracle: increase swap to 4GB
4. On Render: 512MB is the cap — if it OOMs, switch to Path A or C

### XAN shows no "Isekai2nd" sources

1. Check `NEXT_PUBLIC_FREE_SOLVER_URL` is set in Vercel
2. Check Vercel redeployed after adding the env var
3. Check the solver is reachable from Vercel:
   ```bash
   curl -v https://your-solver-url/health
   ```
4. Check Vercel function logs for timeout errors

### Tunnel URL changes on restart (Path A)

Use the "Stable URL" section above to set up a named Cloudflare Tunnel with a
fixed `*.workers.dev` URL. Requires free Cloudflare signup (email only).

### Render service keeps crashing

Chrome is OOMing under 512MB. Try:
1. Add `--single-process` to Chrome args in `server.js` (reduces memory)
2. Or switch to Path A (local — uses your computer's RAM)
3. Or switch to Path C (Oracle — 1GB RAM + 2GB swap)

---

## Files

- `server.js` — the solver server (Puppeteer + Express + AES-GCM decryption)
- `package.json` — dependencies (puppeteer, puppeteer-extra, stealth plugin, express)
- `start-with-tunnel.sh` — one-command setup script for Path A (local + tunnel)

## Cost summary

| Path | Cost |
|------|------|
| A. Local + Cloudflare Tunnel | $0/month (uses your existing computer) |
| B. Render.com free | $0/month (750 hours free) |
| C. Oracle Cloud Free Tier | $0/month forever (1GB RAM) |
| XAN on Vercel Hobby | $0 (existing) |
| **Total** | **$0/month** |

## Free vs paid comparison

| | Free Solver (any path) | Paid Solver (2captcha/CapSolver) |
|---|---|---|
| Cost | $0 | ~$0.80-$3 per 1000 solves |
| Setup time | 5-20 min | ~5 min |
| Reliability | ~80-90% (Cloudflare may block) | ~99% (paid solvers have anti-detect farms) |
| First-call latency | 20-40s | 30-120s |
| Cached latency | ~0s (5-min cache) | ~0s (4-min cache) |
| Maintenance | Restart if Cloudflare blocks | None |
| Best for | Personal use, budget-conscious | Production, high-traffic |
