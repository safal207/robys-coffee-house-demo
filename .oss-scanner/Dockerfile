# Build context: the complete Roby's repository. The scanner expects /src.
# Digest resolved from the official library/node registry on 2026-10-09.
FROM node:22-bookworm@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/robys-playwright

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git python3 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY . /src
WORKDIR /src

# Fetch all npm packages and the locked Playwright browser while online.
# No live-site request, credentials, deployment or npm audit is needed offline.
RUN npm ci --no-audit --no-fund \
    && npx --no-install playwright install --with-deps chromium \
    && npm run check \
    && npm run verify:security \
    && node scripts/verify-analytics-destination-boundaries.mjs

CMD ["bash"]
