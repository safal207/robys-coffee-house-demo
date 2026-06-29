import { readFile } from 'node:fs/promises';
import { validateSessionState } from './session-state-lib.mjs';

/** Return the required value following a CLI flag or throw a usage error. */
function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return value;
}

try {
  const args = process.argv.slice(2);
  const paths = [];
  let expectedHeadSha = process.env.SESSION_HEAD_SHA;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--head') {
      expectedHeadSha = readRequiredValue(args, index, '--head');
      index += 1;
    } else if (arg.startsWith('--head=')) {
      expectedHeadSha = arg.slice('--head='.length);
      if (!expectedHeadSha) throw new Error('Missing value for --head');
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      paths.push(arg);
    }
  }

  if (paths.length === 0) {
    throw new Error('Missing state path. Pass at least one sidecar or fixture file explicitly.');
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
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
