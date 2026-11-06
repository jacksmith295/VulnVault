FROM node:24-bookworm-slim AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/install-hooks.mjs ./scripts/install-hooks.mjs
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# These public placeholders satisfy build-time validation. Real configuration
# enters the running container through Compose, never through the build context.
RUN VULNVAULT_STANDALONE=1 \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-only-placeholder-secret-at-least-32-characters \
    BETTER_AUTH_URL=http://localhost:3000 \
    SMTP_HOST=localhost \
    SMTP_PORT=1025 \
    SMTP_FROM=build@example.invalid \
    npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
