FROM node:24.21.0-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS dependencies

WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY scripts/install-repository-npm.mjs ./scripts/install-repository-npm.mjs
RUN node scripts/install-repository-npm.mjs
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:24.21.0-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    SKYTTEL_DATABASE_PATH=/data/skyttel.sqlite
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node --input-type=module -e "const r = await fetch('http://127.0.0.1:' + process.env.PORT + '/healthz'); process.exit(r.ok ? 0 : 1)"
CMD ["node", "dist/server/index.js"]
