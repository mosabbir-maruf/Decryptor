# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app
# Install only production deps (excludes wrangler devDependency).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3030 \
    NODE_OPTIONS="--max-old-space-size=512"

WORKDIR /app

# Non-root user already exists as `node` in the base image.
# Copy installed production dependencies from the build stage.
COPY --from=build --chown=node:node /app/node_modules ./node_modules

# Copy application source (no build step — ESM, runs directly).
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node index.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${PORT:-3030}/health" >/dev/null 2>&1 || exit 1

CMD ["node", "index.js"]
