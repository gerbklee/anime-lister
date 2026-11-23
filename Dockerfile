# ---- 1. Build the React frontend ------------------------------------------
# The built frontend is plain HTML/JS, so it is always built natively on the
# build machine (fast), even when producing an ARM image.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- 1b. Build Atelier (the drawing-school site, served on port 3001) ------
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS atelier-build
WORKDIR /app/atelier
COPY atelier/package*.json ./
RUN npm install --no-audit --no-fund
COPY atelier/ ./
RUN npm run build

# ---- 2. Install server dependencies (better-sqlite3 may need build tools) --
FROM node:22-bookworm-slim AS server-deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---- 3. Runtime image -----------------------------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/ ./
COPY --from=client-build /app/client/dist ./public
COPY --from=atelier-build /app/atelier/dist ./public-atelier
RUN mkdir -p /data
VOLUME /data
EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
