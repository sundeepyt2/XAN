FROM oven/bun:1-alpine

WORKDIR /app

# Copy dependency files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile || bun install

# Copy source
COPY . .

# Expose port
EXPOSE 3000

# Dev mode with hot-reload
CMD ["bun", "run", "dev"]
