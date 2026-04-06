# Multi-stage Dockerfile for @cuik/web (Next.js standalone)

# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/wallet/package.json ./packages/wallet/
COPY packages/editor/package.json ./packages/editor/
COPY packages/email/package.json ./packages/email/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/ ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=512"
RUN cd apps/web && TURBOPACK=0 npx next build

# Stage 3: Production runner
FROM node:22-alpine AS runner

# System deps for native modules (sharp requires libvips on Alpine)
RUN apk add --no-cache libc6-compat

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output (requires output: "standalone" in next.config)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Install sharp for Alpine (musl) — needed for Apple Wallet strip images.
# Also install passkit-generator so it resolves at runtime (serverExternalPackages).
RUN npm install --no-save --platform=linux --arch=x64 sharp@0.34.0 passkit-generator@3.5.0
ENV NEXT_SHARP_PATH=/app/node_modules/sharp

# Copy DB migrations (needed for pnpm db:migrate)
COPY --from=builder /app/packages/db/migrations ./packages/db/migrations
COPY --from=builder /app/packages/db/drizzle.config.ts ./packages/db/drizzle.config.ts

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
