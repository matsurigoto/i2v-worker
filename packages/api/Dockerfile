# Multi-stage build for the i2v API service.
# Run from the repository root: docker build -f packages/api/Dockerfile .
FROM node:20-slim AS build
WORKDIR /repo

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/api/package.json packages/api/package.json

RUN npm install --workspaces --include-workspace-root

COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/api packages/api

RUN npm run build --workspace=packages/shared \
  && npm run build --workspace=packages/db \
  && npm run build --workspace=packages/api

FROM node:20-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/packages/db ./packages/db
COPY --from=build /repo/packages/api ./packages/api

WORKDIR /repo/packages/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
