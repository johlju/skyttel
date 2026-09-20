FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS dependencies

WORKDIR /app
RUN apk add --no-cache python3 make g++
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

FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    SKYTTEL_DATABASE_PATH=/data/skyttel.sqlite
WORKDIR /app
# Retain the trust store explicitly before removing the unused package manager
# and its dependencies. Native modules are installed in the matching base above.
RUN apk add --no-cache ca-certificates-bundle \
    && apk del apk-tools zlib \
    && mkdir /data && chown node:node /data \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    /usr/local/bin/corepack
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
