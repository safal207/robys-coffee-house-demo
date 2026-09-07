#!/usr/bin/env python3
"""Bounded read-only host CPU counters for QEMU threads; no process arguments/env."""
import json
import os
from pathlib import Path
import signal
import sys
import time

running = True


def stop(*_):
    global running
    running = False


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
deadline = time.monotonic() + 120
with open(sys.argv[1], 'w', buffering=1) as output:
    output.write(json.dumps({'ticksPerSecond': os.sysconf('SC_CLK_TCK'), 'cpuCount': os.cpu_count()}) + '\n')
    while running and time.monotonic() < deadline:
        threads = []
        for proc in Path('/proc').iterdir():
            if not proc.name.isdigit():
                continue
            try:
                if not (proc / 'comm').read_text().startswith('qemu-system'):
                    continue
                for task in (proc / 'task').iterdir():
                    raw = (task / 'stat').read_text()
                    comm, fields = raw.rsplit(') ', 1)
                    fields = fields.split()
                    threads.append({'pid': int(proc.name), 'tid': int(task.name),
                                    'name': comm.split('(', 1)[1], 'state': fields[0],
                                    'userTicks': int(fields[11]), 'systemTicks': int(fields[12])})
            except (FileNotFoundError, ProcessLookupError, PermissionError):
                continue
        output.write(json.dumps({'wallNs': time.time_ns(), 'monotonicNs': time.monotonic_ns(), 'threads': threads}) + '\n')
        time.sleep(1)
