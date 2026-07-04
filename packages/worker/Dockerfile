# Multi-stage build for the i2v background worker.
# Run from the repository root: docker build -f packages/worker/Dockerfile .
FROM node:20-slim AS build
WORKDIR /repo

COPY package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/worker/package.json packages/worker/package.json

RUN npm install --workspaces --include-workspace-root

COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/worker packages/worker

RUN npm run build --workspace=packages/shared \
  && npm run build --workspace=packages/db \
  && npm run build --workspace=packages/worker

FROM node:20-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/packages/db ./packages/db
COPY --from=build /repo/packages/worker ./packages/worker

WORKDIR /repo/packages/worker
CMD ["node", "dist/index.js"]
