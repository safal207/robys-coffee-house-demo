#!/usr/bin/env bash
set -euo pipefail

printf 'Node: '
node --version
printf 'npm: '
npm --version

npm ci --no-audit --no-fund
npm run typecheck
