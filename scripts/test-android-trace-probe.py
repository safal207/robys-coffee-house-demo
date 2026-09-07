#!/usr/bin/env python3
"""Check trace insertion and fail-closed capture/collection behavior without Android."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import sys
sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('trace_probe', ROOT / 'scripts/prepare-android-trace-probe.py')
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    original = (ROOT / '.github/scripts/capture-android-launch.sh').read_text()
    (root / 'capture.sh').write_text(original)
    (root / 'fixture-manifest.json').write_text(json.dumps({'source_sha': '4' * 40}))
    probe.prepare(root)
    derived = (root / 'trace-capture.sh').read_text()
    assert derived.replace(probe.START, '') == original
    subprocess.run(['bash', '-n', str(root / 'trace-capture.sh')], check=True)
    subprocess.run(['bash', '-n', str(root / 'trace-runner.sh')], check=True)
    # Supply only the extra trace input directory to the original 14 controls.
    test = (ROOT / 'scripts/test-android-capture-contract.py').read_text().replace(
        '        work.mkdir()\n',
        "        work.mkdir()\n        (work / 'trace-evidence').mkdir()\n        (work / 'trace-evidence/config.pbtx').write_text('duration_ms: 60000')\n")
    (root / 'capture-controls.py').write_text(test)
    subprocess.run(['python3', str(root / 'capture-controls.py'), str(root / 'trace-capture.sh')], check=True)
    # Exercise the outer collector: a valid trace cannot hide native failure,
    # and a successful native capture cannot hide a failed trace retrieval.
    shims = root / 'bin'
    shims.mkdir()
    adb = shims / 'adb'
    adb.write_text('''#!/usr/bin/env python3
import os,sys
from pathlib import Path
if sys.argv[1]=='pull':
    if os.environ['PROBE_PULL']=='failure':sys.exit(9)
    Path(sys.argv[-1]).write_bytes(b'fake trace')
''')
    adb.chmod(0o755)
    for native, pull, expected in [(0, 'success', 0), (17, 'success', 17), (0, 'failure', 1), (17, 'failure', 17)]:
        (root / 'trace-capture.sh').write_text(f'#!/bin/bash\nexit {native}\n')
        env = dict(os.environ, PATH=str(shims)+os.pathsep+os.environ['PATH'], PROBE_PULL=pull)
        run = subprocess.run(['bash', 'trace-runner.sh'], cwd=root, env=env, capture_output=True, timeout=20)
        assert run.returncode == expected, (native, pull, expected, run.returncode)
        assert f'capture_exit={native}\n' in (root / 'trace-evidence/exits.txt').read_text()
print('Trace controls: 14 original capture cases + 4 independent collector outcomes passed.')
