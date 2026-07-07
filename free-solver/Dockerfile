# free-solver/Dockerfile
#
# Docker image for the XAN free solver — used by Render.com, Railway, or any
# container platform. Based on node:20-slim with Chrome dependencies.
#
# Render.com free tier (no card needed, GitHub signup only):
#   1. Fork XAN repo to your GitHub
#   2. Sign up at render.com with GitHub (no card)
#   3. New Web Service → connect your fork → Docker runtime
#   4. Dockerfile Path: free-solver/Dockerfile
#   5. Deploy → get stable URL like https://xan-solver.onrender.com
#   6. Set NEXT_PUBLIC_FREE_SOLVER_URL in Vercel to that URL
#
# Image size: ~600MB (Chrome is ~250MB, Node base ~150MB, deps ~200MB)

FROM node:20-slim

# Chrome dependencies (puppeteer needs these on Debian/Ubuntu)
RUN apt-get update && apt-get install -y --no-install-recommends \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
  libgtk-3-0 libnotify4 libxss1 libxtst6 libsecret-1-0 \
  fonts-liberation xdg-utils wget ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install npm dependencies first (better layer caching)
COPY free-solver/package*.json ./
RUN npm install --omit=dev

# Copy solver source
COPY free-solver/ ./

# Download Chrome via puppeteer
RUN npx puppeteer browsers install chrome

# Tell puppeteer where Chrome is
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# The path includes a version directory which we resolve at runtime
# server.js uses puppeteer's default lookup, so this isn't strictly needed

# Render.com exposes port 10000 by default
ENV PORT=10000
EXPOSE 10000

# Chrome needs --no-sandbox in containers (already set in server.js args)
CMD ["node", "server.js"]
