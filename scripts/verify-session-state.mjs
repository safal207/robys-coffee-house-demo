import { readFile } from 'node:fs/promises';
import { validateSessionState } from './session-state-lib.mjs';

const args = process.argv.slice(2);
const paths = [];
let expectedHeadSha = process.env.SESSION_HEAD_SHA;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--head') {
    expectedHeadSha = args[index + 1];
    index += 1;
  } else if (arg.startsWith('--head=')) {
    expectedHeadSha = arg.slice('--head='.length);
  } else {
    paths.push(arg);
  }
}

if (paths.length === 0) {
  paths.push('qa/fixtures/session-state/pr-126-stale-review.json');
}

let failed = false;
for (const path of paths) {
  try {
    const state = JSON.parse(await readFile(path, 'utf8'));
    const errors = validateSessionState(state, { expectedHeadSha });
    if (errors.length > 0) {
      failed = true;
      console.error(`Session state invalid: ${path}`);
      for (const error of errors) console.error(`  - ${error}`);
    } else {
      console.log(`Session state valid: ${path} (${state.status}, seq=${state.sequence}, head=${state.head_sha})`);
    }
  } catch (error) {
    failed = true;
    console.error(`Unable to verify ${path}: ${error.message}`);
  }
}

if (failed) process.exitCode = 1;
