#!/usr/bin/env python3
"""Expose bounded raw diagnostic evidence in CI logs; never classify a cure."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
out = root / 'android-native/build/visual-evidence'
manifest = json.loads((root / 'fixture-manifest.json').read_text())
inventory = json.dumps(manifest['files'], sort_keys=True, separators=(',', ':')).encode()
print(json.dumps({'source_sha': manifest['source_sha'], 'web_files': len(manifest['files']),
                  'web_inventory_sha256': hashlib.sha256(inventory).hexdigest(),
                  'scope': 'diagnostic only; readiness, pixels and post-reveal trace require separate assessment'}))
for path in [out / 'capture-exit.txt', out / 'handoff-states.txt', out / 'webview-provider.txt',
             root / 'trace-evidence/exits.txt', root / 'trace-evidence/gfxinfo.txt']:
    print(f'FILE {path.relative_to(root)}')
    lines = path.read_text().splitlines()
    print('\n'.join(lines[:300]))
    if len(lines) > 300:
        print(f'LOG_EXCERPT_TRUNCATED total_lines={len(lines)}; full file retained in artifact')
log = (out / 'logcat.txt').read_text().splitlines()
delivery = [line for line in log if 'RobysPinned' in line]
print(f'PINNED_RESOURCE_DELIVERY total_lines={len(delivery)}')
print('\n'.join(delivery[:400]))
if len(delivery) > 400:
    print('LOG_EXCERPT_TRUNCATED; full delivery log retained in artifact')
