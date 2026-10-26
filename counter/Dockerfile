FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run verify:integrity && node scripts/package-counter-runtime.mjs /runtime

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production COUNTER_DB=/data/orders/counter.sqlite
COPY --from=build /runtime/ ./
# Startup initializes the root-owned volume and drops to uid/gid 1000 before
# opening the database or accepting HTTP requests.
CMD ["node", "counter/hosted.mjs"]
