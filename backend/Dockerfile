# Multi-stage production Dockerfile for VahanGrid Backend
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app

# Run as non-privileged system user for container security
RUN addgroup -S vahangrid && adduser -S vahangrid -G vahangrid

COPY --chown=vahangrid:vahangrid package*.json ./
COPY --from=dependencies --chown=vahangrid:vahangrid /app/node_modules ./node_modules
COPY --chown=vahangrid:vahangrid database/ ./database/
COPY --chown=vahangrid:vahangrid src/ ./src/

USER vahangrid

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/health/liveness || exit 1

CMD ["node", "src/server.js"]
