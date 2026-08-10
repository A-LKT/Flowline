# ── Stage 1: build frontend ──────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: build backend ───────────────────────────────────────────────────
# better-sqlite3 is a native addon; Alpine uses musl so we compile from source.
FROM node:22-alpine AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /build
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:22-alpine
# iputils provides /bin/ping for ICMP ping nodes
RUN apk add --no-cache iputils
WORKDIR /app
COPY --from=backend-build /build/dist      ./dist
COPY --from=backend-build /build/package.json ./package.json
COPY --from=backend-build /build/node_modules ./node_modules
COPY --from=frontend-build /build/dist     ./public
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
