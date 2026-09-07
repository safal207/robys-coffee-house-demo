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
    # Exercise the outer collector, including a delayed writer. Pulling before
    # it closes, an empty trace or a failed wait must never count as collection.
    shims = root / 'bin'
    shims.mkdir()
    adb = shims / 'adb'
    adb.write_text('''#!/usr/bin/env python3
import os,sys,time
from pathlib import Path
mode=os.environ['PROBE_COLLECTION']
if sys.argv[1]=='shell' and sys.argv[2].startswith('while kill -0 '):
    if mode=='wait-failure':sys.exit(12)
    time.sleep(0.1)
    Path('writer-closed').write_text('closed')
if sys.argv[1]=='pull':
    if mode=='pull-failure':sys.exit(9)
    if mode not in ('wait-failure','missing-pid') and not Path('writer-closed').exists():sys.exit(19)
    Path(sys.argv[-1]).write_bytes(b'' if mode=='empty' else b'fake trace')
''')
    adb.chmod(0o755)
    for native in (0, 17):
        for mode in ('success', 'pull-failure', 'wait-failure', 'empty', 'missing-pid'):
            for path in ('writer-closed', 'trace-evidence/launch.pftrace', 'trace-evidence/perfetto-pid.txt'):
                (root / path).unlink(missing_ok=True)
            if mode != 'missing-pid':
                (root / 'trace-evidence/perfetto-pid.txt').write_text('1234\n')
            (root / 'trace-capture.sh').write_text(f'#!/bin/bash\nexit {native}\n')
            env = dict(os.environ, PATH=str(shims)+os.pathsep+os.environ['PATH'], PROBE_COLLECTION=mode)
            run = subprocess.run(['bash', 'trace-runner.sh'], cwd=root, env=env, capture_output=True, timeout=20)
            expected = native or (0 if mode == 'success' else 1)
            assert run.returncode == expected, (native, mode, expected, run.returncode)
            exits = dict(line.split('=') for line in (root / 'trace-evidence/exits.txt').read_text().splitlines())
            assert exits['capture_exit'] == str(native)
            assert exits['trace_wait_exit'] == ('12' if mode == 'wait-failure' else '1' if mode == 'missing-pid' else '0')
            assert exits['trace_pull_exit'] == ('9' if mode == 'pull-failure' else '0')
            assert exits['trace_nonempty'] == ('0' if mode in ('pull-failure', 'empty') else '1')
print('Trace controls: 14 original capture cases + 10 independent collector outcomes passed.')
